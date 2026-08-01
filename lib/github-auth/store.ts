import { useSyncExternalStore } from "react";
import { commands } from "@/lib/backend/commands";
import type { GitHubAuthStatus } from "@/lib/backend/types";

export type GitHubAuthState = GitHubAuthStatus & {
    isLoggingIn: boolean;
    isLoading: boolean;
    error: string | null;
};

const DEFAULT_STATE: GitHubAuthState = {
    loggedIn: false,
    username: null,
    avatarUrl: null,
    provider: "none",
    isLoggingIn: false,
    isLoading: true,
    error: null,
};

let state: GitHubAuthState = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();
let initialized = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): GitHubAuthState {
    return state;
}

function setState(patch: Partial<GitHubAuthState>) {
    state = { ...state, ...patch };
    emit();
}

function applyStatus(status: GitHubAuthStatus) {
    setState({
        ...status,
        isLoading: false,
        isLoggingIn: false,
        error: null,
    });
}

export async function refreshGitHubAuthStatus(): Promise<GitHubAuthStatus> {
    const status = await commands.githubAuthStatus();
    applyStatus(status);
    return status;
}

function clearPollTimer() {
    if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
}

export async function loginGitHub(): Promise<{ success: boolean; error: string | null }> {
    clearPollTimer();
    setState({ isLoggingIn: true, error: null });

    try {
        await commands.githubAuthLogin();
        const deadline = Date.now() + 5 * 60 * 1000;

        return await new Promise<{ success: boolean; error: string | null }>((resolve) => {
            const poll = async () => {
                if (Date.now() >= deadline) {
                    const error = "Sign-in cancelled or timed out";
                    setState({
                        isLoggingIn: false,
                        error,
                    });
                    void import("@/features/notifications").then(({ notify }) => {
                        notify.info("GitHub", error);
                    });
                    resolve({ success: false, error });
                    return;
                }

                try {
                    const status = await commands.githubAuthStatus();
                    if (status.loggedIn) {
                        applyStatus(status);
                        await commands.githubAuthEnsureGitHelper().catch(() => undefined);
                        resolve({ success: true, error: null });
                        return;
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    setState({
                        isLoggingIn: false,
                        error: message,
                    });
                    resolve({ success: false, error: message });
                    return;
                }

                pollTimer = setTimeout(() => {
                    void poll();
                }, 1500);
            };

            void poll();
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setState({
            isLoggingIn: false,
            error: message,
        });
        return { success: false, error: message };
    }
}

export async function logoutGitHub(username?: string): Promise<void> {
    clearPollTimer();
    try {
        await commands.githubAuthLogout(username);
        await refreshGitHubAuthStatus();
    } catch (error) {
        setState({
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

export function initGitHubAuth(): void {
    if (initialized || typeof window === "undefined") return;
    initialized = true;

    void refreshGitHubAuthStatus().catch(() => {
        setState({ isLoading: false, error: null });
    });

    if ("__TAURI_INTERNALS__" in window) {
        void import("@tauri-apps/api/event").then(({ listen }) => {
            void listen<GitHubAuthStatus>("github-auth-changed", (event) => {
                clearPollTimer();
                applyStatus(event.payload);
            });
        }).catch(() => undefined);
    }
}

export function useGitHubAuth(): GitHubAuthState {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

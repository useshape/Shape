"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { commands } from "@/lib/backend/commands";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import { getShapeAccessToken, useShapeAuth } from "@/lib/shape-auth/store";
import { notificationStore } from "@/features/notifications";

type InlineEditState = {
    top: number;
    left: number;
    width: number;
    filePath: string;
    selection: string;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
};

function stripCodeFences(raw: string): string {
    const trimmed = raw.trim();
    const match = trimmed.match(/^```[\w-]*\n?([\s\S]*?)\n?```$/);
    return match ? match[1].trim() : trimmed;
}

export function InlineEditHost() {
    const shapeAuth = useShapeAuth();
    const [state, setState] = useState<InlineEditState | null>(null);
    const [instruction, setInstruction] = useState("");
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const close = useCallback(() => {
        setState(null);
        setInstruction("");
        setLoading(false);
    }, []);

    useEffect(() => {
        const onOpen = (e: Event) => {
            const detail = (e as CustomEvent<InlineEditState>).detail;
            if (!detail?.filePath) return;
            setState(detail);
            setInstruction("");
            requestAnimationFrame(() => inputRef.current?.focus());
        };
        window.addEventListener("shape-inline-edit", onOpen as EventListener);
        return () => window.removeEventListener("shape-inline-edit", onOpen as EventListener);
    }, []);

    const submit = useCallback(async () => {
        if (!state || !instruction.trim() || loading) return;
        if (!shapeAuth.loggedIn) {
            notificationStore.add("Sign in to use inline edit", "warning", undefined, { autoHide: true });
            return;
        }
        const token = shapeAuth.accessToken ?? (await getShapeAccessToken());
        if (!token) return;

        setLoading(true);
        try {
            const settings = getSettings();
            const prompt = [
                `Edit the following selection in ${state.filePath}.`,
                `Return ONLY the replacement code for the selection — no fences, no explanation.`,
                "",
                `Instruction: ${instruction.trim()}`,
                "",
                "Selection:",
                state.selection,
            ].join("\n");

            const response = await commands.sendChatMessage(
                prompt,
                "auto",
                "Code",
                settings.ai.customSystemPrompt || undefined,
                settings.ai.customRules || undefined,
                token,
            );

            const replacement = stripCodeFences(response);
            window.dispatchEvent(
                new CustomEvent("shape-inline-edit-apply", {
                    detail: {
                        filePath: state.filePath,
                        replacement,
                        startLine: state.startLine,
                        endLine: state.endLine,
                        startColumn: state.startColumn,
                        endColumn: state.endColumn,
                    },
                }),
            );
            close();
        } catch (err) {
            notificationStore.add(
                "Inline edit failed",
                "error",
                err instanceof Error ? err.message : String(err),
                { autoHide: true },
            );
        } finally {
            setLoading(false);
        }
    }, [close, instruction, loading, shapeAuth.accessToken, shapeAuth.loggedIn, state]);

    if (!state) return null;

    return (
        <div
            className="fixed z-[200] rounded-xl border border-border-subtle bg-surface-3 p-3 shadow-lg"
            style={{
                top: state.top,
                left: state.left,
                width: Math.min(Math.max(state.width, 320), 520),
            }}
        >
            <div className="mb-2 flex items-center gap-2 text-sm text-text-secondary">
                <Icon name="auto_awesome" size={14} className="text-accent" />
                <span>Edit selection</span>
                <button
                    type="button"
                    className="ml-auto rounded p-1 text-text-muted hover:bg-panel-hover hover:text-text-primary"
                    onClick={close}
                >
                    <Icon name="close" size={14} />
                </button>
            </div>
            <textarea
                ref={inputRef}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.preventDefault();
                        close();
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submit();
                    }
                }}
                placeholder="Describe the change…"
                className="h-20 w-full resize-none rounded-lg border border-border-subtle bg-input-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus"
            />
            <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={close} disabled={loading}>
                    Cancel
                </Button>
                <Button variant="default" size="sm" onClick={() => void submit()} disabled={loading || !instruction.trim()}>
                    {loading ? "Editing…" : "Apply"}
                </Button>
            </div>
        </div>
    );
}

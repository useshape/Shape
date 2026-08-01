import { SHAPE_API_BASE } from "@/lib/shape-auth/api";

export type ShapeErrorEntry = {
    code: number;
    /** Human name for docs / internal reference; not shown as the primary UI label. */
    name: string;
    title: string;
    description: string;
};

/**
 * Stable numeric Shape error codes. Docs: `/docs/help/errors/{code}`.
 *
 * Ranges:
 * - 1xxx account / connectivity
 * - 2xxx cloud AI / billing
 * - 3xxx client trust / build
 * - 4xxx IDE workspace, git, LSP, search, terminal, updates
 * - 9xxx unknown
 */
export const SHAPE_ERRORS = {
    AUTH_REQUIRED: 1000,
    OFFLINE: 1001,
    SESSION_EXPIRED: 1002,
    SIGN_IN_FAILED: 1003,

    AI_PROVIDER: 2000,
    AI_CREDITS: 2001,
    AI_NETWORK: 2002,
    PAYMENT_REQUIRED: 2003,
    AI_RATE_LIMITED: 2100,

    UNOFFICIAL_BUILD: 3000,

    WORKSPACE_ACCESS: 4000,
    GIT_FAILED: 4100,
    LANGUAGE_SERVER: 4200,
    INDEX_SEARCH: 4300,
    TERMINAL: 4400,
    UPDATE_FAILED: 4500,

    UNKNOWN: 9000,
} as const;

export type ShapeErrorCode = (typeof SHAPE_ERRORS)[keyof typeof SHAPE_ERRORS];

const CATALOG: Record<number, ShapeErrorEntry> = {
    [SHAPE_ERRORS.AUTH_REQUIRED]: {
        code: SHAPE_ERRORS.AUTH_REQUIRED,
        name: "Auth required",
        title: "Sign in required",
        description: "Sign in to your Shape account to continue.",
    },
    [SHAPE_ERRORS.OFFLINE]: {
        code: SHAPE_ERRORS.OFFLINE,
        name: "Offline",
        title: "Offline",
        description:
            "Shape could not reach its servers. Check your connection, or try again shortly if the service is temporarily unavailable.",
    },
    [SHAPE_ERRORS.SESSION_EXPIRED]: {
        code: SHAPE_ERRORS.SESSION_EXPIRED,
        name: "Session expired",
        title: "Session expired",
        description: "Your Shape session is no longer valid. Sign in again to continue.",
    },
    [SHAPE_ERRORS.SIGN_IN_FAILED]: {
        code: SHAPE_ERRORS.SIGN_IN_FAILED,
        name: "Sign-in failed",
        title: "Sign-in failed",
        description: "Shape could not complete sign-in. Try again, or open the dashboard to finish login in the browser.",
    },
    [SHAPE_ERRORS.AI_PROVIDER]: {
        code: SHAPE_ERRORS.AI_PROVIDER,
        name: "AI provider failure",
        title: "AI request failed",
        description: "The model provider returned an error. Try again in a moment or switch models.",
    },
    [SHAPE_ERRORS.AI_CREDITS]: {
        code: SHAPE_ERRORS.AI_CREDITS,
        name: "Usage or credits",
        title: "Usage limit reached",
        description:
            "You have reached a usage or credit limit. Upgrade your plan or wait for the allowance to reset.",
    },
    [SHAPE_ERRORS.AI_NETWORK]: {
        code: SHAPE_ERRORS.AI_NETWORK,
        name: "Network timeout",
        title: "Connection problem",
        description: "Check your network and try again.",
    },
    [SHAPE_ERRORS.PAYMENT_REQUIRED]: {
        code: SHAPE_ERRORS.PAYMENT_REQUIRED,
        name: "Payment required",
        title: "Payment required",
        description:
            "Your subscription payment failed or is past due. Update billing to restore premium AI.",
    },
    [SHAPE_ERRORS.AI_RATE_LIMITED]: {
        code: SHAPE_ERRORS.AI_RATE_LIMITED,
        name: "Rate limited",
        title: "Too many requests",
        description: "The AI service rate-limited this request. Wait a moment and try again.",
    },
    [SHAPE_ERRORS.UNOFFICIAL_BUILD]: {
        code: SHAPE_ERRORS.UNOFFICIAL_BUILD,
        name: "Unofficial build",
        title: "Official build required",
        description: "Shape Cloud AI needs an official Shape release. Local editing still works.",
    },
    [SHAPE_ERRORS.WORKSPACE_ACCESS]: {
        code: SHAPE_ERRORS.WORKSPACE_ACCESS,
        name: "Workspace or file access",
        title: "Couldn’t access file",
        description:
            "Shape could not read or write a path in your project. Check permissions, that the path exists, and that nothing else has the file locked.",
    },
    [SHAPE_ERRORS.GIT_FAILED]: {
        code: SHAPE_ERRORS.GIT_FAILED,
        name: "Git failed",
        title: "Git operation failed",
        description:
            "A Git command failed. Check your remotes, credentials, and whether another process has the repository locked.",
    },
    [SHAPE_ERRORS.LANGUAGE_SERVER]: {
        code: SHAPE_ERRORS.LANGUAGE_SERVER,
        name: "Language server",
        title: "Language server error",
        description:
            "A language server crashed or failed to start. IntelliSense may be limited until it recovers.",
    },
    [SHAPE_ERRORS.INDEX_SEARCH]: {
        code: SHAPE_ERRORS.INDEX_SEARCH,
        name: "Index or search",
        title: "Search unavailable",
        description:
            "Project search or indexing failed. Re-open the folder or re-run indexing from Settings.",
    },
    [SHAPE_ERRORS.TERMINAL]: {
        code: SHAPE_ERRORS.TERMINAL,
        name: "Terminal",
        title: "Terminal error",
        description:
            "The integrated terminal could not start or run a command. Check your shell path in Settings.",
    },
    [SHAPE_ERRORS.UPDATE_FAILED]: {
        code: SHAPE_ERRORS.UPDATE_FAILED,
        name: "Update failed",
        title: "Update failed",
        description: "Shape could not check for or install an update. Try again from Help → Check for Updates.",
    },
    [SHAPE_ERRORS.UNKNOWN]: {
        code: SHAPE_ERRORS.UNKNOWN,
        name: "Unknown error",
        title: "Something went wrong",
        description: "An unexpected error occurred. Try again, or contact support if it continues.",
    },
};

export function getError(code: number): ShapeErrorEntry {
    return CATALOG[code] ?? CATALOG[SHAPE_ERRORS.UNKNOWN]!;
}

export function errorDocsUrl(code: number): string {
    const base = SHAPE_API_BASE.replace(/\/$/, "");
    return `${base}/docs/help/errors/${code}`;
}

export function listErrorCatalog(): ShapeErrorEntry[] {
    return Object.values(CATALOG).sort((a, b) => a.code - b.code);
}

/** Notify using catalog title/description; optional detail overrides the body. */
export function notifyCatalogError(
    code: number,
    detail?: string,
    options?: { title?: string },
): void {
    const entry = getError(code);
    const description =
        detail?.trim() ||
        entry.description;
    void import("@/features/notifications").then(({ notify }) => {
        notify.error(options?.title ?? entry.title, description, { code: entry.code });
    });
}

export function classifyAiError(raw: string): ShapeErrorEntry {
    const lower = raw.trim().toLowerCase();
    if (
        lower.includes("unofficial") ||
        lower.includes("build attestation") ||
        lower.includes("\"code\":3000") ||
        lower.includes("code\": 3000")
    ) {
        return getError(SHAPE_ERRORS.UNOFFICIAL_BUILD);
    }
    if (lower.includes("past due") || lower.includes("payment required") || lower.includes("invoice")) {
        return getError(SHAPE_ERRORS.PAYMENT_REQUIRED);
    }
    if (lower.includes("session expired") || lower.includes("invalid session") || lower.includes("revoked")) {
        return getError(SHAPE_ERRORS.SESSION_EXPIRED);
    }
    if (
        lower.includes("429")
        || lower.includes("rate limit")
        || lower.includes("too many requests")
        || lower.includes("ratelimit")
    ) {
        return getError(SHAPE_ERRORS.AI_RATE_LIMITED);
    }
    if (lower.includes("sign in")) return getError(SHAPE_ERRORS.AUTH_REQUIRED);
    if (
        lower.includes("usage") ||
        lower.includes("credit") ||
        lower.includes("billing") ||
        lower.includes("upgrade")
    ) {
        return getError(SHAPE_ERRORS.AI_CREDITS);
    }
    if (lower.includes("403") || lower.includes("forbidden")) {
        return getError(SHAPE_ERRORS.AI_CREDITS);
    }
    if (lower.includes("network") || lower.includes("fetch") || lower.includes("timeout")) {
        return getError(SHAPE_ERRORS.AI_NETWORK);
    }
    if (lower.includes("openrouter") || lower.includes("api error")) {
        return getError(SHAPE_ERRORS.AI_PROVIDER);
    }
    const unknown = getError(SHAPE_ERRORS.UNKNOWN);
    const detail = raw.trim();
    return {
        ...unknown,
        description: detail.length > 220 ? `${detail.slice(0, 220)}…` : detail || unknown.description,
    };
}

/** Map common IDE/git/file error strings to a catalog entry. */
export function classifyIdeError(raw: unknown): ShapeErrorEntry {
    const text = String(raw ?? "").trim();
    const lower = text.toLowerCase();

    if (
        lower.includes("git") ||
        lower.includes("index.lock") ||
        lower.includes("not a git repository") ||
        lower.includes("failed to push") ||
        lower.includes("failed to pull") ||
        lower.includes("merge conflict")
    ) {
        return withDetail(getError(SHAPE_ERRORS.GIT_FAILED), text);
    }
    if (
        lower.includes("language server") ||
        lower.includes("lsp") ||
        lower.includes("typescript server") ||
        lower.includes("initializeresult")
    ) {
        return withDetail(getError(SHAPE_ERRORS.LANGUAGE_SERVER), text);
    }
    if (
        lower.includes("ripgrep") ||
        lower.includes("codebase index") ||
        lower.includes("index failed") ||
        lower.includes("search failed")
    ) {
        return withDetail(getError(SHAPE_ERRORS.INDEX_SEARCH), text);
    }
    if (lower.includes("terminal") || lower.includes("pty") || lower.includes("shell")) {
        return withDetail(getError(SHAPE_ERRORS.TERMINAL), text);
    }
    if (
        lower.includes("permission") ||
        lower.includes("access is denied") ||
        lower.includes("file not found") ||
        lower.includes("no such file") ||
        lower.includes("os error 2") ||
        lower.includes("os error 5") ||
        lower.includes("failed to read") ||
        lower.includes("failed to save") ||
        lower.includes("failed to write") ||
        lower.includes("failed to create") ||
        lower.includes("failed to delete") ||
        lower.includes("failed to rename")
    ) {
        return withDetail(getError(SHAPE_ERRORS.WORKSPACE_ACCESS), text);
    }

    return withDetail(getError(SHAPE_ERRORS.UNKNOWN), text);
}

function withDetail(entry: ShapeErrorEntry, detail: string): ShapeErrorEntry {
    const trimmed = detail.trim();
    if (!trimmed) return entry;
    return {
        ...entry,
        description: trimmed.length > 220 ? `${trimmed.slice(0, 220)}…` : trimmed,
    };
}

/** Session-scoped: offline toast fires at most once per app process. */
let offlineLaunchNotified = false;

export function notifyOfflineOnce(): void {
    if (offlineLaunchNotified) return;
    offlineLaunchNotified = true;
    const entry = getError(SHAPE_ERRORS.OFFLINE);
    void import("@/features/notifications").then(({ notify }) => {
        notify.warn(entry.title, entry.description, { code: entry.code });
    });
}

/** Reset only for tests. */
export function resetOfflineLaunchNotifiedForTests(): void {
    offlineLaunchNotified = false;
}

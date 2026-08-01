export interface FormattedError {
    title: string;
    message: string;
    hint?: string;
}

function firstLine(text: string): string {
    return text.split(/\r?\n/).find((l) => l.trim())?.trim() ?? text.trim();
}

function extractLines(text: string, prefix: string): string[] {
    return text
        .split(/\r?\n/)
        .filter((l) => l.trim().toLowerCase().startsWith(prefix))
        .map((l) => l.replace(/^[^:]+:\s*/i, "").trim());
}

/** Turn raw git / command / gh output into a concise title + message + optional hint. */
export function formatCommandError(raw: unknown, fallbackTitle = "Error"): FormattedError {
    let text = String(raw ?? "").trim();
    if (!text) return { title: fallbackTitle, message: "An unknown error occurred." };

    // Tauri / JS often wrap as "Error: …" or include JSON API bodies from `gh api`.
    text = text.replace(/^Error:\s*/i, "");
    const jsonMessage = text.match(/"message"\s*:\s*"([^"]+)"/);
    if (jsonMessage?.[1]) {
        text = jsonMessage[1];
    }
    // Strip common CLI prefixes: `gh: …`, `HTTP 403: …`
    text = text.replace(/^gh:\s*/i, "").trim();

    const lower = text.toLowerCase();

    if (
        lower.includes("must have admin rights") ||
        lower.includes("admin rights to repository") ||
        (lower.includes("403") && (lower.includes("admin") || lower.includes("forbidden")))
    ) {
        return {
            title: "Permission denied",
            message: "You need admin access on this repository to do that.",
            hint: "Ask a repository admin for access, or sign in with an account that has it.",
        };
    }

    if (lower.includes("http 403") || lower.includes("status 403") || lower.includes("resource not accessible by integration") || lower.includes("resource not accessible")) {
        return {
            title: "Permission denied",
            message: "GitHub refused this action for your account.",
            hint: "Check repository permissions and that you are signed in to the right GitHub account.",
        };
    }

    if (
        (lower.includes("still in progress") && lower.includes("logs")) ||
        lower.includes("logs will be available when it is complete")
    ) {
        return {
            title: "Run still in progress",
            message: "Logs will appear when this job finishes.",
            hint: "Use Reload after the run completes, or turn on Live updates.",
        };
    }

    if (lower.includes("not logged into github") || lower.includes("gh auth login") || lower.includes("to get started with github cli")) {
        return {
            title: "Sign in required",
            message: "Connect GitHub to use Actions and related features.",
        };
    }

    const errors = extractLines(text, "error");
    const fatals = extractLines(text, "fatal");
    const hints = extractLines(text, "hint");

    const primary = errors[0] ?? fatals[0] ?? firstLine(text);
    const title = fatals[0]
        ? fatals[0].replace(/\.$/, "")
        : fallbackTitle;

    const message = errors[0] ?? fatals[0] ?? primary;
    const hint = hints.length > 0 ? hints.join(" ") : undefined;

    return { title, message, hint };
}

export function formatGitError(raw: unknown): FormattedError {
    return formatCommandError(raw, "Git Error");
}

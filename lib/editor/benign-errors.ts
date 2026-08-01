/**
 * Errors that are safe to suppress in the Shape IDE shell (Monaco tab lifecycle, LSP noise, etc.).
 */

function errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}

function errorStack(err: unknown): string {
    if (err instanceof Error) return err.stack ?? "";
    return "";
}

/** Monaco 0.49+ can throw in IndentGuidesOverlay during hidden/remounted editors. */
export function isBenignMonacoError(err: unknown): boolean {
    const msg = errorMessage(err);
    const stack = errorStack(err);

    // StandaloneTextModelService rejects when a language feature asks for a URI
    // that isn't an open editor model (common when leaving the editor / settings).
    if (msg === "Model not found" || msg.includes("Model not found")) {
        return true;
    }

    if (
        msg.includes("Cannot read properties of null") &&
        (msg.includes("'left'") || msg.includes("reading 'left'"))
    ) {
        if (
            stack.includes("IndentGuidesOverlay") ||
            stack.includes("prepareRender") ||
            stack.includes("EditorRenderingCoordinator") ||
            stack.includes("monaco-editor") ||
            stack.includes("viewParts_")
        ) {
            return true;
        }
        // Minified stacks may omit class names — still benign when message matches.
        if (!stack || stack.includes("AnimationFrame") || stack.includes("animationFrame")) {
            return true;
        }
    }

    if (msg.includes("IndentGuidesOverlay") || msg.includes("prepareRender")) {
        return true;
    }

    return false;
}

export function isBenignLspError(err: unknown): boolean {
    const msg = errorMessage(err);
    return (
        msg.includes("Client is not running") ||
        msg.includes("can't be stopped") ||
        msg.includes("[LSP]") ||
        msg.includes("Language Client") ||
        msg.includes("Language Client client") ||
        msg.includes("Server initialization failed") ||
        msg.includes("Could not find a valid TypeScript installation") ||
        msg.includes("typescript Language Client client") ||
        msg.includes("Request initialize failed") ||
        msg.includes("File not in index") ||
        msg.includes("Pending response rejected since connection got disposed") ||
        msg.includes("connection to server is erroring") ||
        msg.includes("couldn't create connection to server") ||
        msg.includes("connection got disposed") ||
        msg.includes("Connection to server got closed") ||
        msg.includes("Server will not be restarted") ||
        msg.includes("code = 1006") ||
        msg.includes("Shutting down server") ||
        msg.includes("AbstractContextKeyService has been disposed")
    );
}

export function isBenignOsPathError(text: string): boolean {
    return (
        text.includes("os error 2") ||
        text.includes("os error 3") ||
        text.includes("os error 123") ||
        text.includes("cannot find the file") ||
        text.includes("The system cannot find the path specified")
    );
}

/** WebView2 on Windows when posting to a destroyed HWND during iframe reload. */
export function isBenignWebViewPostMessageError(text: string): boolean {
    return (
        text.includes("PostMessage failed") ||
        text.includes("0x80070578") ||
        text.includes("Invalid window handle") ||
        text.includes("messages queue full")
    );
}

function formatLogArg(arg: unknown): string {
    if (arg instanceof Error) {
        return `${errorMessage(arg)} ${errorStack(arg)}`;
    }
    return errorMessage(arg);
}

export function isSuppressedLog(args: unknown[]): boolean {
    try {
        const combined = args.map((arg) => formatLogArg(arg)).join(" ");
        if (combined && isBenignLspError(combined)) return true;
        if (combined && isBenignMonacoError(combined)) return true;
        if (combined && isBenignOsPathError(combined)) return true;
        if (combined && isBenignWebViewPostMessageError(combined)) return true;

        const firstArg = args[0];
        const msg = typeof firstArg === "string" ? firstArg : JSON.stringify(firstArg);

        if (msg) {
            if (isBenignLspError(msg)) return true;
            if (isBenignMonacoError(msg)) return true;
            if (isBenignOsPathError(msg)) return true;
            if (isBenignWebViewPostMessageError(msg)) return true;
        }

        if (args.length > 1) {
            const secondArg = typeof args[1] === "string" ? args[1] : String(args[1]);
            if (
                secondArg.includes("File not in index") ||
                secondArg.includes("Server initialization failed") ||
                secondArg.includes("Could not find a valid TypeScript installation") ||
                secondArg.includes("Request initialize failed") ||
                isBenignOsPathError(secondArg) ||
                isBenignLspError(secondArg)
            ) {
                return true;
            }
        }

        for (const arg of args) {
            if (arg instanceof Error && (isBenignMonacoError(arg) || isBenignLspError(arg))) {
                return true;
            }
        }
    } catch {
        // ignore stringify errors
    }
    return false;
}

export function isSuppressedWindowError(event: ErrorEvent): boolean {
    const msg = String(event.message || event.error?.message || "");
    const stack = String(event.error?.stack || "");

    if (isBenignLspError(msg)) return true;
    if (isBenignMonacoError(event.error ?? msg)) return true;

    if (
        msg.includes("Cannot read properties of null") &&
        (stack.includes("IndentGuidesOverlay") ||
            stack.includes("prepareRender") ||
            stack.includes("EditorRenderingCoordinator") ||
            stack.includes("monaco-editor"))
    ) {
        return true;
    }

    return false;
}

export function isSuppressedRejection(reason: unknown): boolean {
    const msg = errorMessage(reason);
    return isBenignLspError(msg) || isBenignMonacoError(reason);
}

/** Install global filters as early as possible (instrumentation-client + client-layout). */
export function installBenignErrorFilters(): void {
    if (typeof window === "undefined") return;
    if ((window as unknown as { __shapeBenignErrorsInstalled?: boolean }).__shapeBenignErrorsInstalled) {
        return;
    }
    (window as unknown as { __shapeBenignErrorsInstalled?: boolean }).__shapeBenignErrorsInstalled = true;

    const originalConsoleError = console.error.bind(console);
    const originalConsoleWarn = console.warn.bind(console);
    const originalConsoleLog = console.log.bind(console);

    let errorOverrideActive = false;
    console.error = (...args: unknown[]) => {
        if (errorOverrideActive) {
            originalConsoleError(...args);
            return;
        }
        if (isSuppressedLog(args)) return;
        errorOverrideActive = true;
        originalConsoleError(...args);
        errorOverrideActive = false;
    };
    console.warn = (...args: unknown[]) => {
        if (!isSuppressedLog(args)) originalConsoleWarn(...args);
    };
    console.log = (...args: unknown[]) => {
        if (!isSuppressedLog(args)) originalConsoleLog(...args);
    };

    const handleError = (event: ErrorEvent) => {
        if (!isSuppressedWindowError(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
        if (!isSuppressedRejection(event.reason)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    };

    window.addEventListener("error", handleError, true);
    window.addEventListener("unhandledrejection", handleRejection, true);
}

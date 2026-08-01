/* eslint-disable @typescript-eslint/no-explicit-any */
import { statusProgress } from "@/lib/status-progress";
import { pathToFileUri } from "@/lib/path-uri";
import { getSettings } from "@/lib/settings";
import { createTauriLspTransports } from "./tauri-transport";

export { pathToFileUri };

export interface LspOptions {
    language: string;
    documentSelector: string[];
    workspacePath: string;
    typescriptTsdk?: string | null;
    typescriptFallbackPath?: string | null;
}

function cacheKey(workspacePath: string, language: string): string {
    return `${workspacePath}:${language}`;
}

let lspErrorNotified = false;

function reportLspError(message: string) {
    import("@/features/output/store").then(({ appendOutput }) => {
        appendOutput("LSP", message);
    });
    if (!lspErrorNotified) {
        lspErrorNotified = true;
        import("@/features/notifications").then(({ notify }) => {
            notify.error("Language Server", message, { code: 4200 });
        });
    }
}

function isCommandAlreadyExistsError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /already exists/i.test(msg) && /command/i.test(msg);
}

let commandOverwritePatched = false;

/**
 * vscode-languageclient registers executeCommandProvider ids (e.g. `_typescript.*`)
 * into ExtHostCommands on initialize. If a prior client was abandoned mid-start,
 * those ids linger and the next `client.start()` throws
 * `command '_typescript.applyRefactoring' already exists`.
 *
 * Patch ExtHostCommands so re-registration replaces the stale entry instead of throwing.
 * This is the durable fix — retries alone cannot clear the private `_commands` map.
 */
async function installCommandOverwritePatch(): Promise<void> {
    if (commandOverwritePatched) return;
    try {
        // Deep path into monaco-vscode-api — no public types; load at runtime only.
        const mod = await (Function(
            'return import("@codingame/monaco-vscode-api/vscode/src/vs/workbench/api/common/extHostCommands.js")',
        )() as Promise<{ ExtHostCommands?: { prototype: Record<string, unknown> } }>);
        const Ctor = mod.ExtHostCommands;
        const proto = Ctor?.prototype as
            | {
                  registerCommand: (...args: unknown[]) => unknown;
                  __shapeOverwritePatched?: boolean;
              }
            | undefined;
        if (!proto || proto.__shapeOverwritePatched) {
            commandOverwritePatched = true;
            return;
        }
        const original = proto.registerCommand;
        proto.registerCommand = function (
            this: { _commands: Map<string, unknown> },
            ...args: unknown[]
        ) {
            const id = args[1];
            if (typeof id === "string" && this._commands?.has(id)) {
                this._commands.delete(id);
            }
            return original.apply(this, args);
        };
        proto.__shapeOverwritePatched = true;
        commandOverwritePatched = true;
    } catch {
        // Soft-fail — lifecycle mutex still prevents most races.
        commandOverwritePatched = true;
    }
}

/**
 * Durable LSP manager:
 * - One MonacoLanguageClient per (workspace, language) for the session
 * - Global mutex so dispose/start never race across editor mounts / project switches
 * - Never abandon a starting client (that leaves registered commands behind)
 * - Connection keys use LSP language id (typescript), not Monaco id (javascript)
 */
export class LspClientManager {
    private static connections = new Map<string, any>();
    private static pendingConnections = new Map<string, Promise<any>>();
    private static transports = new Map<
        string,
        { reader: { dispose(): void; markIntentionalShutdown(): void }; writer: { dispose(): void; markIntentionalShutdown(): void } }
    >();
    private static restartAttempts = new Map<string, number>();
    /** Serializes all connect/dispose work process-wide. */
    private static gate: Promise<void> = Promise.resolve();
    /** Bumped on disposeAll so in-flight connects abort after teardown. */
    private static generation = 0;
    private static isInitialized = false;
    /** True when codingame initialize could not run (standalone Monaco already booted). */
    private static servicesDegraded = false;
    private static intentionalShutdownKeys = new Set<string>();
    /** Single-flight so concurrent callers (app boot, Monaco setup, editor mount) share one initialize attempt. */
    private static initPromise: Promise<void> | null = null;
    /**
     * vscode-api bootstrap must finish (or fail) before Monaco mounts.
     * Keep this short — a long hang blanks the editor with only
     * "Starting language services..." in the status bar.
     */
    private static readonly SERVICES_INIT_TIMEOUT_MS = 12_000;
    private static readonly SERVICES_READY_TIMEOUT_MS = 4_000;
    /** Language client start is independent of editor paint; allow more time. */
    private static readonly LANGUAGE_CLIENT_START_TIMEOUT_MS = 60_000;
    /** Fail fast: one attempt, then degrade and let the editor open. */
    private static readonly MAX_SERVICE_INIT_ATTEMPTS = 1;

    private static runExclusive<T>(fn: () => Promise<T>): Promise<T> {
        const next = this.gate.then(fn, fn);
        this.gate = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    }

    public static async getClient(options: LspOptions): Promise<any> {
        if (typeof window === "undefined") return null;

        const key = cacheKey(options.workspacePath, options.language);

        if (this.connections.has(key)) {
            const existing = this.connections.get(key)!;
            if (existing.isRunning?.() !== false) {
                return existing;
            }
            await this.disposeForKey(key);
        }

        if (this.pendingConnections.has(key)) {
            return this.pendingConnections.get(key)!;
        }

        const gen = this.generation;
        const promise = this.runExclusive(async () => {
            if (gen !== this.generation) {
                throw new Error("LSP connect cancelled (workspace changed)");
            }
            if (this.connections.has(key)) {
                return this.connections.get(key)!;
            }
            return this.connectWithRetry(options, key, 0, gen);
        });

        this.pendingConnections.set(key, promise);
        try {
            return await promise;
        } finally {
            if (this.pendingConnections.get(key) === promise) {
                this.pendingConnections.delete(key);
            }
        }
    }

    private static async connectWithRetry(
        options: LspOptions,
        key: string,
        attempt: number,
        gen: number,
    ): Promise<any> {
        try {
            return await this.createClient(options, key, gen);
        } catch (err) {
            if (gen !== this.generation) throw err;

            const retryable =
                attempt < 2 &&
                !this.servicesDegraded &&
                (isCommandAlreadyExistsError(err) ||
                    (err instanceof Error && /timed out|Unknown reason|No LSP running/i.test(err.message)));

            if (retryable) {
                await this.forceCleanupKey(key);
                await installCommandOverwritePatch();
                try {
                    const { commands } = await import("@/lib/backend");
                    await commands.lspStop(options.language);
                } catch {
                    /* ignore */
                }
                await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
                if (gen !== this.generation) throw err;
                return this.connectWithRetry(options, key, attempt + 1, gen);
            }

            // Degraded / unavailable is expected when vscode-api lost the race — no toast.
            const msg = err instanceof Error ? err.message : String(err);
            if (!/unavailable|not ready|already initialized/i.test(msg)) {
                reportLspError(`Failed to start ${options.language} language service: ${msg}`);
            } else {
                import("@/features/output/store").then(({ appendOutput }) => {
                    appendOutput("LSP", `${options.language}: ${msg}`);
                });
            }
            throw err;
        }
    }

    /**
     * Single-flight, authoritative entry point for vscode-api bootstrap.
     * Every caller (client-layout boot, Monaco setup, per-file LSP connect)
     * awaits this same promise instead of racing independent attempts.
     */
    private static async ensureServices(): Promise<void> {
        if (this.isInitialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = this.runServiceInitWithRetry();
        try {
            await this.initPromise;
        } finally {
            this.initPromise = null;
        }
    }

    /** Bounded retry with backoff — a single slow/timed-out attempt should not permanently degrade LSP. */
    private static async runServiceInitWithRetry(): Promise<void> {
        statusProgress.push("lsp-init", "Starting language services...");
        try {
            for (let attempt = 1; attempt <= this.MAX_SERVICE_INIT_ATTEMPTS; attempt++) {
                try {
                    await this.withTimeout(
                        this.initServicesOnce(),
                        "Language service init",
                        this.SERVICES_INIT_TIMEOUT_MS,
                    );
                    this.isInitialized = true;
                    return;
                } catch (err) {
                    if (attempt >= this.MAX_SERVICE_INIT_ATTEMPTS) {
                        this.isInitialized = true;
                        this.servicesDegraded = true;
                        console.warn("[LSP] service init failed after retry, continuing without language services:", err);
                        return;
                    }
                    console.warn(`[LSP] service init attempt ${attempt} failed, retrying:`, err);
                    await new Promise((r) => setTimeout(r, 1_500 * attempt));
                }
            }
        } finally {
            statusProgress.remove("lsp-init");
        }
    }

    /** One attempt at vscode-api bootstrap. Resolves (without throwing) once the outcome — ready or unrecoverably degraded — is known. */
    private static async initServicesOnce(): Promise<void> {
        const { servicesInitialized, waitServicesReady } = await import(
            "@codingame/monaco-vscode-api/lifecycle"
        );

        // If StandaloneServices already ran, either codingame init finished
        // (barrier will open — success) or only Monaco standalone booted
        // (barrier never opens — degrade LSP, keep editor). Retrying this
        // branch cannot help, so it never throws — it resolves degraded.
        const waitReady = () =>
            Promise.race([
                waitServicesReady(),
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () => reject(new Error("vscode-api ready timeout")),
                        this.SERVICES_READY_TIMEOUT_MS,
                    ),
                ),
            ]);

        if (servicesInitialized) {
            try {
                await waitReady();
                await installCommandOverwritePatch();
            } catch {
                this.servicesDegraded = true;
            }
            return;
        }

        await import("vscode/localExtensionHost");
        const { initialize } = await import("@codingame/monaco-vscode-api/services");
        const getThemeServiceOverride = (
            await import("@codingame/monaco-vscode-theme-service-override")
        ).default;
        const getMonarchServiceOverride = (
            await import("@codingame/monaco-vscode-monarch-service-override")
        ).default;

        try {
            await initialize({
                ...getThemeServiceOverride(),
                ...getMonarchServiceOverride(),
            } as any);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!/already initialized/i.test(msg)) throw err;
        }

        try {
            await waitReady();
        } catch {
            this.servicesDegraded = true;
            return;
        }
        await import("@codingame/monaco-vscode-theme-defaults-default-extension");
        await installCommandOverwritePatch();
    }

    /**
     * Best-effort vscode-api init. Never throws — editor bootstrap must not depend on this.
     */
    public static async warmupServices(): Promise<void> {
        if (typeof window === "undefined") return;
        try {
            await this.ensureServices();
            if (!this.servicesDegraded) {
                const { refreshShapeMonacoTheme } = await import("@/lib/ui/monaco-theme");
                refreshShapeMonacoTheme();
            }
        } catch (err) {
            this.isInitialized = true;
            this.servicesDegraded = true;
            statusProgress.remove("lsp-init");
            console.warn("[LSP] service init skipped:", err);
        }
    }

    /**
     * Editor paint must not wait forever. Call when the Monaco boot budget expires
     * so the status bar drops "Starting language services..." even if codingame
     * initialize is still winding down in the background.
     */
    public static releaseEditorBootBarrier(): void {
        statusProgress.remove("lsp-init");
    }

    /** Whether monaco-languageclient can attach (vscode defaultApi ready). */
    public static isLanguageServiceAvailable(): boolean {
        return this.isInitialized && !this.servicesDegraded;
    }

    private static withTimeout<T>(promise: Promise<T>, label: string, ms: number): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
            promise
                .then((v) => {
                    clearTimeout(timer);
                    resolve(v);
                })
                .catch((e) => {
                    clearTimeout(timer);
                    reject(e);
                });
        });
    }

    private static async createClient(options: LspOptions, key: string, gen: number): Promise<any> {
        await this.ensureServices();
        if (this.servicesDegraded) {
            // Editor works; monaco-languageclient cannot attach. Skip quietly.
            return null;
        }
        if (gen !== this.generation) {
            throw new Error("LSP connect cancelled (workspace changed)");
        }

        statusProgress.push(`lsp-${options.language}`, `Starting ${options.language}...`);

        let client: any = null;
        try {
            const { MonacoLanguageClient } = await import("monaco-languageclient");
            const transports = await createTauriLspTransports(options.language);
            this.transports.set(key, transports);

            const workspaceUri = pathToFileUri(options.workspacePath);

            const initializationOptions =
                options.language === "typescript" && options.typescriptTsdk
                    ? {
                          tsserver: {
                              path: options.typescriptTsdk,
                              ...(options.typescriptFallbackPath
                                  ? { fallbackPath: options.typescriptFallbackPath }
                                  : {}),
                          },
                      }
                    : options.language === "python"
                      ? await (async () => {
                            const { resolvePythonInterpreter } = await import(
                                "@/lib/python-interpreters"
                            );
                            const configured = getSettings().python?.interpreterPath ?? "auto";
                            const resolved = await resolvePythonInterpreter(
                                configured,
                                options.workspacePath,
                            );
                            // Strip shell quoting — LSP wants a bare filesystem path.
                            const pythonPath = resolved.replace(/^"(.*)"$/, "$1");
                            return { python: { pythonPath } };
                        })()
                      : undefined;

            const cleanup = () => {
                this.connections.delete(key);
                const t = this.transports.get(key);
                if (t) {
                    t.reader.markIntentionalShutdown();
                    t.writer.markIntentionalShutdown();
                    try {
                        t.reader.dispose();
                    } catch {
                        /* ignore */
                    }
                    try {
                        t.writer.dispose();
                    } catch {
                        /* ignore */
                    }
                    this.transports.delete(key);
                }
            };

            this.intentionalShutdownKeys.delete(key);

            client = new (MonacoLanguageClient as any)({
                name: `${options.language} Language Client`,
                messageTransports: { reader: transports.reader, writer: transports.writer },
                clientOptions: {
                    documentSelector: options.documentSelector,
                    traceServer: "off",
                    initializationOptions,
                    outputChannel: {
                        append: (text: string) => {
                            import("@/features/output/store").then(({ appendOutput }) => {
                                appendOutput("LSP", text);
                            });
                        },
                        appendLine: (text: string) => {
                            import("@/features/output/store").then(({ appendOutput }) => {
                                appendOutput("LSP", text);
                            });
                        },
                        clear: () => {},
                        show: () => {
                            window.dispatchEvent(new Event("shape-open-output"));
                        },
                        hide: () => {},
                        dispose: () => {},
                        name: "LSP",
                        replace: () => {},
                    } as any,
                    middleware: {
                        handleNotifications: (next: any, method: string, params: any) => {
                            if (method === "$/typescriptVersion" && params?.version) {
                                window.dispatchEvent(
                                    new CustomEvent("shape-typescript-version", {
                                        detail: String(params.version),
                                    }),
                                );
                            }
                            return next(method, params);
                        },
                    },
                    errorHandler: {
                        error: () => ({ action: 2 /* ErrorAction.Continue */ }),
                        closed: () => {
                            const intentional = this.intentionalShutdownKeys.has(key);
                            cleanup();
                            if (intentional) {
                                this.intentionalShutdownKeys.delete(key);
                                return { action: 1 /* CloseAction.DoNotRestart */ };
                            }
                            const attempts = this.restartAttempts.get(key) ?? 0;
                            if (attempts < 2 && gen === this.generation) {
                                this.restartAttempts.set(key, attempts + 1);
                                window.setTimeout(() => {
                                    void this.getClient(options).catch(() => {});
                                }, 1000 * (attempts + 1));
                            }
                            return { action: 1 /* CloseAction.DoNotRestart */ };
                        },
                    },
                    workspaceFolder: {
                        uri: workspaceUri,
                        name: "workspace",
                        index: 0,
                    },
                },
            });

            const originalStop = client.stop.bind(client);
            client.stop = async () => {
                this.intentionalShutdownKeys.add(key);
                transports.reader.markIntentionalShutdown();
                transports.writer.markIntentionalShutdown();

                const startedAt = Date.now();
                while (
                    (client.state === 1 || String(client.state).toLowerCase().includes("starting")) &&
                    Date.now() - startedAt < 15_000
                ) {
                    await new Promise((r) => setTimeout(r, 50));
                }

                try {
                    return await originalStop();
                } catch {
                    /* ignore */
                } finally {
                    cleanup();
                }
            };

            await this.withTimeout(
                client.start(),
                `${options.language} language service`,
                this.LANGUAGE_CLIENT_START_TIMEOUT_MS,
            );
            if (gen !== this.generation) {
                await client.stop();
                throw new Error("LSP connect cancelled (workspace changed)");
            }
            this.connections.set(key, client);
            this.restartAttempts.delete(key);
            return client;
        } catch (err) {
            this.intentionalShutdownKeys.add(key);
            if (client) {
                try {
                    await client.stop();
                } catch {
                    const t = this.transports.get(key);
                    if (t) {
                        t.reader.markIntentionalShutdown();
                        t.writer.markIntentionalShutdown();
                        try {
                            t.reader.dispose();
                        } catch {
                            /* ignore */
                        }
                        try {
                            t.writer.dispose();
                        } catch {
                            /* ignore */
                        }
                        this.transports.delete(key);
                    }
                }
            } else {
                const t = this.transports.get(key);
                if (t) {
                    t.reader.markIntentionalShutdown();
                    t.writer.markIntentionalShutdown();
                    try {
                        t.reader.dispose();
                    } catch {
                        /* ignore */
                    }
                    try {
                        t.writer.dispose();
                    } catch {
                        /* ignore */
                    }
                    this.transports.delete(key);
                }
            }
            try {
                const { commands } = await import("@/lib/backend");
                await commands.lspStop(options.language);
            } catch {
                /* ignore */
            }
            throw err;
        } finally {
            statusProgress.remove(`lsp-${options.language}`);
        }
    }

    private static async forceCleanupKey(key: string): Promise<void> {
        this.intentionalShutdownKeys.add(key);
        const client = this.connections.get(key);
        if (client) {
            try {
                await client.stop();
            } catch {
                /* ignore */
            }
            this.connections.delete(key);
        }
        const transport = this.transports.get(key);
        if (transport) {
            transport.reader.markIntentionalShutdown();
            transport.writer.markIntentionalShutdown();
            try {
                transport.reader.dispose();
            } catch {
                /* ignore */
            }
            try {
                transport.writer.dispose();
            } catch {
                /* ignore */
            }
            this.transports.delete(key);
        }
        this.pendingConnections.delete(key);
        this.restartAttempts.delete(key);
    }

    public static async disposeForKey(key: string): Promise<void> {
        await this.runExclusive(async () => {
            await this.forceCleanupKey(key);
        });
    }

    public static async disposeAll() {
        if (typeof window === "undefined") return;

        this.generation += 1;
        await this.runExclusive(async () => {
            const keys = new Set([
                ...this.connections.keys(),
                ...this.transports.keys(),
                ...this.pendingConnections.keys(),
            ]);
            for (const key of keys) {
                await this.forceCleanupKey(key);
            }
            this.connections.clear();
            this.pendingConnections.clear();
            this.restartAttempts.clear();
            this.transports.clear();
            this.intentionalShutdownKeys.clear();
            lspErrorNotified = false;
        });
    }
}

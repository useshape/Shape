/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tauri-backed JSON-RPC transport for Monaco Language Client.
 * Replaces vscode-ws-jsonrpc / WebSocket proxy with:
 *   frontend → commands.lspSend → LSP stdin
 *   LSP stdout → Tauri `lsp-message` event → frontend
 */
import type { DataCallback, Disposable, Message, MessageReader, MessageWriter } from "vscode-jsonrpc/browser";
import { AbstractMessageReader, AbstractMessageWriter } from "vscode-jsonrpc/browser";
import { commands } from "@/lib/backend";

type LspMessagePayload = {
    language: string;
    message: string;
};

type UnlistenFn = () => void;

export class TauriLspMessageReader extends AbstractMessageReader implements MessageReader {
    private callback: DataCallback | null = null;
    private unlisten: UnlistenFn | null = null;
    private closed = false;
    private intentionalShutdown = false;
    private readonly language: string;
    private ready: Promise<void>;
    private resolveReady!: () => void;

    constructor(language: string) {
        super();
        this.language = language;
        this.ready = new Promise((resolve) => {
            this.resolveReady = resolve;
        });
        void this.attach();
    }

    /** Resolves once the Tauri event listener is attached. */
    whenReady(): Promise<void> {
        return this.ready;
    }

    listen(callback: DataCallback): Disposable {
        this.callback = callback;
        return {
            dispose: () => {
                this.callback = null;
            },
        };
    }

    private async attach() {
        if (this.closed) {
            this.resolveReady();
            return;
        }
        try {
            const { listen } = await import("@tauri-apps/api/event");
            this.unlisten = await listen<LspMessagePayload>("lsp-message", (event) => {
                if (this.closed || !this.callback) return;
                if (event.payload?.language !== this.language) return;
                try {
                    const msg = JSON.parse(event.payload.message) as Message;
                    this.callback(msg);
                } catch (err) {
                    this.fireError(err);
                }
            });
        } catch (err) {
            this.fireError(err);
        } finally {
            this.resolveReady();
        }
    }

    /** Tear down without signaling connection-close to the language client. */
    markIntentionalShutdown(): void {
        this.intentionalShutdown = true;
    }

    dispose(): void {
        if (this.closed) {
            super.dispose();
            return;
        }
        this.closed = true;
        this.callback = null;
        this.unlisten?.();
        this.unlisten = null;
        if (!this.intentionalShutdown) {
            try {
                this.fireClose();
            } catch {
                /* reader already closed / no listeners */
            }
        }
        super.dispose();
    }
}

export class TauriLspMessageWriter extends AbstractMessageWriter implements MessageWriter {
    private readonly language: string;
    private errorCount = 0;
    private closed = false;
    private intentionalShutdown = false;
    private writeChain: Promise<void> = Promise.resolve();

    constructor(language: string) {
        super();
        this.language = language;
    }

    write(msg: Message): Promise<void> {
        if (this.closed) {
            return Promise.reject(new Error("LSP writer is closed"));
        }

        const body = JSON.stringify(msg);
        this.writeChain = this.writeChain
            .then(async () => {
                await commands.lspSend(this.language, body);
                this.errorCount = 0;
            })
            .catch((err) => {
                this.errorCount += 1;
                this.fireError(err, msg, this.errorCount);
                throw err;
            });

        return this.writeChain;
    }

    /** Tear down without signaling connection-close to the language client. */
    markIntentionalShutdown(): void {
        this.intentionalShutdown = true;
    }

    end(): void {
        if (this.closed) return;
        this.closed = true;
        if (!this.intentionalShutdown) {
            this.fireClose();
        }
    }

    dispose(): void {
        if (!this.closed) {
            this.closed = true;
            if (!this.intentionalShutdown) {
                this.fireClose();
            }
        }
        super.dispose();
    }
}

export async function createTauriLspTransports(language: string) {
    const reader = new TauriLspMessageReader(language);
    const writer = new TauriLspMessageWriter(language);
    await reader.whenReady();
    return { reader, writer };
}

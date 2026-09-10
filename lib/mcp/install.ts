import { listen } from "@tauri-apps/api/event";
import { commands } from "@/lib/backend";

/** One completion per callback URL — multiple UI listeners share the same promise. */
const inflight = new Map<string, Promise<string>>();

function completeOAuthOnce(callbackUrl: string): Promise<string> {
    let pending = inflight.get(callbackUrl);
    if (!pending) {
        pending = commands.mcpCompleteOAuth(callbackUrl).finally(() => {
            window.setTimeout(() => inflight.delete(callbackUrl), 8_000);
        });
        inflight.set(callbackUrl, pending);
    }
    return pending;
}

export async function initMcpOAuthListener(
    onComplete?: (serverId: string) => void | Promise<void>,
): Promise<() => void> {
    const unlisten = await listen<string>("shape-mcp-oauth-callback", async (event) => {
        try {
            const serverId = await completeOAuthOnce(event.payload);
            await onComplete?.(serverId);
        } catch {
            /* ignore */
        }
    });
    return unlisten;
}

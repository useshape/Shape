import { listen } from "@tauri-apps/api/event";
import { commands } from "@/lib/backend";

export async function initMcpOAuthListener(
    onComplete?: () => void | Promise<void>,
): Promise<() => void> {
    const unlisten = await listen<string>("shape-mcp-oauth-callback", async (event) => {
        try {
            await commands.mcpCompleteOAuth(event.payload);
            await onComplete?.();
        } catch {
            /* ignore */
        }
    });
    return unlisten;
}

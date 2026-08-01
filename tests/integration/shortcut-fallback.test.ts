import { describe, expect, it, vi } from "vitest";
import { dispatchShortcutAction } from "@/lib/ui/shortcut-actions";
import { mockInvoke, invokeMocked } from "../helpers/tauri";

describe("shortcut fallback integration", () => {
    it("invokes handle_shortcut when action returns false", async () => {
        const handler = vi.fn((cmd, args) => {
            if (cmd === "handle_shortcut") return null;
        });
        mockInvoke(handler);
        expect(dispatchShortcutAction("Close Tab", "Ctrl+W")).toBe(false);
        await invokeMocked("handle_shortcut", { shortcut: "Ctrl+W" });
        expect(handler).toHaveBeenCalledWith("handle_shortcut", { shortcut: "Ctrl+W" });
    });
});

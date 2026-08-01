import { describe, expect, it } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { invoke } from "@tauri-apps/api/core";

describe("tabs", () => {
    it("open", () => {
        const layout: CustomEvent[] = [];
        const terminal: CustomEvent[] = [];
        window.addEventListener("shape-layout-toggle", (e) => layout.push(e as CustomEvent));
        window.addEventListener("shape-terminal-shortcut", (e) => terminal.push(e as CustomEvent));

        window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
        window.dispatchEvent(new CustomEvent("shape-terminal-shortcut", { detail: { action: "open" } }));

        expect(layout[0]?.detail).toEqual({ id: "panel", value: true });
        expect(terminal[0]?.detail).toEqual({ action: "open" });
    });

    it("new", () => {
        const terminal: CustomEvent[] = [];
        window.addEventListener("shape-terminal-shortcut", (e) => terminal.push(e as CustomEvent));
        window.dispatchEvent(new CustomEvent("shape-terminal-shortcut", { detail: { action: "new" } }));
        expect(terminal[0]?.detail).toEqual({ action: "new" });
    });

    it("shells", async () => {
        mockIPC((cmd) => {
            if (cmd === "pty_available_shells") {
                return [
                    { id: "powershell", label: "Windows PowerShell", path: "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" },
                    { id: "cmd", label: "Command Prompt", path: "C:/Windows/System32/cmd.exe" },
                ];
            }
        });

        const shells = await invoke<Array<{ id: string; label: string }>>("pty_available_shells");
        expect(shells.map((shell) => shell.id)).toEqual(["powershell", "cmd"]);
    });
});

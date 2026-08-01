import { describe, expect, it, vi } from "vitest";
import {
    DEFAULT_SETTINGS,
    isLspLanguageEnabled,
    resolveDefaultTerminalShell,
} from "@/lib/settings";
import { withSettings } from "../helpers/settings";

describe("settings lsp", () => {
    it("respects typescript toggle", () => {
        withSettings({ lsp: { ...DEFAULT_SETTINGS.lsp, typescript: false } });
        expect(isLspLanguageEnabled("typescript")).toBe(false);
    });

    it("respects css toggle", () => {
        withSettings({ lsp: { ...DEFAULT_SETTINGS.lsp, css: false } });
        expect(isLspLanguageEnabled("css")).toBe(false);
    });

    it("defaults unknown languages to enabled", () => {
        expect(isLspLanguageEnabled("emmet", DEFAULT_SETTINGS)).toBe(true);
    });

    it("uses explicit powershell setting", () => {
        withSettings({ terminal: { ...DEFAULT_SETTINGS.terminal, defaultShell: "powershell" } });
        expect(resolveDefaultTerminalShell()).toBe("powershell");
    });

    it("uses explicit cmd setting", () => {
        withSettings({ terminal: { ...DEFAULT_SETTINGS.terminal, defaultShell: "cmd" } });
        expect(resolveDefaultTerminalShell()).toBe("cmd");
    });

    it("uses explicit git-bash setting", () => {
        withSettings({ terminal: { ...DEFAULT_SETTINGS.terminal, defaultShell: "git-bash" } });
        expect(resolveDefaultTerminalShell()).toBe("gitbash");
    });

    it("auto resolves to powershell on windows", () => {
        withSettings({ terminal: { ...DEFAULT_SETTINGS.terminal, defaultShell: "auto" } });
        vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
        expect(resolveDefaultTerminalShell()).toBe("powershell");
        vi.unstubAllGlobals();
    });
});

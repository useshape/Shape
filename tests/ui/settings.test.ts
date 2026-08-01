import { describe, expect, it } from "vitest";
import { getMonacoOptionsFromSettings, updateSettingSection } from "@/lib/settings";

describe("settings", () => {
    it("monaco", () => {
        updateSettingSection("editor", { fontFamily: "Fira Code", fontSize: 18 });
        const options = getMonacoOptionsFromSettings();
        expect(options.fontFamily).toBe("Fira Code");
        expect(options.fontSize).toBe(18);
    });

    it("guides", () => {
        updateSettingSection("editor", { showIndentGuides: true, showBracketGuides: true });
        const options = getMonacoOptionsFromSettings();
        expect(options.guides.indentation).toBe(true);
        expect(options.guides.highlightActiveIndentation).toBe(true);
        expect(options.guides.bracketPairs).toBe(true);
    });

    it("emit", () => {
        const events: string[] = [];
        const handler = () => events.push("changed");
        window.addEventListener("shape-settings-changed", handler);
        updateSettingSection("editor", { fontSize: 16 });
        window.removeEventListener("shape-settings-changed", handler);
        expect(events).toContain("changed");
    });

    it("persist", () => {
        updateSettingSection("editor", { tabSize: 4, fontSize: 15 });
        const parsed = JSON.parse(localStorage.getItem("shape-settings-v1")!);
        expect(parsed.editor.tabSize).toBe(4);
        expect(parsed.editor.fontSize).toBe(15);
    });
});

import { describe, expect, it } from "vitest";
import { getSettings, updateSettingSection } from "@/lib/settings";
import { resetSettings } from "../helpers/settings";

describe("settings merge", () => {
    it("deep merges git blame without dropping siblings", () => {
        resetSettings();
        updateSettingSection("git", { blame: { enabled: true } });
        const settings = getSettings();
        expect(settings.git.blame.enabled).toBe(true);
        expect(settings.git.autoFetch).toBe(false);
    });

    it("merges partial editor fields", () => {
        resetSettings();
        updateSettingSection("editor", { fontSize: 20, tabSize: 2 });
        const settings = getSettings();
        expect(settings.editor.fontSize).toBe(20);
        expect(settings.editor.tabSize).toBe(2);
        expect(settings.editor.minimap).toBe(false);
    });

    it("merges partial ai without resetting models", () => {
        resetSettings();
        updateSettingSection("ai", { autoApplyEdits: true });
        const settings = getSettings();
        expect(settings.ai.autoApplyEdits).toBe(true);
        expect(settings.ai.defaultModel).toBe("auto");
    });
});

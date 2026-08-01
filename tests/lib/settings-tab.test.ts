import { describe, expect, it } from "vitest";
import {
    isSettingsTab,
    isVirtualEditorTab,
    SETTINGS_TAB_PATH,
} from "@/lib/settings-tab";

describe("settings-tab", () => {
    it("detects settings tab", () => {
        expect(isSettingsTab(SETTINGS_TAB_PATH)).toBe(true);
        expect(isSettingsTab("shape://other")).toBe(false);
    });

    it("detects virtual editor tabs", () => {
        expect(isVirtualEditorTab(SETTINGS_TAB_PATH)).toBe(true);
        expect(isVirtualEditorTab("shape://design-preview/abc")).toBe(true);
        expect(isVirtualEditorTab("shape://subagent/abc")).toBe(false);
    });
});

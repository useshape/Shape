import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

describe("deps", () => {
    it("tsserver", () => {
        expect(existsSync(path.resolve("node_modules/typescript/lib/tsserver.js"))).toBe(true);
    });
});

describe("modules", () => {
    it("branch", async () => {
        const mod = await import("@/features/git/ui/branches/panel");
        expect(mod.BranchWindow).toBeTypeOf("function");
    });

    it("graph", async () => {
        const mod = await import("@/lib/git/graph-virtual");
        expect(mod.computeGraphRowMeta).toBeTypeOf("function");
        expect(mod.computeVisibleRange).toBeTypeOf("function");
    });

    it("settings", async () => {
        const mod = await import("@/lib/settings");
        expect(mod.getEditorOptionsFromSettings).toBeTypeOf("function");
        expect(mod.updateSettingSection).toBeTypeOf("function");
    });

    it("shortcuts", async () => {
        const mod = await import("@/lib/ui/shortcut-actions");
        expect(mod.dispatchShortcutAction).toBeTypeOf("function");
    });
});

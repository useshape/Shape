import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import * as ReactWindow from "react-window";

describe("deps", () => {
    it("window", () => {
        expect(ReactWindow.List).toBeTypeOf("function");
        expect("FixedSizeList" in ReactWindow).toBe(false);
    });

    it("tsserver", () => {
        expect(existsSync(path.resolve("node_modules/typescript/lib/tsserver.js"))).toBe(true);
    });
});

describe("modules", () => {
    it("branch", async () => {
        const mod = await import("@/features/git/ui/branches/branch-window");
        expect(mod.BranchWindow).toBeTypeOf("function");
    });

    it("graph", async () => {
        const mod = await import("@/lib/git/graph-virtual");
        expect(mod.computeGraphRowMeta).toBeTypeOf("function");
        expect(mod.computeVisibleRange).toBeTypeOf("function");
    });

    it("settings", async () => {
        const mod = await import("@/lib/settings");
        expect(mod.getMonacoOptionsFromSettings).toBeTypeOf("function");
        expect(mod.updateSettingSection).toBeTypeOf("function");
    });

    it("shortcuts", async () => {
        const mod = await import("@/lib/ui/shortcut-actions");
        expect(mod.dispatchShortcutAction).toBeTypeOf("function");
    });
});

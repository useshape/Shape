import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadKeybindings } from "@/lib/ui/shortcuts";

describe("keybinding chords", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("registers Ctrl+K as both Inline Edit and a chord root", () => {
        const bindings = loadKeybindings();
        expect(bindings.some((b) => b.key === "Ctrl+K")).toBe(true);
        expect(bindings.some((b) => b.key.startsWith("Ctrl+K "))).toBe(true);
        expect(bindings.find((b) => b.key === "Ctrl+K S")?.label).toBe("Save All");
        expect(bindings.find((b) => b.key === "Ctrl+K Ctrl+O")?.label).toBe("Open Folder");
    });
});

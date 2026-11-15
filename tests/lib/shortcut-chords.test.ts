import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadKeybindings, bindingApplies } from "@/lib/ui/shortcuts";

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

    it("keeps editor shortcuts off the chat composer", () => {
        const composer = document.createElement("textarea");
        composer.setAttribute("data-chat-composer", "true");
        document.body.append(composer);
        expect(bindingApplies("editorFocus", composer)).toBe(false);
        expect(bindingApplies("editorTextFocus && !editorReadonly", composer)).toBe(false);
        expect(bindingApplies("global", composer)).toBe(true);
        expect(bindingApplies("chatFocus || global", composer)).toBe(true);
        composer.remove();
    });
});

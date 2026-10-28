import { describe, expect, it } from "vitest";
import { bindingApplies } from "@/lib/ui/shortcuts";

describe("bindingApplies", () => {
    it("keeps editor-only shortcuts out of the chat composer", () => {
        const composer = document.createElement("textarea");
        composer.setAttribute("data-chat-composer", "true");
        document.body.append(composer);
        expect(bindingApplies("editorTextFocus", composer)).toBe(false);
        expect(bindingApplies("global", composer)).toBe(true);
        expect(bindingApplies("chatFocus || global", composer)).toBe(true);
        composer.remove();
    });

    it("allows editor shortcuts only inside the editor", () => {
        const editor = document.createElement("div");
        editor.className = "monaco-editor";
        const surface = document.createElement("textarea");
        editor.append(surface);
        document.body.append(editor);
        expect(bindingApplies("editorTextFocus", surface)).toBe(true);
        editor.remove();
    });
});

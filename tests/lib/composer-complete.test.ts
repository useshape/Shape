import { describe, expect, it } from "vitest";
import { composerGhost, loadComposerPrompts, rememberComposerPrompt } from "@/lib/chat/composer-complete";

function memory(): Storage {
    const data = new Map<string, string>();
    return {
        get length() {
            return data.size;
        },
        clear: () => data.clear(),
        getItem: (key) => data.get(key) ?? null,
        key: (index) => [...data.keys()][index] ?? null,
        removeItem: (key) => data.delete(key),
        setItem: (key, value) => data.set(key, value),
    };
}

describe("composer ghost text", () => {
    it("continues a previous prompt when the caret is at the end", () => {
        expect(composerGhost("fix the", 7, ["fix the button alignment"])).toBe(" button alignment");
    });

    it("prefers the shortest continuation", () => {
        expect(
            composerGhost("open", 4, ["open the settings panel", "open the file"]),
        ).toBe(" the file");
    });

    it("stays quiet unless the caret is at the end", () => {
        expect(composerGhost("fix the", 3, ["fix the button alignment"])).toBe("");
    });

    it("does not complete an unfinished mention or slash token", () => {
        expect(composerGhost("see @but", 7, ["see @button"])).toBe("");
        expect(composerGhost("/rev", 4, ["/review the diff"])).toBe("");
    });

    it("completes a word only when one history word matches", () => {
        expect(composerGhost("align the but", 13, ["center the button", "move the panel"])).toBe("ton");
        expect(composerGhost("the pa", 6, ["the panel", "the page"])).toBe("");
    });

    it("remembers prompts in the store it is given", () => {
        const store = memory();
        rememberComposerPrompt("  center the text  ", store);
        rememberComposerPrompt("center the text", store);
        expect(loadComposerPrompts(store)).toEqual(["center the text"]);
    });
});

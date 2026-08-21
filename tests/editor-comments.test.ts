import { describe, expect, it } from "vitest";
import {
    commentsForFile,
    emptyCommentStore,
    formatCommentTime,
    hostnameLabel,
    looksLikeUrl,
    newCommentId,
    normalizeHref,
    parseCommentStore,
    parseGithubRepo,
    reanchorLine,
    remoteUrlToHttps,
    removeComment,
    serializeCommentStore,
    snippetOfLine,
    tagsFromCommentBody,
    toProjectRelative,
    upsertComment,
    type FileComment,
} from "@/lib/editor-comments";

function comment(partial: Partial<FileComment> & Pick<FileComment, "id" | "file" | "line">): FileComment {
    return {
        snippet: "",
        body: "",
        tags: [],
        createdAt: 1,
        updatedAt: 1,
        ...partial,
    };
}

describe("editor comments store", () => {
    it("parses a valid comments file and drops junk", () => {
        const raw = JSON.stringify({
            version: 1,
            comments: [
                {
                    id: "c_1",
                    file: "src\\app.ts",
                    line: 12,
                    snippet: "const x = 1",
                    body: "check this",
                    tags: [
                        { kind: "file", path: "lib/a.ts", label: "a.ts" },
                        { kind: "person", name: "Ada", email: "ada@x.com" },
                        { kind: "url", href: "https://github.com/shape/app", label: "github.com" },
                        { kind: "nope" },
                    ],
                    createdAt: 10,
                    updatedAt: 20,
                },
                { id: "bad" },
            ],
        });
        const store = parseCommentStore(raw);
        expect(store.comments).toHaveLength(1);
        expect(store.comments[0].file).toBe("src/app.ts");
        expect(store.comments[0].tags).toHaveLength(3);
    });

    it("round-trips through serialize", () => {
        const store = emptyCommentStore();
        const next = upsertComment(
            store,
            comment({ id: "c_a", file: "a.ts", line: 3, body: "hi" }),
        );
        const again = parseCommentStore(serializeCommentStore(next));
        expect(again.comments[0].body).toBe("hi");
        expect(again.comments[0].line).toBe(3);
    });

    it("lists comments for a file case-insensitively", () => {
        let store = emptyCommentStore();
        store = upsertComment(store, comment({ id: "1", file: "Src/App.ts", line: 1 }));
        store = upsertComment(store, comment({ id: "2", file: "other.ts", line: 1 }));
        expect(commentsForFile(store, "src/app.ts")).toHaveLength(1);
        expect(removeComment(store, "1").comments).toHaveLength(1);
    });

    it("makes unique ids", () => {
        expect(newCommentId()).not.toBe(newCommentId());
    });
});

describe("editor comments reanchor", () => {
    it("stays on the same line when the snippet still matches", () => {
        const c = comment({ id: "1", file: "a.ts", line: 2, snippet: "keep me" });
        expect(reanchorLine(c, ["x", "keep me", "y"])).toBe(2);
    });

    it("follows a snippet that moved nearby", () => {
        const c = comment({ id: "1", file: "a.ts", line: 2, snippet: "target line" });
        expect(reanchorLine(c, ["a", "b", "c", "target line", "d"])).toBe(4);
    });

    it("falls back to the clamped original line", () => {
        const c = comment({ id: "1", file: "a.ts", line: 99, snippet: "gone" });
        expect(reanchorLine(c, ["a", "b"])).toBe(2);
        expect(snippetOfLine("   hello world   ")).toBe("hello world");
    });
});

describe("editor comments paths and tags", () => {
    it("strips the project prefix from file paths", () => {
        expect(toProjectRelative("C:/proj/src/a.ts", "C:/proj")).toBe("src/a.ts");
        expect(toProjectRelative("C:\\proj\\src\\a.ts", "C:\\proj")).toBe("src/a.ts");
        expect(toProjectRelative("C:/other/a.ts", "C:/proj")).toBe("C:/other/a.ts");
    });

    it("detects and normalizes urls", () => {
        expect(looksLikeUrl("github.com/shape/app")).toBe(true);
        expect(looksLikeUrl("not a url")).toBe(false);
        expect(normalizeHref("github.com/x")).toBe("https://github.com/x");
        expect(hostnameLabel("https://www.github.com/org/repo")).toBe("github.com");
    });

    it("converts git remotes to https pages", () => {
        expect(remoteUrlToHttps("git@github.com:shape/app.git")).toBe("https://github.com/shape/app");
        expect(remoteUrlToHttps("https://github.com/shape/app.git")).toBe("https://github.com/shape/app");
        expect(parseGithubRepo("git@github.com:shape/app.git")).toEqual({ owner: "shape", repo: "app" });
        expect(parseGithubRepo("https://gitlab.com/x/y")).toBeNull();
    });

    it("formats comment timestamps", () => {
        const now = Date.UTC(2026, 7, 21, 12, 0, 0);
        expect(formatCommentTime(now - 10_000, now)).toBe("just now");
        expect(formatCommentTime(now - 5 * 60_000, now)).toBe("5m");
        expect(formatCommentTime(now - 3 * 3_600_000, now)).toBe("3h");
    });

    it("turns @tokens in generated text into comment tags", () => {
        const tags = tagsFromCommentBody("Ask @ada about src/app.ts and https://github.com/x", [
            { name: "Ada Lovelace", login: "ada", email: "ada@x.com", avatarUrl: "https://ex/a.png" },
        ]);
        expect(tags).toEqual([
            { kind: "url", href: "https://github.com/x", label: "github.com" },
            {
                kind: "person",
                name: "Ada Lovelace",
                email: "ada@x.com",
                login: "ada",
                avatarUrl: "https://ex/a.png",
            },
        ]);
        expect(tagsFromCommentBody("See @lib/foo.ts")[0]).toEqual({
            kind: "file",
            path: "lib/foo.ts",
            label: "foo.ts",
        });
    });
});

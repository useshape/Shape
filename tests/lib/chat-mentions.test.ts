import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import {
    buildMessageWithMentions,
    formatMentionToken,
    parseMentionTokens,
    stripMentionTokens,
    type SelectionSnapshot,
} from "@/lib/chat-mentions";

const mockedInvoke = vi.mocked(invoke);

describe("chat-mentions: parseMentionTokens", () => {
    it("parses a bare @selection token with no path suffix", () => {
        expect(parseMentionTokens("explain @selection please")).toEqual([
            { kind: "selection", path: undefined, label: "Selection" },
        ]);
    });

    it("parses a bare @codebase token", () => {
        expect(parseMentionTokens("search @codebase for foo")).toEqual([
            { kind: "codebase", path: undefined, label: "Codebase" },
        ]);
    });

    it("parses @file:path and @folder:path with their paths", () => {
        expect(parseMentionTokens("look at @file:src/index.ts and @folder:src/lib")).toEqual([
            { kind: "file", path: "src/index.ts", label: "src/index.ts" },
            { kind: "folder", path: "src/lib", label: "src/lib" },
        ]);
    });

    it("parses multiple mixed mentions in one message", () => {
        const mentions = parseMentionTokens("@selection and @file:a.ts and @codebase and @folder:b");
        expect(mentions.map((m) => m.kind)).toEqual(["selection", "file", "codebase", "folder"]);
    });

    it("does not require a colon/path after @selection or @codebase", () => {
        // Regression check: the old regex required `@selection:...`, so a bare
        // `@selection` at end-of-string or before punctuation must still match.
        expect(parseMentionTokens("@selection.")).toHaveLength(1);
        expect(parseMentionTokens("@selection")).toHaveLength(1);
    });
});

describe("chat-mentions: formatMentionToken / round-trip", () => {
    it("formats selection and codebase as bare tokens", () => {
        expect(formatMentionToken({ kind: "selection", label: "Selection" })).toBe("@selection");
        expect(formatMentionToken({ kind: "codebase", label: "Codebase" })).toBe("@codebase");
    });

    it("formats file/folder tokens with their path", () => {
        expect(formatMentionToken({ kind: "file", path: "a/b.ts", label: "a/b.ts" })).toBe("@a/b.ts");
        expect(formatMentionToken({ kind: "folder", path: "src/lib", label: "src/lib" })).toBe(
            "@src/lib/",
        );
    });

    it("formats design tokens as clean @Name", () => {
        expect(
            formatMentionToken({ kind: "design", id: "c1", label: "Calm Operator", path: "x" }),
        ).toBe("@Calm-Operator");
    });

    it("round-trips: formatted tokens parse back to the same kind", () => {
        const kinds = ["file", "folder", "codebase", "selection"] as const;
        for (const kind of kinds) {
            const token = formatMentionToken({ kind, path: "x/y", label: "x/y" });
            const parsed = parseMentionTokens(`hello ${token} world`);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].kind).toBe(kind);
        }
    });

    it("still parses legacy @file: and @folder: prefixes", () => {
        expect(parseMentionTokens("@file:src/a.ts")[0]).toMatchObject({
            kind: "file",
            path: "src/a.ts",
        });
    });
});

describe("chat-mentions: stripMentionTokens", () => {
    it("removes mention tokens and collapses whitespace", () => {
        expect(stripMentionTokens("please @selection fix   this @file:a.ts bug")).toBe("please fix this bug");
    });
});

describe("chat-mentions: buildMessageWithMentions selection context", () => {
    const selection: SelectionSnapshot = {
        path: "src/foo.ts",
        startLine: 10,
        endLine: 12,
        text: "const x = 1;",
    };

    it("injects a mention_context block for @selection when a snapshot is provided", async () => {
        const result = await buildMessageWithMentions("fix @selection please", null, selection);
        expect(result).toContain('<mention_context type="selection" path="src/foo.ts" range="10-12">');
        expect(result).toContain("const x = 1;");
        expect(result).toContain("</mention_context>");
        expect(result).toContain("fix please");
    });

    it("uses a single line number when start and end lines match", async () => {
        const single: SelectionSnapshot = { ...selection, startLine: 5, endLine: 5 };
        const result = await buildMessageWithMentions("@selection", null, single);
        expect(result).toContain('range="5"');
    });

    it("escapes XML-sensitive characters in the path attribute", async () => {
        const tricky: SelectionSnapshot = { ...selection, path: 'a<b>&"c".ts' };
        const result = await buildMessageWithMentions("@selection", null, tricky);
        expect(result).toContain('path="a&lt;b&gt;&amp;&quot;c&quot;.ts"');
    });

    it("does not inject selection context when @selection is not present in the text", async () => {
        const result = await buildMessageWithMentions("just a normal message", null, selection);
        expect(result).toBe("just a normal message");
        expect(result).not.toContain("mention_context");
    });

    it("omits the block when @selection is used but no snapshot is available", async () => {
        const result = await buildMessageWithMentions("fix @selection please", null, null);
        expect(result).toBe("fix please");
    });

    it("omits the block when the snapshot has empty/whitespace-only text", async () => {
        const empty: SelectionSnapshot = { ...selection, text: "   " };
        const result = await buildMessageWithMentions("fix @selection please", null, empty);
        expect(result).toBe("fix please");
    });

    it("does not call backend commands to resolve @selection", async () => {
        await buildMessageWithMentions("fix @selection please", "/proj", selection);
        expect(mockedInvoke).not.toHaveBeenCalled();
    });
});

describe("chat-mentions: buildMessageWithMentions file/folder/codebase", () => {
    it("returns the plain body when there is no project path", async () => {
        const result = await buildMessageWithMentions("check @file:a.ts", null);
        expect(result).toBe("check");
    });

    it("injects file content for @file mentions when resolvable", async () => {
        mockedInvoke.mockResolvedValueOnce("file contents here");
        const result = await buildMessageWithMentions("check @file:a.ts", "/proj");
        expect(result).toContain('<mention_context type="file" path="a.ts">');
        expect(result).toContain("file contents here");
        expect(result).toContain("check");
    });

    it("injects file content for clean @path mentions", async () => {
        mockedInvoke.mockResolvedValueOnce("clean path contents");
        const result = await buildMessageWithMentions("check @src/app.ts", "/proj");
        expect(result).toContain('<mention_context type="file" path="src/app.ts">');
        expect(result).toContain("clean path contents");
    });

    it("injects a generic codebase search hint for @codebase", async () => {
        const result = await buildMessageWithMentions("@codebase find usages", "/proj");
        expect(result).toContain('<mention_context type="codebase">');
    });

    it("silently drops the mention block when file read fails", async () => {
        mockedInvoke.mockRejectedValueOnce(new Error("not found"));
        const result = await buildMessageWithMentions("check @file:missing.ts", "/proj");
        expect(result).toBe("check");
    });
});

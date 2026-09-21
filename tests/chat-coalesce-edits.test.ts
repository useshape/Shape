import { describe, expect, it } from "vitest";
import {
    coalesceConsecutiveSameFileEdits,
    groupWorkflowRows,
} from "@/features/chat/ui/blocks/workflow";
import type { Chunk } from "@/features/chat/ui/md/renderer";

function edit(file: string, original: string, replacement: string): Chunk {
    return { type: "edit", file, original, replacement };
}

describe("coalesceConsecutiveSameFileEdits", () => {
    it("folds back-to-back edits of the same file into one row with first original and latest replacement", () => {
        const out = coalesceConsecutiveSameFileEdits([
            edit("src/a.ts", "aaa\n", "bbb\n"),
            edit("src/a.ts", "bbb\n", "ccc\n"),
        ]);
        expect(out).toHaveLength(1);
        expect(out[0]?.original).toBe("aaa\n");
        expect(out[0]?.replacement).toBe("ccc\n");
    });

    it("does not fold edits when another step sits between them", () => {
        const out = coalesceConsecutiveSameFileEdits([
            edit("src/a.ts", "a", "b"),
            { type: "grep", query: "foo" },
            edit("src/a.ts", "b", "c"),
        ]);
        expect(out.filter((c) => c.type === "edit")).toHaveLength(2);
    });

    it("does not fold consecutive edits to different files", () => {
        const out = coalesceConsecutiveSameFileEdits([
            edit("src/a.ts", "a", "b"),
            edit("src/b.ts", "x", "y"),
        ]);
        expect(out).toHaveLength(2);
    });
});

describe("groupWorkflowRows same-file edits", () => {
    it("renders one edit block for consecutive same-file patches", () => {
        const rows = groupWorkflowRows([
            edit("src/a.ts", "aaa\n", "bbb\n"),
            edit("src/a.ts", "bbb\n", "ccc\n"),
        ]);
        const edits = rows.filter((r) => r.kind === "block" && r.block.type === "edit");
        expect(edits).toHaveLength(1);
        expect(edits[0]?.kind === "block" && edits[0].block.replacement).toBe("ccc\n");
    });
});

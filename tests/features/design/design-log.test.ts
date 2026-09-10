import { describe, expect, it } from "vitest";
import {
    DESIGN_LOG_SESSION,
    formatDesignLog,
    summarizePendingEdit,
} from "@/features/preview/design/log";

describe("design log format", () => {
    it("emits a paste-friendly block with session and end marker", () => {
        const block = formatDesignLog("ERROR", "apply:failed", {
            why: "Couldn't find <button> in source",
            tag: "button",
            filesTried: ["page.tsx", "hero.tsx"],
        });
        expect(block.startsWith("── shape/design ERROR apply:failed")).toBe(true);
        expect(block).toContain(`session=${DESIGN_LOG_SESSION}`);
        expect(block).toContain("why: Couldn't find <button> in source");
        expect(block).toContain("filesTried:");
        expect(block.trimEnd().endsWith("── end")).toBe(true);
    });

    it("summarizes pending edits without dumping full style maps", () => {
        const summary = summarizePendingEdit({
            id: "el-1",
            label: "button.Save",
            tag: "button",
            className: "px-3 py-2",
            styles: { color: "red", paddingTop: "8px", unused: undefined },
            source: {
                fileName: "/app/components/SaveButton.tsx",
                lineNumber: 42,
                columnNumber: 5,
                mapped: true,
            },
        });
        expect(summary.styleKeys).toEqual(["color", "paddingTop"]);
        expect(summary.source?.file).toBe("SaveButton.tsx:42:5");
        expect(Object.keys(summary)).not.toContain("styles");
    });
});

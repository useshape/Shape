import { describe, expect, it } from "vitest";
import { parseKeyedRows, tableCellModelId } from "@/lib/chat/fence-tables";

describe("fence tables", () => {
    it("parses records JSON", () => {
        const rows = parseKeyedRows(`[{"name":"Ada","role":"eng"}]`);
        expect(rows).toEqual([{ name: "Ada", role: "eng" }]);
    });

    it("returns null for invalid JSON", () => {
        expect(parseKeyedRows("not json")).toBeNull();
    });

    it("only treats known model prefixes as brand cells", () => {
        expect(tableCellModelId("openai/gpt-4o")).toBe("openai/gpt-4o");
        expect(tableCellModelId("mystery-vendor/foo")).toBeNull();
        expect(tableCellModelId("Ada")).toBeNull();
    });
});

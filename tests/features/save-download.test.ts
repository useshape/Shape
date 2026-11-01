import { describe, expect, it } from "vitest";
import { bytesFromDataUrl, extensionOf } from "@/lib/ui/save-download";

describe("save-download", () => {
    it("decodes a base64 data URL", () => {
        const bytes = bytesFromDataUrl("data:text/plain;base64,aGVsbG8=");
        expect(new TextDecoder().decode(bytes)).toBe("hello");
    });

    it("decodes a percent-encoded data URL", () => {
        const bytes = bytesFromDataUrl("data:text/plain,hello%20world");
        expect(new TextDecoder().decode(bytes)).toBe("hello world");
    });

    it("picks an extension from the filename", () => {
        expect(extensionOf("notes.txt", "text/plain")).toBe("txt");
        expect(extensionOf("blob", "image/png")).toBe("png");
    });
});

import { describe, expect, it } from "vitest";
import { pathToFileUri } from "@/lib/path-uri";

describe("pathToFileUri", () => {
    it("converts windows paths", () => {
        expect(pathToFileUri("C:\\Users\\dev\\proj")).toBe("file:///C:/Users/dev/proj");
    });

    it("converts posix absolute paths", () => {
        expect(pathToFileUri("/home/dev/proj")).toBe("file:///home/dev/proj");
    });

    it("prefixes relative paths", () => {
        expect(pathToFileUri("src/index.ts")).toBe("file:///src/index.ts");
    });
});

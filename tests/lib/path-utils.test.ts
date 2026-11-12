import { describe, expect, it } from "vitest";
import { cleanPath, joinPath, normalizePath, resolveProjectFilePath, toFsPath } from "@/lib/path/utils";

describe("path utils", () => {
    it("keeps unix absolute paths absolute", () => {
        expect(cleanPath("/Users/ada/proj/src/main.ts")).toBe("/Users/ada/proj/src/main.ts");
        expect(toFsPath("/Users/ada/proj/src/main.ts")).toBe("/Users/ada/proj/src/main.ts");
        expect(joinPath("/Users/ada/proj", "src/main.ts")).toBe("/Users/ada/proj/src/main.ts");
    });

    it("collapses traversal on unix without dropping the root", () => {
        expect(cleanPath("/Users/ada/proj/../secret")).toBe("/Users/ada/secret");
        expect(cleanPath("/Users/ada/proj/./src")).toBe("/Users/ada/proj/src");
    });

    it("keeps windows drive paths and native separators", () => {
        expect(cleanPath("C:\\Users\\ada\\proj\\src\\main.ts")).toBe("C:/Users/ada/proj/src/main.ts");
        expect(toFsPath("C:/Users/ada/proj/src/main.ts")).toBe("C:\\Users\\ada\\proj\\src\\main.ts");
    });

    it("resolves project-relative files on both families", () => {
        expect(resolveProjectFilePath("src/app.ts", "/Users/ada/proj")).toBe("/Users/ada/proj/src/app.ts");
        expect(resolveProjectFilePath("src/app.ts", "C:\\work\\proj")).toBe("C:\\work\\proj\\src\\app.ts");
        expect(resolveProjectFilePath("/etc/hosts", "/Users/ada/proj")).toBe("/etc/hosts");
    });

    it("normalizes mixed separators", () => {
        expect(normalizePath("C:\\a\\b/c")).toBe("C:/a/b/c");
    });
});

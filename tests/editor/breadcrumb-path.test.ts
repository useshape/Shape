import { describe, expect, it } from "vitest";

/** Keep in sync with joinProjectFolder in features/editor/ui/main/ui/breadcrumb.tsx */
function joinProjectFolder(projectPath: string, parts: string[], upToIndex: number): string | null {
    const separator = projectPath.includes("\\") ? "\\" : "/";
    const root = projectPath.replace(/[\\/]+$/, "");
    if (!root) return null;
    const segments = parts.slice(0, upToIndex + 1).filter((p) => p && p !== "." && p !== "..");
    if (segments.length === 0) return root;
    if (segments.some((p) => /[<>:"|?*\x00-\x1f]/.test(p))) return null;
    return [root, ...segments].join(separator);
}

describe("joinProjectFolder", () => {
    it("joins with Windows separators", () => {
        expect(joinProjectFolder("C:\\proj", ["src", "lib", "a.ts"], 1)).toBe("C:\\proj\\src\\lib");
    });

    it("joins with POSIX separators", () => {
        expect(joinProjectFolder("/home/u/proj", ["src", "lib"], 0)).toBe("/home/u/proj/src");
    });

    it("rejects illegal Windows path characters (os error 123)", () => {
        expect(joinProjectFolder("C:\\proj", ["src", "bad:name"], 1)).toBeNull();
        expect(joinProjectFolder("C:\\proj", ["src", "a<b"], 1)).toBeNull();
    });

    it("skips . and .. segments", () => {
        expect(joinProjectFolder("C:\\proj", [".", "src"], 1)).toBe("C:\\proj\\src");
    });
});

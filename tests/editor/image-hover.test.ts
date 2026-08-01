import { describe, expect, it } from "vitest";
import {
    editorModelFilePath,
    getImageHoverTooltip,
    resolveLocalImagePath,
    resolveLocalImagePathCandidates,
} from "@/features/editor/lsp/image-hover";

describe("resolveLocalImagePath", () => {
    it("resolves relative image paths", () => {
        expect(resolveLocalImagePath("./logo.png", "C:/proj/src/App.tsx")).toBe(
            "C:\\proj\\src\\logo.png",
        );
    });

    it("resolves parent relative paths", () => {
        expect(resolveLocalImagePath("../assets/icon.svg", "C:/proj/src/App.tsx")).toBe(
            "C:\\proj\\assets\\icon.svg",
        );
    });

    it("rejects http urls", () => {
        expect(resolveLocalImagePath("https://example.com/a.png", "C:/proj/a.ts")).toBeNull();
    });

    it("rejects data urls", () => {
        expect(resolveLocalImagePath("data:image/png;base64,abc", "C:/proj/a.ts")).toBeNull();
    });

    it("rejects absolute paths without a project root", () => {
        expect(resolveLocalImagePath("/absolute.png", "C:/proj/a.ts")).toBeNull();
    });

    it("prefers public/ for root-relative Next.js assets", () => {
        expect(resolveLocalImagePath("/images/hero-app.png", "C:/proj/a.ts", "C:/proj")).toBe(
            "C:\\proj\\public\\images\\hero-app.png",
        );
    });
});

describe("resolveLocalImagePathCandidates", () => {
    it("returns multiple root-relative candidates", () => {
        expect(resolveLocalImagePathCandidates("/images/hero.png", "C:/proj/a.ts", "C:/proj")).toEqual([
            "C:\\proj\\public\\images\\hero.png",
            "C:\\proj\\images\\hero.png",
            "C:\\proj\\static\\images\\hero.png",
            "C:\\proj\\assets\\images\\hero.png",
            "C:\\proj\\src\\assets\\images\\hero.png",
        ]);
    });
});

describe("getImageHoverTooltip", () => {
    it("shows relative path and extension", () => {
        expect(getImageHoverTooltip("/images/hero-app.png")).toBe("/images/hero-app.png · PNG");
    });

    it("shows mime for data uris", () => {
        expect(getImageHoverTooltip("data:image/png;base64,abc")).toBe("data:image/png;base64,abc… · PNG");
    });
});

describe("editorModelFilePath", () => {
    it("normalizes Monaco /c:/ URIs on Windows", () => {
        expect(editorModelFilePath({ uri: { path: "/c:/proj/src/App.tsx" } }).toLowerCase()).toBe(
            "c:\\proj\\src\\app.tsx",
        );
    });

    it("strips diff: prefixes", () => {
        expect(
            editorModelFilePath({ uri: { path: "/c:/proj/src/App.tsx", fsPath: "diff:staged:C:\\proj\\src\\App.tsx" } }),
        ).toBe("C:\\proj\\src\\App.tsx");
    });
});

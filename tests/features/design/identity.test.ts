import { describe, expect, it } from "vitest";
import {
    enrichSourceIdentity,
    isBundledGeneratedPath,
    isProjectSourcePath,
    normalizeOriginalSourcePath,
    pathFromGeneratedChunk,
} from "@/features/preview/design/identity";

describe("source identity", () => {
    it("recognizes project source paths", () => {
        expect(isProjectSourcePath("src/components/Button.tsx")).toBe(true);
        expect(isProjectSourcePath("app/page.tsx")).toBe(true);
        expect(isProjectSourcePath("node_modules/react/index.js")).toBe(false);
        expect(isBundledGeneratedPath("/_next/static/chunks/foo.js")).toBe(true);
    });

    it("normalizes webpack / Next prefixes", () => {
        expect(normalizeOriginalSourcePath("/_N_E/src/app/page.tsx")).toBe("src/app/page.tsx");
        expect(normalizeOriginalSourcePath("webpack:///(app-pages)/src/ui/Card.tsx")).toContain(
            "src/ui/Card.tsx",
        );
    });

    it("recovers paths from turbopack chunk names", () => {
        expect(pathFromGeneratedChunk("app_page_tsx_1s_43kl._.js")).toBe("app/page.tsx");
        expect(pathFromGeneratedChunk("src_components_Hero_tsx_abc._.js")).toBe(
            "src/components/Hero.tsx",
        );
    });

    it("enrichSourceIdentity sets a stable nodeId", () => {
        const loc = enrichSourceIdentity({
            fileName: "src/components/Card.tsx",
            lineNumber: 12,
            columnNumber: 4,
            componentName: "Card",
        });
        expect(loc?.nodeId).toBe("src/components/Card.tsx:12:4");
        expect(loc?.componentName).toBe("Card");
    });
});

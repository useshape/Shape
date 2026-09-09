import { describe, expect, it } from "vitest";
import {
    labelForPath,
    mergeLiveDesignPages,
    previewUrlForPage,
    relFromRoot,
    type DesignPage,
} from "@/features/preview/lib/discover-routes";
import { DESIGN_BRIDGE_SCRIPT } from "@/features/preview/design-mode/bridge-script";

describe("relFromRoot", () => {
    it("strips a Windows project root case-insensitively", () => {
        expect(
            relFromRoot(
                "C:\\Users\\User\\Downloads\\roblox-platform-clone\\app\\page.tsx",
                "C:\\Users\\User\\Downloads\\roblox-platform-clone\\app",
            ),
        ).toBe("page.tsx");
    });

    it("strips a posix root", () => {
        expect(relFromRoot("/proj/app/dashboard/page.tsx", "/proj/app")).toBe("dashboard/page.tsx");
    });
});

describe("mergeLiveDesignPages", () => {
    const home: DesignPage = { path: "/", label: "Home", kind: "next-app" };

    it("keeps filesystem Home and adds SPA nav screens as views", () => {
        const merged = mergeLiveDesignPages(home ? [home] : [], [
            { label: "Home", path: "/" },
            { label: "Marketplace", path: "" },
            { label: "Charts", path: "" },
            { label: "Profile", path: "" },
            { label: "Learn more", path: "" },
        ]);
        expect(merged.map((p) => p.label)).toEqual(["Home", "Charts", "Marketplace", "Profile"]);
        expect(merged.find((p) => p.label === "Marketplace")).toMatchObject({
            kind: "view",
            path: "view:marketplace",
        });
    });

    it("promotes real in-origin hrefs to static routes", () => {
        const merged = mergeLiveDesignPages([home], [{ label: "Settings", path: "/settings" }]);
        expect(merged.find((p) => p.path === "/settings")).toMatchObject({
            label: "Settings",
            kind: "static",
        });
    });
});

describe("labelForPath / previewUrlForPage", () => {
    it("titles the index route Home", () => {
        expect(labelForPath("/")).toBe("Home");
        expect(labelForPath("/play/charts")).toBe("Charts");
    });

    it("joins a preview origin with a route", () => {
        expect(previewUrlForPage("http://127.0.0.1:3000/", "/")).toBe("http://127.0.0.1:3000/");
        expect(previewUrlForPage("http://127.0.0.1:3000/", "/about")).toBe("http://127.0.0.1:3000/about");
    });
});

describe("design bridge live pages", () => {
    it("harvests nav views and opens them by label", () => {
        expect(DESIGN_BRIDGE_SCRIPT).toContain("shape-design-pages");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("shape-design-open-view");
        expect(DESIGN_BRIDGE_SCRIPT).toContain("function sendViews()");
    });
});

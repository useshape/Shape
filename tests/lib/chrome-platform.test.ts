import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeChromeKind, resolveChromeKind, setChromePreview } from "@/lib/ui/chrome-platform";

describe("chrome platform", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        window.localStorage.clear();
        window.history.replaceState({}, "", "/");
    });

    it("detects macOS from the user agent", () => {
        vi.stubGlobal("navigator", { platform: "MacIntel", userAgent: "Macintosh; Intel Mac OS X" });
        expect(nativeChromeKind()).toBe("macos");
    });

    it("detects Windows from the user agent", () => {
        vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows NT 10.0" });
        expect(nativeChromeKind()).toBe("windows");
    });

    it("does not treat Linux as a chrome kind", () => {
        vi.stubGlobal("navigator", { platform: "Linux x86_64", userAgent: "X11; Linux x86_64" });
        expect(nativeChromeKind()).toBe("windows");
    });

    it("lets NEXT_PUBLIC_SHAPE_CHROME preview another titlebar", () => {
        vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
        vi.stubEnv("NEXT_PUBLIC_SHAPE_CHROME", "macos");
        expect(resolveChromeKind()).toBe("macos");
    });

    it("lets ?shape-chrome= override the env preview", () => {
        vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
        vi.stubEnv("NEXT_PUBLIC_SHAPE_CHROME", "windows");
        window.history.replaceState({}, "", "/?shape-chrome=macos");
        expect(resolveChromeKind()).toBe("macos");
    });

    it("persists a preview choice", () => {
        vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
        setChromePreview("macos");
        expect(resolveChromeKind()).toBe("macos");
        setChromePreview("auto");
        expect(resolveChromeKind()).toBe("windows");
    });

    it("ignores preview overrides in production", () => {
        vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("NEXT_PUBLIC_SHAPE_CHROME", "macos");
        window.history.replaceState({}, "", "/?shape-chrome=macos");
        setChromePreview("macos");
        expect(resolveChromeKind()).toBe("windows");
        expect(window.localStorage.getItem("shape:chrome-preview")).toBeNull();
    });
});

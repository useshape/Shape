import { describe, expect, it } from "vitest";
import { frameworkFromDependencies, frameworkFromEntryNames } from "@/features/agent/framework";

describe("project framework", () => {
    it("prefers the app framework over the library it is built with", () => {
        expect(frameworkFromDependencies({
            react: "19.0.0",
            next: "16.0.0",
            vite: "6.0.0",
        })).toBe("nextjs");
    });

    it("reads dev dependencies when they are merged in", () => {
        expect(frameworkFromDependencies({
            vite: "6.0.0",
            react: "19.0.0",
        })).toBe("react");
    });

    it("falls back to marker files", () => {
        expect(frameworkFromEntryNames(["Cargo.toml", "src"])).toBe("rust");
        expect(frameworkFromEntryNames(["go.mod"])).toBe("go");
        expect(frameworkFromEntryNames(["vite.config.ts", "index.html"])).toBe("vite");
    });
});

import { describe, expect, it } from "vitest";
import {
    packageManagerLabel,
    resolvePackageManager,
} from "@/lib/package-manager";
import { withSettings } from "../helpers/settings";

describe("package-manager", () => {
    it("returns explicit setting over auto", () => {
        withSettings({ node: { packageManager: "pnpm" } });
        expect(resolvePackageManager("C:/repo")).toBe("pnpm");
    });

    it("detects yarn from packageManager field", () => {
        withSettings({ node: { packageManager: "auto" } });
        expect(resolvePackageManager("C:/repo", "yarn@1.22.0")).toBe("yarn");
    });

    it("detects pnpm from packageManager field", () => {
        withSettings({ node: { packageManager: "auto" } });
        expect(resolvePackageManager("C:/repo", "pnpm@9.0.0")).toBe("pnpm");
    });

    it("detects bun from packageManager field", () => {
        withSettings({ node: { packageManager: "auto" } });
        expect(resolvePackageManager("C:/repo", "bun@1.0.0")).toBe("bun");
    });

    it("defaults to npm", () => {
        withSettings({ node: { packageManager: "auto" } });
        expect(resolvePackageManager("C:/repo")).toBe("npm");
    });

    it("labels package managers", () => {
        expect(packageManagerLabel("npm")).toBe("npm");
        expect(packageManagerLabel("yarn")).toBe("yarn");
        expect(packageManagerLabel("pnpm")).toBe("pnpm");
        expect(packageManagerLabel("bun")).toBe("bun");
    });
});

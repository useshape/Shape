import { describe, expect, it } from "vitest";
import {
    formatVariableDisplayName,
    isGlobalCssFile,
    normalizeVariableName,
    parseCssVariables,
    renameCssVariableInContent,
    updateCssVariableInContent,
} from "@/lib/css-variables";

describe("css-variables", () => {
    it("normalizes variable names", () => {
        expect(normalizeVariableName("primary")).toBe("--primary");
        expect(normalizeVariableName("--primary")).toBe("--primary");
    });

    it("formats display names", () => {
        expect(formatVariableDisplayName("--color-primary")).toBe("color-primary");
    });

    it("detects global css files", () => {
        expect(isGlobalCssFile("C:/proj/app/globals.css")).toBe(true);
        expect(isGlobalCssFile("C:/proj/src/styles.css")).toBe(false);
    });

    it("parses css variables from content", () => {
        const content = `:root {\n  --primary: #fff;\n  --spacing: 8px;\n}`;
        const vars = parseCssVariables(content);
        expect(vars.map((v) => v.name)).toContain("--primary");
        expect(vars.find((v) => v.name === "--primary")?.value).toBe("#fff");
    });

    it("updates variable value in content", () => {
        const content = `:root {\n  --primary: #fff;\n}`;
        const updated = updateCssVariableInContent(content, "--primary", "#000");
        expect(updated).toContain("--primary: #000");
    });

    it("renames variable and var() references", () => {
        const content = `:root {\n  --old: red;\n}\n.btn { color: var(--old); }`;
        const renamed = renameCssVariableInContent(content, "--old", "--new");
        expect(renamed).toContain("--new: red");
        expect(renamed).toContain("var(--new)");
        expect(renamed).not.toContain("var(--old)");
    });
});

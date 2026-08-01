import { describe, expect, it } from "vitest";
import { getGitStatusColor } from "@/core/utils";

describe("core utils", () => {
    it("maps git status colors", () => {
        expect(getGitStatusColor("M")).toBe("var(--git-modified)");
        expect(getGitStatusColor("A")).toBe("var(--git-added)");
        expect(getGitStatusColor("U")).toBe("var(--git-added)");
        expect(getGitStatusColor("D")).toBe("var(--git-deleted)");
        expect(getGitStatusColor("?")).toBe("var(--git-added)");
    });
});

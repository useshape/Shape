import { describe, expect, it } from "vitest";

import {
    displaySkillPath,
    isInsideSkillPath,
    joinSkillPath,
    normalizeSkillPath,
    skillPathSep,
} from "@/lib/chat/skill-paths";

describe("skill-paths: normalizeSkillPath", () => {
    it("converts backslashes and drops trailing separators", () => {
        expect(normalizeSkillPath("C:\\Users\\dev\\skills\\")).toBe("C:/Users/dev/skills");
        expect(normalizeSkillPath("/home/dev/skills///")).toBe("/home/dev/skills");
    });

    it("leaves an already-normalized path alone", () => {
        expect(normalizeSkillPath("/home/dev/.claude/skills")).toBe("/home/dev/.claude/skills");
    });
});

describe("skill-paths: skillPathSep / joinSkillPath", () => {
    it("uses the separator the directory already uses", () => {
        expect(skillPathSep("/home/dev/project")).toBe("/");
        expect(skillPathSep("C:\\Users\\dev\\project")).toBe("\\");
    });

    it("joins with one separator even when both sides carry one", () => {
        expect(joinSkillPath("/home/dev/project/", "/.claude/skills")).toBe(
            "/home/dev/project/.claude/skills"
        );
        expect(joinSkillPath("C:\\Users\\dev", "skills\\pdf")).toBe("C:\\Users\\dev\\skills\\pdf");
    });

    it("normalizes a relative path to the directory's separator", () => {
        expect(joinSkillPath("C:\\Users\\dev", "skills/pdf")).toBe("C:\\Users\\dev\\skills\\pdf");
    });
});

describe("skill-paths: isInsideSkillPath", () => {
    it("is true for the folder itself and for its children", () => {
        expect(isInsideSkillPath("/home/dev/project", "/home/dev/project")).toBe(true);
        expect(isInsideSkillPath("/home/dev/project/.claude/skills", "/home/dev/project")).toBe(true);
    });

    it("is false for parents, siblings, and prefix lookalikes", () => {
        expect(isInsideSkillPath("/home/dev", "/home/dev/project")).toBe(false);
        expect(isInsideSkillPath("/home/dev/project-two", "/home/dev/project")).toBe(false);
        expect(isInsideSkillPath("/home/dev/project/a", "/home/dev/project/b")).toBe(false);
    });

    it("ignores case, matching how the filesystem compares paths", () => {
        expect(isInsideSkillPath("/Home/Dev/Project/.claude", "/home/dev/project")).toBe(true);
    });
});

describe("skill-paths: displaySkillPath", () => {
    it("returns a project-relative path for files inside the project", () => {
        expect(displaySkillPath("/home/dev/demo/.claude/skills/pdf/SKILL.md", "/home/dev/demo", "/home/dev")).toBe(
            ".claude/skills/pdf/SKILL.md"
        );
    });

    it("returns a `~/…` path for files in the home directory", () => {
        expect(displaySkillPath("/home/dev/.agents/skills/commit/SKILL.md", "/home/dev/demo", "/home/dev")).toBe(
            "~/.agents/skills/commit/SKILL.md"
        );
        expect(displaySkillPath("/home/dev", "/home/dev/demo", "/home/dev")).toBe("~");
    });

    it("returns the absolute path for picked folders outside both roots", () => {
        expect(displaySkillPath("/mnt/team/review/SKILL.md", "/home/dev/demo", "/home/dev")).toBe(
            "/mnt/team/review/SKILL.md"
        );
    });

    it("falls back to the absolute path when there is no project or home directory", () => {
        expect(displaySkillPath("/home/dev/demo/.claude/skills/pdf/SKILL.md", null, null)).toBe(
            "/home/dev/demo/.claude/skills/pdf/SKILL.md"
        );
    });

    it("prefers the project label when the project lives inside the home directory", () => {
        expect(displaySkillPath("/home/dev/demo/.agents/guide.md", "/home/dev/demo", "/home/dev")).toBe(
            ".agents/guide.md"
        );
    });
});

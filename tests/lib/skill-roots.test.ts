import { describe, expect, it } from "vitest";
import { listSkillRoots } from "@/lib/chat/skill-roots";

describe("listSkillRoots", () => {
    const project = "/home/dev/demo";
    const home = "/home/dev";

    it("scans every project skill folder, loose files, then personal folders", () => {
        const roots = listSkillRoots({ projectPath: project, homeDir: home, customFolders: [] });

        expect(roots.map((root) => `${root.label}:${root.kind}`)).toEqual([
            ".claude/skills:skills-dir",
            ".agents/skills:skills-dir",
            ".github/skills:skills-dir",
            ".shape/skills:skills-dir",
            ".agents:flat",
            ".claude:flat",
            "~/.claude/skills:skills-dir",
            "~/.agents/skills:skills-dir",
            "~/.shape/skills:skills-dir",
        ]);
        expect(roots[0].path).toBe("/home/dev/demo/.claude/skills");
        expect(roots[4].path).toBe("/home/dev/demo/.agents");
        expect(roots[6].path).toBe("/home/dev/.claude/skills");
    });

    it("keeps loose file extensions per root", () => {
        const roots = listSkillRoots({ projectPath: project, homeDir: home, customFolders: [] });
        const flat = roots.filter((root) => root.kind === "flat");

        expect(flat.map((root) => [root.label, root.extensions])).toEqual([
            [".agents", [".md"]],
            [".claude", [".mdc"]],
        ]);
    });

    it("scans picked folders as both skills folders and loose markdown folders", () => {
        const roots = listSkillRoots({
            projectPath: project,
            homeDir: home,
            customFolders: ["/mnt/team-skills", "C:\\Shared\\Skills"],
        });

        const custom = roots.filter((root) => root.scope === "custom");
        expect(custom.map((root) => `${root.path}:${root.kind}`)).toEqual([
            "/mnt/team-skills:skills-dir",
            "/mnt/team-skills:flat",
            "C:/Shared/Skills:skills-dir",
            "C:/Shared/Skills:flat",
        ]);
        // Picked folders rank above personal ones, below the project.
        const order = roots.map((root) => root.scope);
        expect(order.indexOf("custom")).toBeLessThan(order.indexOf("user"));
        expect(order.indexOf("project")).toBeLessThan(order.indexOf("custom"));
    });

    it("still finds personal and picked folders when no project is open", () => {
        const roots = listSkillRoots({ projectPath: null, homeDir: home, customFolders: ["/mnt/team-skills"] });

        expect(roots.map((root) => root.scope)).toEqual(["custom", "custom", "user", "user", "user"]);
        expect(roots.some((root) => root.scope === "project")).toBe(false);
    });

    it("omits personal folders when the home directory is unknown", () => {
        const roots = listSkillRoots({ projectPath: project, homeDir: null, customFolders: [] });

        expect(roots.every((root) => root.scope === "project")).toBe(true);
    });

    it("keeps Windows projects on backslashes", () => {
        const roots = listSkillRoots({ projectPath: "C:\\work\\demo", homeDir: "C:\\Users\\dev", customFolders: [] });

        expect(roots[0].path).toBe("C:\\work\\demo\\.claude\\skills");
        expect(roots[6].path).toBe("C:\\Users\\dev\\.claude\\skills");
    });

    it("skips blank picked folders", () => {
        const roots = listSkillRoots({ projectPath: project, homeDir: home, customFolders: ["   ", ""] });

        expect(roots.some((root) => root.scope === "custom")).toBe(false);
    });
});

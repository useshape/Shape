import { beforeEach, describe, expect, it, vi } from "vitest";
import { serveSkillFs } from "../helpers/skill-fs";

const mocks = vi.hoisted(() => ({
    lsDir: vi.fn(),
    readFileFromDisk: vi.fn(),
    homeDir: vi.fn(),
    getProjectPath: vi.fn(),
    listCustomSkillFolders: vi.fn(),
}));

vi.mock("@/lib/backend/commands", () => ({ commands: { lsDir: mocks.lsDir, readFileFromDisk: mocks.readFileFromDisk } }));

vi.mock("@/lib/backend/project-state", () => ({ getProjectPath: mocks.getProjectPath }));

vi.mock("@/lib/chat/skill-folders", () => ({
    getHomeDir: mocks.homeDir,
    listCustomSkillFolders: mocks.listCustomSkillFolders,
}));

import {
    countDismissedFiles,
    dismissDiscoveredFile,
    discoverSkills,
    reconcileImportedRow,
    restoreDismissedFiles,
} from "@/lib/chat/discover-skills";
import { addSkill, listSkills } from "@/lib/chat/skills";

const PROJECT = "/home/dev/demo";
const HOME = "/home/dev";
const SKILLS_KEY = "shape-skills";

/** A SKILL.md body with frontmatter. */
function skillFile(name: string, description: string, body: string): string {
    return ["---", `name: ${name}`, `description: ${description}`, "---", "", body].join("\n");
}

/** Rows from a scan of the default project. */
async function discoverItems() {
    return (await discoverSkills()).items;
}

function serve(files: Record<string, string>) {
    serveSkillFs(mocks, files, { homeDir: HOME });
}

beforeEach(() => {
    mocks.lsDir.mockReset();
    mocks.readFileFromDisk.mockReset();
    mocks.homeDir.mockReset();
    mocks.getProjectPath.mockReset();
    mocks.listCustomSkillFolders.mockReset();
    mocks.getProjectPath.mockReturnValue(PROJECT);
    mocks.homeDir.mockResolvedValue(HOME);
    mocks.listCustomSkillFolders.mockReturnValue([]);
});

describe("discoverSkills", () => {
    it("discovers SKILL.md folders in every project skill location", async () => {
        serve({
            [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf-processing", "Work with PDFs.", "# PDF\n\nSteps."),
            [`${PROJECT}/.agents/skills/release/SKILL.md`]: skillFile("release-notes", "Draft release notes.", "Body."),
            [`${PROJECT}/.github/skills/triage/SKILL.md`]: skillFile("triage", "Triage issues.", "Body."),
            [`${PROJECT}/.shape/skills/onboarding/SKILL.md`]: skillFile("onboarding", "Onboard a repo.", "Body."),
        });

        const items = await discoverItems();

        expect(items.map((item) => item.relPath)).toEqual([
            ".claude/skills/pdf/SKILL.md",
            ".agents/skills/release/SKILL.md",
            ".github/skills/triage/SKILL.md",
            ".shape/skills/onboarding/SKILL.md",
        ]);
        expect(items[0]).toMatchObject({
            name: "pdf-processing",
            description: "Work with PDFs.",
            body: "# PDF\n\nSteps.",
            folder: `${PROJECT}/.claude/skills/pdf`,
            rootLabel: ".claude/skills",
            scope: "project",
            status: "new",
            shadowed: [],
        });
    });

    it("keeps scanning decoupled files in .agents and .claude", async () => {
        serve({
            [`${PROJECT}/.agents/guide.md`]: "# Guide\n\nBody",
            [`${PROJECT}/.claude/rules.mdc`]: "Rule body",
        });

        const items = await discoverItems();

        expect(items.map((item) => item.relPath)).toEqual([".agents/guide.md", ".claude/rules.mdc"]);
        expect(items[0]).toMatchObject({ name: "guide", description: "", status: "new", folder: `${PROJECT}/.agents` });
    });

    it("ignores extensions and folders outside the conventions", async () => {
        serve({
            [`${PROJECT}/.agents/skills/notes.txt`]: "notes",
            [`${PROJECT}/.agents/skills/readme/README.md`]: "not a skill",
            [`${PROJECT}/.claude/guide.md`]: "wrong extension for this folder",
        });

        await expect(discoverSkills()).resolves.toEqual({ projectPath: PROJECT, items: [] });
    });

    it("finds personal skills in the user's home directory", async () => {
        serve({
            [`${HOME}/.claude/skills/style/SKILL.md`]: skillFile("house-style", "Write in house style.", "Body."),
            [`${HOME}/.agents/skills/commit/SKILL.md`]: skillFile("commit-messages", "Write commits.", "Body."),
        });

        const items = await discoverItems();

        expect(items.map((item) => item.relPath)).toEqual(["~/.claude/skills/style/SKILL.md", "~/.agents/skills/commit/SKILL.md"]);
        expect(items[0]).toMatchObject({ scope: "user", rootLabel: "~/.claude/skills", name: "house-style" });
    });

    it("finds skills in folders the user picked, without a project open", async () => {
        mocks.getProjectPath.mockReturnValue(null);
        mocks.listCustomSkillFolders.mockReturnValue(["/mnt/team-skills"]);
        serve({ "/mnt/team-skills/review/SKILL.md": skillFile("team-review", "Team review rules.", "Body.") });

        const items = await discoverItems();

        expect(items.map((item) => item.relPath)).toEqual(["/mnt/team-skills/review/SKILL.md"]);
        expect(items[0]).toMatchObject({ scope: "custom", projectPath: "", name: "team-review" });
    });

    it("keeps the highest-precedence file when two roots provide the same skill", async () => {
        serve({
            [`${PROJECT}/.claude/skills/guide/SKILL.md`]: skillFile("guide", "Project guide.", "Project body."),
            [`${HOME}/.claude/skills/guide/SKILL.md`]: skillFile("guide", "Personal guide.", "Personal body."),
        });

        const items = await discoverItems();

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ relPath: ".claude/skills/guide/SKILL.md", scope: "project", body: "Project body." });
        expect(items[0].shadowed).toEqual(["~/.claude/skills/guide/SKILL.md"]);
    });

    it("marks a file as changed when a saved skill with its slug differs", async () => {
        addSkill("guide", "old body");
        serve({ [`${PROJECT}/.agents/skills/guide/SKILL.md`]: skillFile("guide", "Guide.", "new body") });

        const items = await discoverItems();

        expect(items).toHaveLength(1);
        expect(items[0].status).toBe("changed");
    });

    it("skips files that already match the saved skill", async () => {
        addSkill("guide", "Body text");
        serve({ [`${PROJECT}/.agents/guide.md`]: "Body text\n" });

        await expect(discoverSkills()).resolves.toEqual({ projectPath: PROJECT, items: [] });
    });

    it("dismisses one file without hiding another with the same name", async () => {
        serve({
            [`${PROJECT}/.agents/guide.md`]: "agent body",
            [`${PROJECT}/.claude/guide.mdc`]: "claude body",
        });

        dismissDiscoveredFile(PROJECT, ".agents/guide.md");
        const items = await discoverItems();

        expect(items.map((item) => item.relPath)).toEqual([".claude/guide.mdc"]);
        expect(countDismissedFiles(PROJECT)).toBe(1);
    });

    it("restores dismissed files", async () => {
        serve({ [`${PROJECT}/.agents/guide.md`]: "agent body" });
        dismissDiscoveredFile(PROJECT, ".agents/guide.md");

        restoreDismissedFiles(PROJECT);

        expect(countDismissedFiles(PROJECT)).toBe(0);
        await expect(discoverItems()).resolves.toHaveLength(1);
    });

    it("can include dismissed files when a mention asks for them by name", async () => {
        serve({ [`${PROJECT}/.agents/guide.md`]: "agent body" });
        dismissDiscoveredFile(PROJECT, ".agents/guide.md");

        const scan = await discoverSkills({ ignoreDismissals: true });

        expect(scan.items.map((item) => item.relPath)).toEqual([".agents/guide.md"]);
    });

    it("keeps a dismissal when no project is open", async () => {
        mocks.getProjectPath.mockReturnValue(null);
        serve({ [`${HOME}/.claude/skills/style/SKILL.md`]: skillFile("house-style", "House style.", "Body.") });

        expect(await discoverItems()).toHaveLength(1);
        dismissDiscoveredFile("", "~/.claude/skills/style/SKILL.md");

        await expect(discoverItems()).resolves.toEqual([]);
        expect(countDismissedFiles("")).toBe(1);
    });

    it("keeps dismissals scoped to the project", async () => {
        serve({ [`${PROJECT}/.agents/guide.md`]: "agent body" });
        dismissDiscoveredFile("/home/dev/other", ".agents/guide.md");

        await expect(discoverItems()).resolves.toHaveLength(1);
    });

    it("keeps case-sensitive project paths apart in dismissal keys", async () => {
        serve({ [`${PROJECT}/.agents/guide.md`]: "agent body" });
        dismissDiscoveredFile("/home/dev/DEMO", ".agents/guide.md");

        await expect(discoverItems()).resolves.toHaveLength(1);
    });

    it("treats Windows project paths case-insensitively for dismissals", async () => {
        mocks.getProjectPath.mockReturnValue("c:\\work\\demo");
        serve({ "c:\\work\\demo\\.agents\\guide.md": "agent body" });
        dismissDiscoveredFile("C:\\Work\\Demo", ".agents/guide.md");

        await expect(discoverItems()).resolves.toEqual([]);
    });

    it("skips unreadable and empty files, and folders without SKILL.md", async () => {
        serve({
            [`${PROJECT}/.agents/skills/empty/SKILL.md`]: "   \n",
            [`${PROJECT}/.agents/skills/locked/SKILL.md`]: "locked",
            [`${PROJECT}/.agents/skills/notes/readme.md`]: "no SKILL.md here",
        });
        mocks.readFileFromDisk.mockImplementation(async (path: string) => {
            if (path.includes("locked")) throw new Error("denied");
            return "   \n";
        });

        await expect(discoverSkills()).resolves.toEqual({ projectPath: PROJECT, items: [] });
    });

    it("discards results from a scan that was superseded", async () => {
        serve({ [`${PROJECT}/.agents/guide.md`]: "guide body" });
        const served = mocks.lsDir.getMockImplementation()!;
        // Park the first listing call (the stale scan's), let later ones through.
        let releaseStale: ((entries: { name: string; path: string; is_dir: boolean }[]) => void) | null = null;
        mocks.lsDir.mockImplementation(async (path: string) => {
            if (!releaseStale) {
                return new Promise<{ name: string; path: string; is_dir: boolean }[]>((resolve) => {
                    releaseStale = resolve;
                });
            }
            return served(path);
        });

        const stale = discoverSkills();
        await new Promise((resolve) => setTimeout(resolve, 0)); // stale scan is parked
        const fresh = discoverSkills();
        expect((await fresh).items).toHaveLength(1);

        releaseStale!([{ name: "guide.md", path: `${PROJECT}/.agents/guide.md`, is_dir: false }]);
        await expect(stale).resolves.toEqual({ projectPath: PROJECT, items: [] });
    });

    it("discards results when a newer scan starts during a file read", async () => {
        let releaseRead: (body: string) => void = () => {};
        let readStarted: () => void = () => {};
        const started = new Promise<void>((resolve) => {
            readStarted = resolve;
        });
        serve({ [`${PROJECT}/.agents/guide.md`]: "guide body" });
        mocks.readFileFromDisk.mockImplementation(
            () =>
                new Promise<string>((resolve) => {
                    releaseRead = resolve;
                    readStarted();
                })
        );

        const stale = discoverSkills();
        await started;
        // Closing the project while the read is in flight supersedes the scan.
        mocks.getProjectPath.mockReturnValue(null);
        await expect(discoverSkills()).resolves.toEqual({ projectPath: null, items: [] });
        releaseRead("guide body");

        await expect(stale).resolves.toEqual({ projectPath: PROJECT, items: [] });
    });

    it("survives stored skills without a name", async () => {
        localStorage.setItem(SKILLS_KEY, JSON.stringify([{ id: "legacy", body: "body" }]));
        serve({ [`${PROJECT}/.agents/guide.md`]: "body" });

        await expect(discoverItems()).resolves.toHaveLength(1);
    });
});

describe("reconcileImportedRow", () => {
    /** A discovered row for `dir/file` with the given body. */
    const row = (relPath: string, body: string, status: "new" | "changed" = "new") => ({
        name: relPath.split("/")[1].replace(/\..*$/, ""),
        description: "",
        body,
        fileName: relPath.split("/")[1],
        folder: `${PROJECT}/${relPath.split("/")[0]}`,
        relPath,
        projectPath: PROJECT,
        scope: "project" as const,
        rootLabel: relPath.split("/")[0],
        status,
        shadowed: [],
    });

    it("drops the imported row and reclassifies files that share its skill ID", () => {
        const items = [
            row(".agents/guide.md", "imported body"),
            row(".claude/guide.mdc", "other body"),
            row(".agents/notes.md", "notes"),
        ];

        const remaining = reconcileImportedRow(items, ".agents/guide.md", { id: "guide", body: "imported body" });

        expect(remaining.map((item) => item.relPath)).toEqual([".claude/guide.mdc", ".agents/notes.md"]);
        expect(remaining[0].status).toBe("changed");
        expect(remaining[1].status).toBe("new");
    });

    it("drops files that already match the saved body", () => {
        const items = [row(".claude/guide.mdc", "imported body")];

        expect(reconcileImportedRow(items, ".agents/guide.md", { id: "guide", body: "imported body" })).toEqual([]);
    });
});

describe("listSkills", () => {
    it("ignores stored records without an ID, name, or body", () => {
        localStorage.setItem(
            SKILLS_KEY,
            JSON.stringify([
                { id: "good", name: "Good", body: "body" },
                { id: "no-name", body: "body" },
                { name: "No ID", body: "body" },
                { id: "no-body", name: "No Body" },
                null,
            ])
        );

        expect(listSkills().map((skill) => skill.id)).toEqual(["good"]);
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

type Entry = { name: string; path: string; is_dir: boolean };

const mocks = vi.hoisted(() => ({
    lsDir: vi.fn(),
    readFileFromDisk: vi.fn(),
    getProjectPath: vi.fn(),
}));

vi.mock("@/lib/backend/commands", () => ({
    commands: {
        lsDir: mocks.lsDir,
        readFileFromDisk: mocks.readFileFromDisk,
    },
}));

vi.mock("@/lib/backend/project-state", () => ({
    getProjectPath: mocks.getProjectPath,
}));

import { dismissDiscoveredFile, discoverSkills, reconcileImportedRow } from "@/lib/chat/discover-skills";
import { addSkill, listSkills, skillIdFromName } from "@/lib/chat/skills";

/** Rows from a scan of the default project. */
async function discoverItems() {
    return (await discoverSkills()).items;
}

const PROJECT = "/home/dev/demo";
/** localStorage key used by lib/chat/skills.ts. */
const SKILLS_KEY = "shape-skills";

/** A non-directory listing entry for `dir/name`. */
function fileEntry(dir: string, name: string): Entry {
    return { name, path: `${dir}/${name}`, is_dir: false };
}

/** Serve directory listings and file bodies from a `.agents`/`.claude` fixture. */
function serve(files: Record<string, string>, project = PROJECT) {
    const dirs = [".agents", ".claude"];
    const sep = project.includes("\\") ? "\\" : "/";
    mocks.lsDir.mockImplementation(async (path: string) => {
        const dir = dirs.find((name) => path === `${project}${sep}${name}`);
        if (!dir) throw new Error(`no such directory: ${path}`);
        return Object.keys(files)
            .filter((file) => file.startsWith(`${dir}/`))
            .map((file) => fileEntry(`${project}${sep}${dir}`, file.slice(dir.length + 1)));
    });
    mocks.readFileFromDisk.mockImplementation(async (path: string) =>
        files[path.slice(project.length + 1).replace(/\\/g, "/")]
    );
}

beforeEach(() => {
    mocks.lsDir.mockReset();
    mocks.readFileFromDisk.mockReset();
    mocks.getProjectPath.mockReset();
    mocks.getProjectPath.mockReturnValue(PROJECT);
});

describe("discoverSkills", () => {
    it("discovers .agents markdown and .claude rule files", async () => {
        serve({
            ".agents/guide.md": "# Guide\n\nBody\n",
            ".claude/rules.mdc": "Rule body",
        });

        const { projectPath, items: discovered } = await discoverSkills();

        expect(projectPath).toBe(PROJECT);
        expect(discovered.map((item) => item.relPath)).toEqual([".agents/guide.md", ".claude/rules.mdc"]);
        expect(discovered[0]).toMatchObject({
            name: "guide",
            body: "# Guide\n\nBody",
            fileName: "guide.md",
            sourceDir: ".agents",
            projectPath: PROJECT,
            status: "new",
        });
    });

    it("ignores extensions outside the discovery scope", async () => {
        serve({
            ".agents/notes.txt": "notes",
            ".agents/rules.mdc": "rule",
            ".claude/guide.md": "guide",
            ".claude/notes.txt": "notes",
        });

        await expect(discoverSkills()).resolves.toEqual({ projectPath: PROJECT, items: [] });
    });

    it("reports the project it read, and nothing when no project is open", async () => {
        mocks.getProjectPath.mockReturnValue(null);

        await expect(discoverSkills()).resolves.toEqual({ projectPath: null, items: [] });
        expect(mocks.lsDir).not.toHaveBeenCalled();
    });

    it("classifies a file as changed when its slug already maps to a saved skill", async () => {
        addSkill("My Skill", "old body");
        serve({ ".agents/my_skill.md": "new body" });

        const [discovered] = await discoverItems();

        expect(skillIdFromName("my_skill.md")).toBe("my-skill");
        expect(discovered).toMatchObject({
            name: "my_skill",
            body: "new body",
            status: "changed",
        });
    });

    it("skips files that already match the saved skill", async () => {
        addSkill("guide", "Body text");
        serve({ ".agents/guide.md": "Body text\n" });

        await expect(discoverSkills()).resolves.toEqual({ projectPath: PROJECT, items: [] });
    });

    it("keeps dismissals scoped to the directory of the file", async () => {
        serve({
            ".agents/guide.md": "agent body",
            ".claude/guide.mdc": "claude body",
        });

        dismissDiscoveredFile(PROJECT, ".agents/guide.md");
        const discovered = await discoverItems();

        expect(discovered.map((item) => item.relPath)).toEqual([".claude/guide.mdc"]);
    });

    it("keeps dismissals scoped to the project", async () => {
        serve({ ".agents/guide.md": "agent body" });
        dismissDiscoveredFile("/home/dev/other", ".agents/guide.md");

        await expect(discoverItems()).resolves.toHaveLength(1);
    });

    it("keeps case-sensitive project paths apart in dismissal keys", async () => {
        serve({ ".agents/guide.md": "agent body" });
        // /home/dev/DEMO is a different directory from /home/dev/demo on Linux.
        dismissDiscoveredFile("/home/dev/DEMO", ".agents/guide.md");

        await expect(discoverItems()).resolves.toHaveLength(1);
    });

    it("treats Windows project paths case-insensitively for dismissals", async () => {
        mocks.getProjectPath.mockReturnValue("c:\\work\\demo");
        serve({ ".agents/guide.md": "agent body" }, "c:\\work\\demo");
        dismissDiscoveredFile("C:\\Work\\Demo", ".agents/guide.md");

        await expect(discoverItems()).resolves.toEqual([]);
    });

    it("does not leak dismissals between projects onto case-insensitive setups", async () => {
        mocks.getProjectPath.mockReturnValue("c:\\work\\other");
        serve({ ".agents/guide.md": "agent body" }, "c:\\work\\other");
        dismissDiscoveredFile("C:\\Work\\Demo", ".agents/guide.md");

        await expect(discoverItems()).resolves.toHaveLength(1);
    });

    it("skips unreadable and empty files", async () => {
        serve({ ".agents/empty.md": "   \n", ".agents/locked.md": "locked" });
        mocks.readFileFromDisk.mockImplementation(async (path: string) => {
            if (path.endsWith("locked.md")) throw new Error("denied");
            return "   \n";
        });

        await expect(discoverSkills()).resolves.toEqual({ projectPath: PROJECT, items: [] });
    });

    it("uses the project's own path separator", async () => {
        const windowsProject = "C:\\work\\demo";
        mocks.getProjectPath.mockReturnValue(windowsProject);
        mocks.lsDir.mockImplementation(async (path: string) => {
            if (path !== `${windowsProject}\\.agents`) throw new Error(`no such directory: ${path}`);
            return [fileEntry(`${windowsProject}\\.agents`, "guide.md")];
        });
        mocks.readFileFromDisk.mockImplementation(async () => "windows body");

        const [discovered] = await discoverItems();

        expect(discovered).toMatchObject({ relPath: ".agents/guide.md", body: "windows body" });
        expect(mocks.readFileFromDisk).toHaveBeenCalledWith(`${windowsProject}\\.agents\\guide.md`);
    });

    it("discards results when a newer scan starts during a file read", async () => {
        let releaseRead: (body: string) => void = () => {};
        let readStarted: () => void = () => {};
        const started = new Promise<void>((resolve) => {
            readStarted = resolve;
        });
        serve({ ".agents/guide.md": "guide body" });
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

    it("discards results from a scan that was superseded", async () => {
        let releaseStale: (entries: Entry[]) => void = () => {};
        mocks.lsDir.mockImplementationOnce(
            () =>
                new Promise<Entry[]>((resolve) => {
                    releaseStale = resolve;
                })
        );
        serve({ ".agents/guide.md": "body" });

        const stale = discoverSkills();
        const fresh = discoverSkills();
        releaseStale([fileEntry(`${PROJECT}/.agents`, "guide.md")]);

        const freshScan = await fresh;
        expect(freshScan.projectPath).toBe(PROJECT);
        expect(freshScan.items).toHaveLength(1);
        await expect(stale).resolves.toEqual({ projectPath: PROJECT, items: [] });
    });

    it("survives stored skills without a name", async () => {
        localStorage.setItem(SKILLS_KEY, JSON.stringify([{ id: "legacy", body: "body" }]));
        serve({ ".agents/guide.md": "body" });

        await expect(discoverItems()).resolves.toHaveLength(1);
    });
});

describe("reconcileImportedRow", () => {
    /** A discovered row for `dir/file` with the given body. */
    const row = (relPath: string, body: string, status: "new" | "changed" = "new") => ({
        name: relPath.split("/")[1].replace(/\..*$/, ""),
        body,
        fileName: relPath.split("/")[1],
        sourceDir: relPath.split("/")[0],
        relPath,
        projectPath: PROJECT,
        status,
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

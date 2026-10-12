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

import { dismissDiscoveredFile, discoverSkills } from "@/lib/chat/discover-skills";
import { addSkill, listSkills, skillIdFromName } from "@/lib/chat/skills";

const PROJECT = "/home/dev/demo";
/** localStorage key used by lib/chat/skills.ts. */
const SKILLS_KEY = "shape-skills";

function fileEntry(dir: string, name: string): Entry {
    return { name, path: `${dir}/${name}`, is_dir: false };
}

/** Serve directory listings and file bodies from a `.agents`/`.claude` fixture. */
function serve(files: Record<string, string>) {
    const dirs = [".agents", ".claude"];
    mocks.lsDir.mockImplementation(async (path: string) => {
        const dir = dirs.find((name) => path === `${PROJECT}/${name}`);
        if (!dir) throw new Error(`no such directory: ${path}`);
        return Object.keys(files)
            .filter((file) => file.startsWith(`${dir}/`))
            .map((file) => fileEntry(`${PROJECT}/${dir}`, file.slice(dir.length + 1)));
    });
    mocks.readFileFromDisk.mockImplementation(async (path: string) => files[path.slice(PROJECT.length + 1)]);
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

        const discovered = await discoverSkills();

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

        await expect(discoverSkills()).resolves.toEqual([]);
    });

    it("returns nothing when no project is open", async () => {
        mocks.getProjectPath.mockReturnValue(null);

        await expect(discoverSkills()).resolves.toEqual([]);
        expect(mocks.lsDir).not.toHaveBeenCalled();
    });

    it("classifies a file as changed when its slug already maps to a saved skill", async () => {
        addSkill("My Skill", "old body");
        serve({ ".agents/my_skill.md": "new body" });

        const [discovered] = await discoverSkills();

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

        await expect(discoverSkills()).resolves.toEqual([]);
    });

    it("keeps dismissals scoped to the directory of the file", async () => {
        serve({
            ".agents/guide.md": "agent body",
            ".claude/guide.mdc": "claude body",
        });

        dismissDiscoveredFile(PROJECT, ".agents/guide.md");
        const discovered = await discoverSkills();

        expect(discovered.map((item) => item.relPath)).toEqual([".claude/guide.mdc"]);
    });

    it("keeps dismissals scoped to the project", async () => {
        serve({ ".agents/guide.md": "agent body" });
        dismissDiscoveredFile("/home/dev/other", ".agents/guide.md");

        await expect(discoverSkills()).resolves.toHaveLength(1);
    });

    it("skips unreadable and empty files", async () => {
        serve({ ".agents/empty.md": "   \n", ".agents/locked.md": "locked" });
        mocks.readFileFromDisk.mockImplementation(async (path: string) => {
            if (path.endsWith("locked.md")) throw new Error("denied");
            return "   \n";
        });

        await expect(discoverSkills()).resolves.toEqual([]);
    });

    it("uses the project's own path separator", async () => {
        const windowsProject = "C:\\work\\demo";
        mocks.getProjectPath.mockReturnValue(windowsProject);
        mocks.lsDir.mockImplementation(async (path: string) => {
            if (path !== `${windowsProject}\\.agents`) throw new Error(`no such directory: ${path}`);
            return [fileEntry(`${windowsProject}\\.agents`, "guide.md")];
        });
        mocks.readFileFromDisk.mockImplementation(async () => "windows body");

        const [discovered] = await discoverSkills();

        expect(discovered).toMatchObject({ relPath: ".agents/guide.md", body: "windows body" });
        expect(mocks.readFileFromDisk).toHaveBeenCalledWith(`${windowsProject}\\.agents\\guide.md`);
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

        await expect(fresh).resolves.toHaveLength(1);
        await expect(stale).resolves.toEqual([]);
    });

    it("survives stored skills without a name", async () => {
        localStorage.setItem(SKILLS_KEY, JSON.stringify([{ id: "legacy", body: "body" }]));
        serve({ ".agents/guide.md": "body" });

        await expect(discoverSkills()).resolves.toHaveLength(1);
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

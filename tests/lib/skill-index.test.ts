import { beforeEach, describe, expect, it, vi } from "vitest";
import { serveSkillFs } from "../helpers/skill-fs";

const mocks = vi.hoisted(() => ({
    lsDir: vi.fn(),
    readFileFromDisk: vi.fn(),
    readFileWithin: vi.fn(),
    ensurePathWithin: vi.fn(),
    homeDir: vi.fn(),
    getProjectPath: vi.fn(),
    listCustomSkillFolders: vi.fn(),
}));

vi.mock("@/lib/backend/commands", () => ({
    commands: {
        lsDir: mocks.lsDir,
        readFileFromDisk: mocks.readFileFromDisk,
        readFileWithin: mocks.readFileWithin,
        ensurePathWithin: mocks.ensurePathWithin,
    },
}));

vi.mock("@/lib/backend/project-state", () => ({
    getProjectPath: mocks.getProjectPath,
    subscribeProjectState: vi.fn(() => () => {}),
}));

vi.mock("@/lib/chat/skill-folders", () => ({
    getHomeDir: mocks.homeDir,
    listCustomSkillFolders: mocks.listCustomSkillFolders,
    subscribeCustomSkillFolders: vi.fn(() => () => {}),
}));

import {
    ensureFreshScan,
    getCurrentProjectDiscoveries,
    importDiscoveredSkill,
    isSkillIndexScanning,
    refreshSkillIndex,
    getSkillIndex,
    resetSkillIndex,
    resolveDiscoveredSkill,
    resolveDiscoveredSkillBySource,
} from "@/lib/chat/skill-index";
import { dismissDiscoveredFile } from "@/lib/chat/discover-skills";
import { listSkills } from "@/lib/chat/skills";

const PROJECT = "/home/dev/demo";
const HOME = "/home/dev";

function skillFile(name: string, description: string, body: string): string {
    return ["---", `name: ${name}`, `description: ${description}`, "---", "", body].join("\n");
}

function serve(files: Record<string, string>) {
    serveSkillFs(mocks, files, { homeDir: HOME });
}

beforeEach(() => {
    resetSkillIndex();
    mocks.lsDir.mockReset();
    mocks.readFileFromDisk.mockReset();
    mocks.readFileWithin.mockReset();
    mocks.ensurePathWithin.mockReset();
    mocks.homeDir.mockReset();
    mocks.getProjectPath.mockReset();
    mocks.listCustomSkillFolders.mockReset();
    mocks.getProjectPath.mockReturnValue(PROJECT);
    mocks.homeDir.mockResolvedValue(HOME);
    mocks.listCustomSkillFolders.mockReturnValue([]);
});

describe("skill index", () => {
    it("publishes rows for the open project", async () => {
        serve({ [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf", "PDFs.", "Body.") });

        await refreshSkillIndex();

        expect(getCurrentProjectDiscoveries().map((item) => item.relPath)).toEqual([".claude/skills/pdf/SKILL.md"]);
        expect(isSkillIndexScanning()).toBe(false);
    });

    it("hides rows that belong to another project", async () => {
        serve({ [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf", "PDFs.", "Body.") });
        await refreshSkillIndex();
        expect(getCurrentProjectDiscoveries()).toHaveLength(1);

        mocks.getProjectPath.mockReturnValue("/home/dev/other");
        // No rescan yet: the previous project's rows must not leak into the panel.
        expect(getCurrentProjectDiscoveries()).toEqual([]);
        expect(isSkillIndexScanning()).toBe(true);
    });

    it("rescans when the open project changes", async () => {
        serve({ [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf", "PDFs.", "Body.") });
        await refreshSkillIndex();

        serve({ "/home/dev/other/.claude/skills/site/SKILL.md": skillFile("site", "Sites.", "Body.") });
        mocks.getProjectPath.mockReturnValue("/home/dev/other");
        ensureFreshScan();
        await refreshSkillIndex();

        expect(getCurrentProjectDiscoveries().map((item) => item.relPath)).toEqual([".claude/skills/site/SKILL.md"]);
    });

    it("imports a row into the library and reclassifies its siblings", async () => {
        serve({
            [`${PROJECT}/.agents/guide.md`]: "agent body",
            [`${PROJECT}/.claude/guide.mdc`]: "claude body",
        });
        await refreshSkillIndex();

        const first = getCurrentProjectDiscoveries().find((item) => item.relPath === ".agents/guide.md")!;
        const saved = importDiscoveredSkill(first);

        expect(saved.id).toBe("guide");
        expect(listSkills().map((skill) => skill.body)).toEqual(["agent body"]);
        expect(getCurrentProjectDiscoveries()).toHaveLength(1);
        expect(getCurrentProjectDiscoveries()[0]).toMatchObject({ relPath: ".claude/guide.mdc", status: "changed" });
    });

    it("does not let a refresh started before an import restore the row", async () => {
        serve({ [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf", "PDFs.", "Body.") });
        await refreshSkillIndex();

        const served = mocks.lsDir.getMockImplementation()!;
        let releaseRefresh: ((entries: { name: string; path: string; is_dir: boolean }[]) => void) | null = null;
        mocks.lsDir.mockImplementation(async (path: string) => {
            if (!releaseRefresh) {
                return new Promise<{ name: string; path: string; is_dir: boolean }[]>((resolve) => {
                    releaseRefresh = resolve;
                });
            }
            return served(path);
        });

        const pending = refreshSkillIndex();
        await new Promise((resolve) => setTimeout(resolve, 0));
        importDiscoveredSkill(getCurrentProjectDiscoveries()[0]);

        releaseRefresh!([]);
        await pending;

        expect(getCurrentProjectDiscoveries()).toEqual([]);
        expect(listSkills().map((skill) => skill.id)).toEqual(["pdf"]);
    });

    it("resolves an unimported skill from disk with its current contents", async () => {
        serve({ [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf-processing", "PDFs.", "First body.") });

        const resolved = await resolveDiscoveredSkill("pdf-processing");

        expect(resolved).toMatchObject({ name: "pdf-processing", body: "First body.", folder: `${PROJECT}/.claude/skills/pdf` });

        // The file changed on disk since the scan: mentions must see the new text.
        serve({ [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf-processing", "PDFs.", "Edited body.") });
        expect((await resolveDiscoveredSkill("pdf-processing"))?.body).toBe("Edited body.");
    });

    it("still resolves a dismissed skill asked for by name", async () => {
        serve({ [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf-processing", "PDFs.", "Body.") });
        dismissDiscoveredFile(PROJECT, ".claude/skills/pdf/SKILL.md");

        expect((await resolveDiscoveredSkill("pdf-processing"))?.body).toBe("Body.");
    });

    it("resolves the file the user picked when another skill shares the name", async () => {
        serve({
            [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf", "Claude.", "Claude body."),
            [`${PROJECT}/.agents/skills/pdf/SKILL.md`]: skillFile("pdf", "Agents.", "Agents body."),
        });

        const picked = await resolveDiscoveredSkillBySource(".agents/skills/pdf/SKILL.md");

        expect(picked?.body).toBe("Agents body.");
        expect(picked?.relPath).toBe(".agents/skills/pdf/SKILL.md");
        expect((await resolveDiscoveredSkill("pdf"))?.body).toBe("Claude body.");
    });

    it("keeps the previous rows when a rescan throws", async () => {
        serve({ [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf", "PDFs.", "Body.") });
        await refreshSkillIndex();

        mocks.homeDir.mockRejectedValue(new Error("no home"));
        await refreshSkillIndex();

        expect(getCurrentProjectDiscoveries()).toHaveLength(1);
        expect(getSkillIndex().error).toBe("Could not scan skill folders.");
    });

    it("returns null for a skill that does not exist on disk", async () => {
        serve({});

        await expect(resolveDiscoveredSkill("nope")).resolves.toBeNull();
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { serveSkillFs } from "../helpers/skill-fs";
import { resetSettings } from "../helpers/settings";

const mocks = vi.hoisted(() => ({
    lsDir: vi.fn(),
    readFileFromDisk: vi.fn(),
    homeDir: vi.fn(),
    getProjectPath: vi.fn(),
}));

vi.mock("@/lib/backend/commands", () => ({
    setInvokeLogger: vi.fn(),
    commands: {
        lsDir: mocks.lsDir,
        readFileFromDisk: mocks.readFileFromDisk,
        homeDir: mocks.homeDir,
        searchProjectFiles: vi.fn(async () => []),
        getConversations: vi.fn(async () => []),
        getMcpStatus: vi.fn(async () => []),
    },
}));

vi.mock("@/lib/backend/project-state", () => ({
    getProjectPath: mocks.getProjectPath,
    subscribeProjectState: vi.fn(() => () => {}),
}));

import { buildMessageWithMentions } from "@/lib/chat/mentions";
import { resetHomeDirCache } from "@/lib/chat/skill-folders";
import { resetSkillIndex } from "@/lib/chat/skill-index";
import { addSkill, listSkills } from "@/lib/chat/skills";

const PROJECT = "/home/dev/demo";
const HOME = "/home/dev";

/** A SKILL.md body with frontmatter. */
function skillFile(name: string, description: string, body: string): string {
    return ["---", `name: ${name}`, `description: ${description}`, "---", "", body].join("\n");
}

function serve(files: Record<string, string>) {
    serveSkillFs(mocks, files, { homeDir: HOME });
}

beforeEach(() => {
    resetSettings();
    resetSkillIndex();
    resetHomeDirCache();
    mocks.lsDir.mockReset();
    mocks.readFileFromDisk.mockReset();
    mocks.homeDir.mockReset();
    mocks.getProjectPath.mockReset();
    mocks.getProjectPath.mockReturnValue(PROJECT);
});

describe("skill mentions", () => {
    it("uses the saved library skill and never reads disk", async () => {
        addSkill("pdf-processing", "Library body.");
        serve({
            [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf-processing", "Disk copy.", "Disk body."),
        });

        const message = await buildMessageWithMentions("use @skill:pdf-processing", PROJECT);

        expect(message).toContain('type="skill"');
        expect(message).toContain('id="pdf-processing"');
        expect(message).toContain("Library body.");
        expect(message).not.toContain("Disk body.");
        // Library skills are already in the workspace, so there is no file to cite.
        expect(message).not.toContain("source=");
    });

    it("falls back to a project skill file on disk without importing it", async () => {
        serve({
            [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf-processing", "Work with PDFs.", "Disk body."),
        });

        const message = await buildMessageWithMentions("use @skill:pdf-processing", PROJECT);

        expect(message).toContain('type="skill"');
        expect(message).toContain('name="pdf-processing"');
        expect(message).toContain('description="Work with PDFs."');
        expect(message).toContain('source=".claude/skills/pdf/SKILL.md"');
        expect(message).toContain("Disk body.");
        expect(message).not.toContain("The skill folder is");
        // Mentioning a skill must not silently copy it into the library.
        expect(listSkills()).toEqual([]);
    });

    it("points at the folder when the skill comes from the user's own folders", async () => {
        serve({
            [`${HOME}/.agents/skills/commit/SKILL.md`]: skillFile("commit-messages", "Write commits.", "Personal body."),
        });

        const message = await buildMessageWithMentions("use @skill:commit-messages", PROJECT);

        expect(message).toContain('source="~/.agents/skills/commit/SKILL.md"');
        expect(message).toContain("Personal body.");
        expect(message).toContain(`${HOME}/.agents/skills/commit`);
    });

    it("still resolves a skill the user dismissed in the settings panel", async () => {
        const { dismissDiscoveredFile } = await import("@/lib/chat/discover-skills");
        serve({
            [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf-processing", "Work with PDFs.", "Disk body."),
        });
        dismissDiscoveredFile(PROJECT, ".claude/skills/pdf/SKILL.md");

        const message = await buildMessageWithMentions("use @skill:pdf-processing", PROJECT);

        expect(message).toContain("Disk body.");
    });

    it("reports a skill that exists nowhere as not installed", async () => {
        serve({});

        const message = await buildMessageWithMentions("use @skill:missing-skill", PROJECT);

        expect(message).toContain('id="missing-skill"');
        expect(message).toContain("not installed");
        expect(message).not.toContain("Follow this skill");
    });
});

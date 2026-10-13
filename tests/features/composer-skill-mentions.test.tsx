import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serveSkillFs } from "../helpers/skill-fs";
import { resetSettings } from "../helpers/settings";

const mocks = vi.hoisted(() => ({
    lsDir: vi.fn(),
    readFileFromDisk: vi.fn(),
    homeDir: vi.fn(),
    getProjectPath: vi.fn(),
    searchProjectFiles: vi.fn(),
    getConversations: vi.fn(),
    getMcpStatus: vi.fn(),
}));

vi.mock("@/lib/backend/commands", () => ({
    setInvokeLogger: vi.fn(),
    commands: {
        lsDir: mocks.lsDir,
        readFileFromDisk: mocks.readFileFromDisk,
        homeDir: mocks.homeDir,
        searchProjectFiles: mocks.searchProjectFiles,
        getConversations: mocks.getConversations,
        getMcpStatus: mocks.getMcpStatus,
    },
}));

vi.mock("@/lib/backend/project-state", () => ({
    getProjectPath: mocks.getProjectPath,
    subscribeProjectState: vi.fn(() => () => {}),
    useProjectState: () => ({ project_path: mocks.getProjectPath(), open_files: [], active_file: null }),
}));

vi.mock("@/lib/plugins/api", () => ({
    peekPluginsCache: () => null,
    fetchPlugins: vi.fn(async () => ({ plugins: [], configured: false })),
}));

import { MentionPicker } from "@/features/chat/ui/composer/mentions";
import { resetHomeDirCache } from "@/lib/chat/skill-folders";
import { refreshSkillIndex, resetSkillIndex } from "@/lib/chat/skill-index";
import { addSkill } from "@/lib/chat/skills";

const PROJECT = "/home/dev/demo";
const HOME = "/home/dev";

function skillFile(name: string, description: string, body: string): string {
    return ["---", `name: ${name}`, `description: ${description}`, "---", "", body].join("\n");
}

function serve(files: Record<string, string>) {
    serveSkillFs(mocks, files, { homeDir: HOME });
}

/** Buttons in the open picker menu, wherever the portal put them. */
function buttons(): HTMLButtonElement[] {
    return Array.from(document.querySelectorAll("button"));
}

/** Pick the category whose label is exactly `label`. */
async function openCategory(label: string) {
    await act(async () => {
        buttons()
            .find((button) => button.textContent?.trim() === label)
            ?.click();
    });
}

/** Labels of the rows currently shown by the picker. */
function rowLabels(): string[] {
    return buttons().map((button) => button.textContent?.trim() ?? "");
}

describe("mention picker: skills", () => {
    let root: Root;
    let host: HTMLDivElement;
    let anchor: HTMLTextAreaElement;
    let anchorRef: { current: HTMLTextAreaElement | null };

    beforeEach(() => {
        resetSettings();
        resetSkillIndex();
        resetHomeDirCache();
        mocks.lsDir.mockReset();
        mocks.readFileFromDisk.mockReset();
        mocks.homeDir.mockReset();
        mocks.getProjectPath.mockReset();
        mocks.searchProjectFiles.mockReset();
        mocks.getConversations.mockReset();
        mocks.getMcpStatus.mockReset();
        mocks.getProjectPath.mockReturnValue(PROJECT);
        mocks.searchProjectFiles.mockResolvedValue([]);
        mocks.getConversations.mockResolvedValue([]);
        mocks.getMcpStatus.mockResolvedValue([]);
        host = document.createElement("div");
        document.body.appendChild(host);
        // The menu measures the caret's textarea before it renders.
        anchor = document.createElement("textarea");
        document.body.appendChild(anchor);
        anchorRef = { current: anchor };
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        anchor.remove();
    });

    /** Open the picker on an empty query and wait for its scan. */
    async function mount(query = "") {
        await act(async () => {
            root.render(
                <MentionPicker open query={query} onPick={() => {}} onClose={() => {}} anchorRef={anchorRef} />
            );
        });
        await act(async () => {
            await refreshSkillIndex();
        });
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }

    it("offers skills found on disk alongside the saved ones", async () => {
        serve({ [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf-processing", "Work with PDFs.", "Body.") });
        await mount();

        await openCategory("Skills");

        expect(rowLabels().some((label) => label.includes("pdf-processing · on disk"))).toBe(true);
    });

    it("marks personal skills as on disk too", async () => {
        serve({ [`${HOME}/.agents/skills/commit/SKILL.md`]: skillFile("commit-messages", "Write commits.", "Body.") });
        await mount();

        await openCategory("Skills");

        expect(rowLabels().some((label) => label.includes("commit-messages · on disk"))).toBe(true);
    });

    it("lists a saved skill once, without the on-disk suffix", async () => {
        addSkill("pdf-processing", "Library body.");
        serve({ [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf-processing", "Work with PDFs.", "Body.") });
        await mount();

        await openCategory("Skills");

        const rows = rowLabels().filter((label) => label.startsWith("pdf-processing"));
        expect(rows).toHaveLength(1);
        expect(rows[0]).not.toContain("on disk");
    });

    it("inserts an @skill: token for a skill picked from disk", async () => {
        const picked: string[] = [];
        serve({ [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf-processing", "Work with PDFs.", "Body.") });
        await act(async () => {
            root.render(
                <MentionPicker
                    open
                    query=""
                    onPick={(token) => picked.push(token)}
                    onClose={() => {}}
                    anchorRef={anchorRef}
                />
            );
        });
        await act(async () => {
            await refreshSkillIndex();
        });
        await openCategory("Skills");

        await act(async () => {
            buttons()
                .find((button) => button.textContent?.includes("pdf-processing · on disk"))
                ?.click();
        });

        expect(picked).toEqual(["@skill:pdf-processing "]);
    });

    it("never lists another project's skill files", async () => {
        mocks.getProjectPath.mockReturnValue("/home/dev/other");
        serve({ [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf-processing", "Work with PDFs.", "Body.") });
        await mount();

        await openCategory("Skills");

        expect(rowLabels().some((label) => label.includes("pdf-processing"))).toBe(false);
    });

    it("filters the on-disk rows by the typed query", async () => {
        serve({
            [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf-processing", "Work with PDFs.", "Body."),
            [`${PROJECT}/.agents/skills/commit/SKILL.md`]: skillFile("commit-messages", "Write commits.", "Body."),
        });
        await mount();

        await openCategory("Skills");
        await act(async () => {
            root.render(
                <MentionPicker open query="comm" onPick={() => {}} onClose={() => {}} anchorRef={anchorRef} />
            );
        });

        const skillsMenu = rowLabels().filter((label) => label.includes("commit") || label.includes("pdf"));
        expect(skillsMenu.some((label) => label.includes("commit-messages"))).toBe(true);
        expect(skillsMenu.some((label) => label.includes("pdf-processing"))).toBe(false);
    });
});

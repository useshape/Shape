import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serveSkillFs } from "../helpers/skill-fs";

const mocks = vi.hoisted(() => ({
    lsDir: vi.fn(),
    readFileFromDisk: vi.fn(),
    homeDir: vi.fn(),
    getProjectPath: vi.fn(),
    projectState: vi.fn(),
    pickFolder: vi.fn(),
}));

vi.mock("@/lib/backend/commands", () => ({
    commands: { lsDir: mocks.lsDir, readFileFromDisk: mocks.readFileFromDisk, homeDir: mocks.homeDir },
}));

vi.mock("@/lib/backend/project-state", () => ({
    getProjectPath: mocks.getProjectPath,
    useProjectState: mocks.projectState,
    subscribeProjectState: vi.fn(() => () => {}),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.pickFolder }));

import { SkillsSettings } from "@/features/settings/ui/sections/skills";
import { refreshSkillIndex, resetSkillIndex } from "@/lib/chat/skill-index";
import { listSkills } from "@/lib/chat/skills";
import { getSettings } from "@/lib/settings";
import { resetHomeDirCache } from "@/lib/chat/skill-folders";
import { resetSettings } from "../helpers/settings";

const PROJECT = "/home/dev/demo";
const OTHER_PROJECT = "/home/dev/other";
const HOME = "/home/dev";

function skillFile(name: string, description: string, body: string): string {
    return ["---", `name: ${name}`, `description: ${description}`, "---", "", body].join("\n");
}

function serve(files: Record<string, string>) {
    serveSkillFs(mocks, files, { homeDir: HOME });
}

/** The button carrying `aria-label`, if it is rendered. */
function buttonWithLabel(host: HTMLElement, label: string): HTMLButtonElement | undefined {
    return Array.from(host.querySelectorAll("button")).find((node) => node.getAttribute("aria-label") === label);
}

/** Every per-file Dismiss button currently rendered. */
function dismissButtons(host: HTMLElement): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll("button")).filter((node) =>
        (node.getAttribute("aria-label") ?? "").startsWith("Dismiss ")
    );
}

/** Text of the row (or action) that carries `label`. */
function rowText(host: HTMLElement, label: string): string {
    const node = Array.from(host.querySelectorAll("*")).find((element) =>
        (element.textContent ?? "").trim().startsWith(label) && element.children.length > 0
    );
    return node?.textContent ?? "";
}

describe("skills settings", () => {
    let root: Root;
    let host: HTMLDivElement;

    beforeEach(() => {
        resetSkillIndex();
        resetHomeDirCache();
        resetSettings();
        mocks.lsDir.mockReset();
        mocks.readFileFromDisk.mockReset();
        mocks.homeDir.mockReset();
        mocks.getProjectPath.mockReset();
        mocks.projectState.mockReset();
        mocks.pickFolder.mockReset();
        mocks.getProjectPath.mockReturnValue(PROJECT);
        mocks.homeDir.mockReturnValue(HOME);
        mocks.projectState.mockReturnValue({ project_path: PROJECT, open_files: [], active_file: null });
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    /**
     * Render the panel against the tree the test serves. A settings change
     * (or an unmount from the previous test) can leave the shared index
     * scanning the tree as it was before `serve()`, so wait for a scan that
     * started after it.
     */
    async function mount() {
        await act(async () => {
            root.render(<SkillsSettings />);
        });
        await act(async () => {
            await refreshSkillIndex();
        });
    }

    /** Let an action that changes settings trigger and settle its rescan. */
    async function settle() {
        await act(async () => {
            await refreshSkillIndex();
        });
    }

    it("keeps the refresh control available when nothing is discovered", async () => {
        serve({});
        await mount();

        expect(host.textContent).toContain("Discovered");
        expect(host.textContent).toContain("No new skill files found.");
        expect(buttonWithLabel(host, "Scan for new skills")).toBeDefined();
    });

    it("lists skills found in project and personal folders", async () => {
        serve({
            [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillFile("pdf-processing", "Work with PDFs.", "Body."),
            [`${HOME}/.agents/skills/commit/SKILL.md`]: skillFile("commit-messages", "Write commits.", "Body."),
        });
        await mount();

        expect(host.textContent).toContain("pdf-processing");
        expect(host.textContent).toContain("Work with PDFs.");
        expect(host.textContent).toContain(".claude/skills/pdf/SKILL.md");
        expect(host.textContent).toContain("~/.agents/skills/commit/SKILL.md");
        expect(buttonWithLabel(host, "Import pdf-processing")).toBeDefined();
        expect(buttonWithLabel(host, "Import commit-messages")).toBeDefined();
    });

    it("imports a discovered file and removes its row", async () => {
        serve({ [`${PROJECT}/.agents/guide.md`]: "Guide body" });
        await mount();

        await act(async () => {
            buttonWithLabel(host, "Import guide")?.click();
        });

        expect(listSkills().map((skill) => skill.id)).toEqual(["guide"]);
        expect(buttonWithLabel(host, "Import guide")).toBeUndefined();
    });

    it("offers the other file with the same skill ID as an update after import", async () => {
        serve({
            [`${PROJECT}/.agents/guide.md`]: "agent body",
            [`${PROJECT}/.claude/guide.mdc`]: "claude body",
        });
        await mount();

        await act(async () => {
            buttonWithLabel(host, "Import guide")?.click();
        });

        expect(buttonWithLabel(host, "Import guide")).toBeUndefined();
        expect(buttonWithLabel(host, "Update guide")).toBeDefined();
        expect(host.textContent).toContain(".claude/guide.mdc");
    });

    it("dismisses a file and offers to restore it", async () => {
        serve({ [`${PROJECT}/.agents/guide.md`]: "agent body" });
        await mount();

        await act(async () => {
            dismissButtons(host)[0].click();
        });

        expect(dismissButtons(host)).toHaveLength(0);
        const restore = Array.from(host.querySelectorAll("*")).find((node) => (node.textContent ?? "").includes("Restore 1 dismissed"));
        expect(restore).toBeDefined();
    });

    it("adds a skill folder the user picks and scans it", async () => {
        serve({
            [`${PROJECT}/.agents/guide.md`]: "guide body",
            "/mnt/team-skills/review/SKILL.md": skillFile("team-review", "Team review rules.", "Body."),
        });
        await mount();
        expect(host.textContent).not.toContain("team-review");

        mocks.pickFolder.mockResolvedValue("/mnt/team-skills");
        await act(async () => {
            const addRow = Array.from(host.querySelectorAll("*")).find((node) =>
                (node.textContent ?? "") === "Add skill folder"
            );
            (addRow?.closest("button") ?? (addRow as HTMLElement | null))?.click();
        });
        await settle();

        expect(getSettings().skills.folders).toEqual(["/mnt/team-skills"]);
        expect(host.textContent).toContain("team-review");
        expect(buttonWithLabel(host, "Stop scanning /mnt/team-skills")).toBeDefined();
    });

    it("stops scanning a folder the user removes", async () => {
        serve({
            "/mnt/team-skills/review/SKILL.md": skillFile("team-review", "Team review rules.", "Body."),
        });
        mocks.pickFolder.mockResolvedValue("/mnt/team-skills");
        await mount();

        await act(async () => {
            const addRow = Array.from(host.querySelectorAll("*")).find((node) =>
                (node.textContent ?? "") === "Add skill folder"
            );
            (addRow?.closest("button") ?? (addRow as HTMLElement | null))?.click();
        });
        await settle();
        expect(buttonWithLabel(host, "Stop scanning /mnt/team-skills")).toBeDefined();

        await act(async () => {
            buttonWithLabel(host, "Stop scanning /mnt/team-skills")?.click();
        });

        expect(getSettings().skills.folders).toEqual([]);
        expect(buttonWithLabel(host, "Stop scanning /mnt/team-skills")).toBeUndefined();
    });

    it("never offers rows for a project other than the one the panel shows", async () => {
        mocks.projectState.mockReturnValue({ project_path: OTHER_PROJECT, open_files: [], active_file: null });
        serve({ [`${PROJECT}/.agents/guide.md`]: "guide body" });
        await mount();

        expect(host.textContent).not.toContain(".agents/guide.md");
        expect(buttonWithLabel(host, "Import guide")).toBeUndefined();
    });

    it("explains when no project is open but still scans personal folders", async () => {
        mocks.getProjectPath.mockReturnValue(null);
        mocks.projectState.mockReturnValue({ project_path: null, open_files: [], active_file: null });
        serve({ [`${HOME}/.claude/skills/style/SKILL.md`]: skillFile("house-style", "House style.", "Body.") });
        await mount();

        expect(host.textContent).toContain("house-style");
        expect(buttonWithLabel(host, "Import house-style")).toBeDefined();
    });

    it("shows where a shadowed skill also lives", async () => {
        serve({
            [`${PROJECT}/.claude/skills/guide/SKILL.md`]: skillFile("guide", "Project guide.", "Project body."),
            [`${HOME}/.claude/skills/guide/SKILL.md`]: skillFile("guide", "Personal guide.", "Personal body."),
        });
        await mount();

        expect(host.textContent).toContain("also in ~/.claude/skills/guide/SKILL.md");
    });

    it("renders the source label for a discovered row", async () => {
        serve({ [`${HOME}/.claude/skills/style/SKILL.md`]: skillFile("house-style", "House style.", "Body.") });
        await mount();

        expect(rowText(host, "house-style")).toContain("~/.claude/skills · personal");
    });
});

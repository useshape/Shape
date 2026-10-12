import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { SkillsSettings } from "@/features/settings/ui/sections/skills";
import { listSkills } from "@/lib/chat/skills";

const PROJECT = "/home/dev/demo";

/** Serve `.agents`/`.claude` listings and file bodies from a fixture. */
function serve(files: Record<string, string>) {
    const dirs = [".agents", ".claude"];
    mocks.lsDir.mockImplementation(async (path: string) => {
        const dir = dirs.find((name) => path === `${PROJECT}/${name}`);
        if (!dir) throw new Error(`no such directory: ${path}`);
        return Object.keys(files)
            .filter((file) => file.startsWith(`${dir}/`))
            .map((file) => ({ name: file.slice(dir.length + 1), path: `${PROJECT}/${file}`, is_dir: false }));
    });
    mocks.readFileFromDisk.mockImplementation(async (path: string) => files[path.slice(PROJECT.length + 1)]);
}

function buttonWithLabel(host: HTMLElement, label: string): HTMLButtonElement | undefined {
    return Array.from(host.querySelectorAll("button")).find((node) => node.getAttribute("aria-label") === label);
}

function dismissButtons(host: HTMLElement): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll("button")).filter((node) =>
        (node.getAttribute("aria-label") ?? "").startsWith("Dismiss ")
    );
}

describe("skills settings", () => {
    let root: Root;
    let host: HTMLDivElement;

    beforeEach(() => {
        mocks.lsDir.mockReset();
        mocks.readFileFromDisk.mockReset();
        mocks.getProjectPath.mockReset();
        mocks.getProjectPath.mockReturnValue(PROJECT);
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    async function mount() {
        await act(async () => {
            root.render(<SkillsSettings />);
        });
    }

    it("keeps the refresh control available when nothing is discovered", async () => {
        serve({});
        await mount();

        expect(host.textContent).toContain("Discovered");
        expect(host.textContent).toContain("No skill files found in .agents or .claude.");
        expect(buttonWithLabel(host, "Scan for new skills")).toBeDefined();
    });

    it("picks up files added after an empty first scan", async () => {
        serve({});
        await mount();

        serve({ ".agents/guide.md": "Guide body" });
        await act(async () => {
            buttonWithLabel(host, "Scan for new skills")?.click();
        });

        expect(host.textContent).toContain(".agents/guide.md");
        expect(buttonWithLabel(host, "Import guide")).toBeDefined();
    });

    it("imports a discovered file and removes its row", async () => {
        serve({ ".agents/guide.md": "Guide body" });
        await mount();

        await act(async () => {
            buttonWithLabel(host, "Import guide")?.click();
        });

        expect(listSkills().map((skill) => skill.id)).toEqual(["guide"]);
        expect(buttonWithLabel(host, "Import guide")).toBeUndefined();
    });

    it("dismisses a file in one directory without hiding the other directory's file", async () => {
        serve({ ".agents/guide.md": "agent body", ".claude/guide.mdc": "claude body" });
        await mount();

        expect(dismissButtons(host)).toHaveLength(2);
        await act(async () => {
            dismissButtons(host)[0].click();
        });

        expect(dismissButtons(host)).toHaveLength(1);
        expect(host.textContent).not.toContain(".agents/guide.md");
        expect(host.textContent).toContain(".claude/guide.mdc");
    });
});

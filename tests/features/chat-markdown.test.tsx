import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatMarkdown } from "@/features/chat/ui/md/view";
import { MessageRenderer } from "@/features/chat/ui/md/renderer";

vi.mock("@tauri-apps/api/event", () => ({
    listen: vi.fn(async () => () => {}),
}));

vi.mock("mermaid", () => ({
    default: {
        initialize: vi.fn(),
        render: vi.fn(async () => {
            throw new Error("invalid graph");
        }),
    },
}));

async function renderMarkdown(content: string): Promise<{ host: HTMLDivElement; root: Root }> {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
        root.render(<ChatMarkdown content={content} />);
    });
    await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
    });
    return { host, root };
}

describe("chat markdown tables and mermaid", () => {
    let root: Root | null = null;
    let host: HTMLDivElement | null = null;

    afterEach(() => {
        if (root && host) {
            act(() => root!.unmount());
            host.remove();
        }
        root = null;
        host = null;
    });

    it("renders a GFM table", async () => {
        const mounted = await renderMarkdown("| Name | Role |\n| --- | --- |\n| Ada | eng |\n");
        root = mounted.root;
        host = mounted.host;
        expect(host.querySelector("table")).toBeTruthy();
        expect(host.textContent).toContain("Ada");
    });

    it("renders filter-table JSON instead of dropping it", async () => {
        const mounted = await renderMarkdown("```filter-table\n[{\"name\":\"Ada\"}]\n```\n");
        root = mounted.root;
        host = mounted.host;
        expect(host.textContent).toContain("Ada");
        expect(host.querySelector("table")).toBeTruthy();
    });

    it("shows the full paragraph once tools take the tail", async () => {
        const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
        const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
        const content = "Hello world, this paragraph must stay fully readable while tools run.";
        const node = document.createElement("div");
        document.body.appendChild(node);
        const mounted = createRoot(node);
        root = mounted;
        host = node;
        await act(async () => {
            mounted.render(<ChatMarkdown content={content} isGenerating isLast />);
        });
        expect(node.textContent ?? "").not.toContain("while tools run");
        await act(async () => {
            mounted.render(<ChatMarkdown content={content} isGenerating isLast={false} />);
        });
        expect(node.textContent).toContain("while tools run");
        expect(node.textContent).toContain("Hello world");
        raf.mockRestore();
        cancel.mockRestore();
    });

    it("keeps earlier commentary intact across consecutive tool calls", async () => {
        const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
        const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
        const first = "First commentary stays on screen while the agent runs tools and then keeps going with a long explanation.";
        const second = "Second commentary arrives between tool calls and must not clip the first.";
        const tool = (id: string) =>
            `<terminal_command status="running" id="${id}">npm test</terminal_command>`;
        const steps = [
            first,
            `${first}\n${tool("a")}`,
            `${first}\n${tool("a")}\n${second}`,
            `${first}\n${tool("a")}\n${second}\n${tool("b")}`,
            `${first}\n${tool("a")}\n${second}\n${tool("b")}\nDone.`,
        ];
        const node = document.createElement("div");
        document.body.appendChild(node);
        const mounted = createRoot(node);
        root = mounted;
        host = node;
        await act(async () => {
            mounted.render(<MessageRenderer content={steps[0]} isGenerating />);
        });
        expect(node.textContent ?? "").not.toContain("long explanation");
        for (const content of steps.slice(1)) {
            await act(async () => {
                mounted.render(<MessageRenderer content={content} isGenerating />);
            });
            expect(node.textContent).toContain("long explanation");
            expect(node.textContent).toContain("First commentary stays on screen");
        }
        expect(node.textContent).toContain("Second commentary arrives between tool calls");
        expect(node.textContent).toContain("Done.");
        raf.mockRestore();
        cancel.mockRestore();
    });

    it("shows mermaid source when the graph is invalid", async () => {
        const source = "graph TD\nA-->";
        const mounted = await renderMarkdown("```mermaid\n" + source + "\n```\n");
        root = mounted.root;
        host = mounted.host;
        expect(host.textContent).toContain("graph TD");
        expect(() => host!.textContent).not.toThrow();
    });
});

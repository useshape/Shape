import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatMarkdown } from "@/features/chat/ui/md/view";

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

describe("chat markdown tables", () => {
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

    it("renders a mermaid fence as a code block", async () => {
        const source = "graph TD\nA-->B";
        const mounted = await renderMarkdown("```mermaid\n" + source + "\n```\n");
        root = mounted.root;
        host = mounted.host;
        expect(host.textContent).toContain("graph TD");
    });
});

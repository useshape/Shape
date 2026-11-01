import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { parseMessageContent } from "@/features/chat/ui/md/renderer";
import { buildTrailSteps, WebSearchTrail } from "@/features/chat/ui/blocks/search";

const SAMPLE = [
    '<web_search query="tauri save dialog">tauri save dialog</web_search>',
    '<web_result query="tauri save dialog">### Tauri dialog',
    "URL: https://v2.tauri.app/plugin/dialog/",
    "Native save().",
    "---",
    "### WebView2",
    "URL: https://learn.microsoft.com/webview2",
    "Data URLs skip Save As.</web_result>",
].join("\n");

describe("web search trail", () => {
    it("renders one activity line and no Sources control", () => {
        const chunks = parseMessageContent(SAMPLE);
        const steps = buildTrailSteps(chunks);
        expect(steps).toHaveLength(1);
        expect(steps[0].kind).toBe("search");
        expect(steps[0].query).toBe("tauri save dialog");
        expect(steps[0].sources).toHaveLength(2);

        const html = renderToStaticMarkup(
            createElement(WebSearchTrail, { blocks: chunks }),
        );
        expect(html).toContain("Searched");
        expect(html).toContain("tauri save dialog");
        expect(html).toContain("2 results");
        expect(html).not.toContain("Sources");
    });
});

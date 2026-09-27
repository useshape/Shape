import type { BrowserPickedElement } from "@/lib/backend/types";
import { registerMentionToken } from "@/lib/chat/mention-registry";

/** Elements picked in the Browser tab, keyed by their `@element:` token. */
const elements = new Map<string, BrowserPickedElement>();
let seq = 0;

function keyOf(token: string): string {
    return token.replace(/^@/, "").toLowerCase();
}

/** Register a picked element and return the token to insert into the composer. */
export function registerElementMention(el: BrowserPickedElement): string {
    seq += 1;
    const tag = (el.tag || "element").toLowerCase().replace(/[^a-z0-9-]/g, "") || "element";
    const token = `@element:${tag}-${seq}`;
    elements.set(keyOf(token), el);
    registerMentionToken(token, {
        kind: "element",
        path: el.selector,
        label: `<${tag}>`,
        id: keyOf(token),
    });
    return token;
}

export function lookupElementMention(tokenOrId: string): BrowserPickedElement | null {
    return elements.get(keyOf(tokenOrId)) ?? null;
}

/** Model-facing block: what the element is, where it lives, and its markup. */
export function elementMentionBlock(tokenOrId: string, el: BrowserPickedElement): string {
    const esc = (v: string) =>
        v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = [
        el.selector ? `Selector: ${el.selector}` : "",
        el.url ? `Page: ${el.url}` : "",
        el.size ? `Size: ${el.size.w}×${el.size.h}px` : "",
        el.text ? `Text: ${el.text}` : "",
        el.styles
            ? `Computed: ${Object.entries(el.styles)
                  .map(([k, v]) => `${k} ${v}`)
                  .join("; ")}`
            : "",
        el.html ? `\n${el.html}` : "",
    ].filter(Boolean);
    return `<mention_context type="element" tag="${esc(el.tag)}" selector="${esc(el.selector || "")}" url="${esc(el.url || "")}" token="${esc(tokenOrId)}">\nThe user selected this element in the Browser tab. Find the source that renders it and work on that.\n${lines.join("\n")}\n</mention_context>`;
}

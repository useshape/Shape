"use client";

import { useEffect } from "react";

/**
 * Strip native `title` tooltips app-wide. Custom Shape tooltips stay;
 * bare `title=` attributes otherwise show the browser bubble.
 * Original text is kept on `data-native-title` if something needs it later.
 *
 * Also clears `title` on mouseenter as a fallback for elements that re-set
 * it after our observer runs (third-party widgets, Monaco, etc.).
 */
export function SuppressNativeTooltips() {
    useEffect(() => {
        const stripEl = (el: Element) => {
            if (!el.hasAttribute("title")) return;
            const value = el.getAttribute("title");
            if (value == null) return;
            el.setAttribute("data-native-title", value);
            el.removeAttribute("title");
        };

        const stripTree = (root: ParentNode) => {
            if (root instanceof Element) stripEl(root);
            root.querySelectorAll?.("[title]").forEach(stripEl);
        };

        stripTree(document.body);

        const mo = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === "attributes" && m.attributeName === "title") {
                    const t = m.target;
                    if (t instanceof Element) stripEl(t);
                    continue;
                }
                m.addedNodes.forEach((node) => {
                    if (node instanceof Element || node instanceof DocumentFragment) {
                        stripTree(node);
                    }
                });
            }
        });

        mo.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["title"],
        });

        const onEnter = (e: Event) => {
            const t = e.target;
            if (t instanceof Element) stripEl(t);
            else if (t instanceof Text) {
                const p = t.parentElement;
                if (p) stripEl(p);
            }
        };
        document.addEventListener("mouseover", onEnter, true);
        document.addEventListener("focusin", onEnter, true);

        return () => {
            mo.disconnect();
            document.removeEventListener("mouseover", onEnter, true);
            document.removeEventListener("focusin", onEnter, true);
        };
    }, []);

    return null;
}

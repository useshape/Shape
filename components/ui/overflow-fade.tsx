"use client";

import { useLayoutEffect } from "react";

const SELECTOR = ".truncate, .t-composer-hint__text, .ui-progressc__title, .ui-progressc__label, .t-swap__layer";

let measurer: CanvasRenderingContext2D | null | undefined;

function textWidth(el: HTMLElement, text: string): number {
    if (!text) return 0;
    if (measurer === undefined) {
        measurer = document.createElement("canvas").getContext("2d");
    }
    if (!measurer) return 0;
    const style = getComputedStyle(el);
    measurer.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;
    return measurer.measureText(text).width;
}

function contentWidth(el: HTMLElement): number {
    const style = getComputedStyle(el);
    const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    return el.clientWidth - pad;
}

/** True only when the label's text is wider than the box. Flex items often report a clamped scrollWidth. */
function isTruncated(el: HTMLElement): boolean {
    if (el.clientWidth < 1) return false;
    const available = contentWidth(el);
    if (el.scrollWidth > el.clientWidth + 1) return true;
    const text = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (text && textWidth(el, text) > available + 1) return true;
    for (const child of el.children) {
        if (child instanceof HTMLElement && child.scrollWidth > available + 1) return true;
    }
    return false;
}

/** Marks a truncated label so the fade replaces the ellipsis. Short labels stay solid. */
export function useOverflowFade() {
    useLayoutEffect(() => {
        const seen = new Set<HTMLElement>();
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) mark(entry.target);
        });

        function mark(node: Element) {
            const el = node.matches(SELECTOR) ? node : node.closest(SELECTOR);
            if (!(el instanceof HTMLElement)) return;
            el.classList.toggle("is-overflowing", isTruncated(el));
        }

        function watch(el: Element) {
            if (!(el instanceof HTMLElement) || seen.has(el) || !el.matches(SELECTOR)) return;
            seen.add(el);
            ro.observe(el);
            mark(el);
        }

        function scan(root: ParentNode) {
            if (!(root instanceof Element)) return;
            if (root.matches(SELECTOR)) watch(root);
            root.querySelectorAll(SELECTOR).forEach(watch);
        }

        function drop(node: Node) {
            if (!(node instanceof Element)) return;
            const gone: Element[] = node.matches(SELECTOR) ? [node] : [];
            node.querySelectorAll(SELECTOR).forEach((el) => gone.push(el));
            for (const el of gone) {
                if (!(el instanceof HTMLElement) || !seen.has(el)) continue;
                ro.unobserve(el);
                seen.delete(el);
            }
        }

        scan(document.body);
        void document.fonts?.ready.then(() => scan(document.body));
        const mo = new MutationObserver((records) => {
            for (const record of records) {
                if (record.type === "characterData") {
                    const parent = record.target.parentElement;
                    if (parent) mark(parent);
                    continue;
                }
                record.removedNodes.forEach(drop);
                record.addedNodes.forEach((node) => {
                    if (node instanceof Element) scan(node);
                    else if (node.parentElement) mark(node.parentElement);
                });
                if (record.target instanceof Element) mark(record.target);
            }
        });
        mo.observe(document.body, { subtree: true, childList: true, characterData: true });
        return () => {
            ro.disconnect();
            mo.disconnect();
        };
    }, []);
}

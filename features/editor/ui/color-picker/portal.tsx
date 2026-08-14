"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ColorPicker } from "./ui/color-picker";

export interface PickerAnchor {
    x: number;
    y: number;
}

interface EditorAnchor {
    getScrolledVisiblePosition: (position: { lineNumber: number; column: number }) => { top: number; left: number; height: number } | null;
    getDomNode: () => HTMLElement;
    onDidScrollChange: (listener: () => void) => { dispose: () => void };
    onDidLayoutChange: (listener: () => void) => { dispose: () => void };
}

interface ColorPickerPortalProps {
    anchor: PickerAnchor;
    editor?: EditorAnchor | null;
    range?: { getStartPosition: () => { lineNumber: number; column: number } } | null;
    color: string;
    layoutWidth?: number;
    placement?: "bottom" | "left";
    onChange: (color: string) => void;
    onClose: () => void;
}

function clampPosition(
    anchor: PickerAnchor,
    width: number,
    height: number,
    placement: "bottom" | "left" = "bottom",
): PickerAnchor {
    const pad = 8;
    const gap = 8;
    let left: number;
    let top: number;

    if (placement === "left") {
        left = anchor.x - width - gap;
        top = anchor.y;
        if (left < pad) left = Math.min(anchor.x + gap, window.innerWidth - width - pad);
        left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
        top = Math.max(pad, Math.min(top, window.innerHeight - height - pad));
        return { x: left, y: top };
    }

    left = anchor.x;
    top = anchor.y + gap;

    if (left + width > window.innerWidth - pad) left = window.innerWidth - width - pad;
    left = Math.max(pad, left);

    if (top + height > window.innerHeight - pad) top = anchor.y - height - gap;
    top = Math.max(pad, top);

    return { x: left, y: top };
}

function resolveAnchor(
    anchor: PickerAnchor,
    editor: EditorAnchor | null | undefined,
    range: ColorPickerPortalProps["range"],
): PickerAnchor {
    // Always prefer the editor token position when available — it places the
    // picker below the actual token regardless of where the mouse was clicked.
    if (editor && range) {
        const pos = range.getStartPosition();
        const coords = editor.getScrolledVisiblePosition(pos);
        const editorDom = editor.getDomNode();
        if (coords && editorDom) {
            const rect = editorDom.getBoundingClientRect();
            return { x: rect.left + coords.left, y: rect.top + coords.top + coords.height };
        }
    }
    return anchor;
}

export function ColorPickerPortal({
    anchor,
    editor,
    range,
    color,
    layoutWidth,
    placement = "bottom",
    onChange,
    onClose,
}: ColorPickerPortalProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const openedAtRef = useRef(Date.now());
    const [position, setPosition] = useState<PickerAnchor>(() => resolveAnchor(anchor, editor, range));
    const compact = (layoutWidth ?? 480) < 440;
    const pickerWidth = compact ? 360 : 480;

    useLayoutEffect(() => {
        openedAtRef.current = Date.now();
        const base = resolveAnchor(anchor, editor, range);
        const el = rootRef.current;
        if (!el) {
            setPosition(base);
            return;
        }
        const measured = el.getBoundingClientRect();
        // Compact / left placement must never use a viewport-wide measurement —
        // `w-full` in a body portal used to become 100vw and clamp to the top-left.
        const width = placement === "left" || compact ? pickerWidth : (measured.width || pickerWidth);
        const height = measured.height > 8 ? measured.height : 320;
        setPosition(clampPosition(base, width, height, placement));
        requestAnimationFrame(() => {
            const node = rootRef.current;
            if (!node) return;
            const next = node.getBoundingClientRect();
            const h = next.height > 8 ? next.height : height;
            setPosition(clampPosition(base, width, h, placement));
        });
        // Reposition only when the anchor/placement changes — not on every color tick.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchor.x, anchor.y, editor, range, placement, pickerWidth, compact]);

    useEffect(() => {
        if (!editor || !range) return;
        const update = () => {
            const base = resolveAnchor(anchor, editor, range);
            const el = rootRef.current;
            if (!el) return;
            const { width, height } = el.getBoundingClientRect();
            setPosition(clampPosition(base, width || pickerWidth, height || 320, placement));
        };
        const scrollSub = editor.onDidScrollChange(update);
        const layoutSub = editor.onDidLayoutChange(update);
        window.addEventListener("resize", update);
        return () => {
            scrollSub.dispose();
            layoutSub.dispose();
            window.removeEventListener("resize", update);
        };
    }, [anchor, editor, range]);

    useEffect(() => {
        const handlePointerDown = (e: MouseEvent) => {
            if (Date.now() - openedAtRef.current < 120) return;
            const target = e.target;
            if (!(target instanceof Node)) return;
            if (rootRef.current?.contains(target)) return;
            if (target instanceof Element) {
                if (target.closest(".shape-swatch-") || target.closest(".colorpicker-color-decoration")) return;
            }
            onClose();
        };
        document.addEventListener("mousedown", handlePointerDown, true);
        return () => document.removeEventListener("mousedown", handlePointerDown, true);
    }, [onClose]);

    if (typeof document === "undefined") return null;

    return createPortal(
        <div
            ref={rootRef}
            id="shape-color-picker-widget"
            className="shape-color-picker-widget fixed z-modal"
            style={{ top: position.y, left: position.x, width: compact ? pickerWidth : undefined }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <ColorPicker
                color={color}
                layoutWidth={layoutWidth}
                onChange={onChange}
                onClose={onClose}
            />
        </div>,
        document.body,
    );
}

function isSwatchTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return !!target.closest(
        '[class*="shape-swatch-"], [class*="colorpicker-color-decoration"], [class*="shape-layout-"]',
    );
}

function isLayoutSwatchTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return !!target.closest('[class*="shape-tw-swatch-"], [class*="shape-layout-"]');
}

export { isSwatchTarget, isLayoutSwatchTarget };

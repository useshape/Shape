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
    onChange: (color: string) => void;
    onClose: () => void;
}

function clampPosition(anchor: PickerAnchor, width: number, height: number): PickerAnchor {
    const pad = 8;
    const gap = 10;
    let left = anchor.x;
    let top = anchor.y + gap;

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
    onChange,
    onClose,
}: ColorPickerPortalProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const openedAtRef = useRef(Date.now());
    const [position, setPosition] = useState<PickerAnchor>(() => resolveAnchor(anchor, editor, range));

    useLayoutEffect(() => {
        openedAtRef.current = Date.now();
        const base = resolveAnchor(anchor, editor, range);
        const el = rootRef.current;
        if (!el) {
            setPosition(base);
            return;
        }
        const { width, height } = el.getBoundingClientRect();
        setPosition(clampPosition(base, width || 480, height || 320));
    }, [anchor, editor, range, color]);

    useEffect(() => {
        if (!editor || !range) return;
        const update = () => {
            const base = resolveAnchor(anchor, editor, range);
            const el = rootRef.current;
            if (!el) return;
            const { width, height } = el.getBoundingClientRect();
            setPosition(clampPosition(base, width || 480, height || 320));
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
            style={{ top: position.y, left: position.x }}
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

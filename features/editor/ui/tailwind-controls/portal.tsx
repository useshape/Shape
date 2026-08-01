"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { PickerAnchor } from "../color-picker/portal";

export interface EditorAnchor {
    getScrolledVisiblePosition: (position: { lineNumber: number; column: number }) => { top: number; left: number; height: number } | null;
    getDomNode: () => HTMLElement;
    onDidScrollChange: (listener: () => void) => { dispose: () => void };
    onDidLayoutChange: (listener: () => void) => { dispose: () => void };
}

interface TailwindControlPortalProps {
    className: string;
    editor: EditorAnchor | null;
    lineNumber: number;
    /** 1-based column — typically the start of the class-string body */
    column: number;
    fallbackAnchor: PickerAnchor;
    onClose: () => void;
    children: React.ReactNode;
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
    editor: EditorAnchor | null,
    lineNumber: number,
    column: number,
    fallback: PickerAnchor,
): PickerAnchor {
    if (!editor) return fallback;
    const coords = editor.getScrolledVisiblePosition({ lineNumber, column });
    const editorDom = editor.getDomNode();
    if (!coords || !editorDom) return fallback;
    const rect = editorDom.getBoundingClientRect();
    return { x: rect.left + coords.left, y: rect.top + coords.top + coords.height };
}

export function TailwindControlPortal({
    className,
    editor,
    lineNumber,
    column,
    fallbackAnchor,
    onClose,
    children,
}: TailwindControlPortalProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const openedAtRef = useRef(0);
    const [position, setPosition] = useState<PickerAnchor>(() =>
        resolveAnchor(editor, lineNumber, column, fallbackAnchor),
    );

    // Mark open once so follow-updates don't re-arm the outside-click grace window.
    useEffect(() => {
        openedAtRef.current = performance.now();
    }, []);

    const syncPosition = () => {
        const base = resolveAnchor(editor, lineNumber, column, fallbackAnchor);
        const el = rootRef.current;
        if (!el) {
            setPosition(base);
            return;
        }
        const { width, height } = el.getBoundingClientRect();
        setPosition(clampPosition(base, width || 240, height || 120));
    };

    useLayoutEffect(() => {
        syncPosition();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when anchor inputs change
    }, [editor, lineNumber, column, fallbackAnchor.x, fallbackAnchor.y]);

    useEffect(() => {
        if (!editor) return;
        const scrollSub = editor.onDidScrollChange(syncPosition);
        const layoutSub = editor.onDidLayoutChange(syncPosition);
        window.addEventListener("resize", syncPosition);
        return () => {
            scrollSub.dispose();
            layoutSub.dispose();
            window.removeEventListener("resize", syncPosition);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor, lineNumber, column, fallbackAnchor.x, fallbackAnchor.y]);

    useEffect(() => {
        const handlePointerDown = (e: MouseEvent) => {
            if (performance.now() - openedAtRef.current < 120) return;
            const target = e.target;
            if (!(target instanceof Node)) return;
            if (rootRef.current?.contains(target)) return;
            if (target instanceof Element) {
                if (target.closest('[class*="shape-layout-"]')) return;
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
            className={cn(className, "fixed z-modal")}
            style={{ top: position.y, left: position.x, pointerEvents: "auto" }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            {children}
        </div>,
        document.body,
    );
}

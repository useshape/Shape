"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { chromePlatform, subscribeChromePlatform } from "@/lib/ui/chrome-platform";

export function IconMinimize() {
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 5H10" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
    );
}

export function IconMaximize() {
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
    );
}

export function IconRestore() {
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.5 2.5V0.5H9.5V7.5H7.5" stroke="currentColor" strokeWidth="1" fill="none" />
            <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
    );
}

export function IconClose() {
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
            <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
    );
}

const CONTROLS_WIDTH = 46 * 3;

function WindowControlButtons({
    isMaximized,
    onMinimize,
    onToggleMaximize,
    onClose,
}: {
    isMaximized: boolean;
    onMinimize: () => void;
    onToggleMaximize: () => void;
    onClose: () => void;
}) {
    return (
        <>
            <button
                type="button"
                aria-label="Minimize"
                className="control-button flex h-full w-[46px] cursor-default items-center justify-center transition-colors hover:bg-panel-hover active:bg-panel-active"
                onClick={onMinimize}
            >
                <IconMinimize />
            </button>
            <button
                type="button"
                aria-label={isMaximized ? "Restore" : "Maximize"}
                className="control-button flex h-full w-[46px] cursor-default items-center justify-center transition-colors hover:bg-panel-hover active:bg-panel-active"
                onClick={onToggleMaximize}
            >
                {isMaximized ? <IconRestore /> : <IconMaximize />}
            </button>
            <button
                type="button"
                aria-label="Close"
                className="control-button close-button flex h-full w-[46px] cursor-default items-center justify-center transition-colors hover:bg-[#e81123] hover:text-white active:bg-[#b00d1b]"
                onClick={onClose}
            >
                <IconClose />
            </button>
        </>
    );
}

export function WindowControlsSpacer() {
    return (
        <div
            className="h-full shrink-0"
            style={{ width: CONTROLS_WIDTH }}
            data-tauri-drag-region
            aria-hidden
        />
    );
}

function MacTrafficLights({
    onMinimize,
    onToggleMaximize,
    onClose,
}: {
    onMinimize: () => void;
    onToggleMaximize: () => void;
    onClose: () => void;
}) {
    const light = "grid size-3.5 mt-0.5 place-items-center rounded-full shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.28)]";
    const glyph = "text-[8px] font-semibold leading-none text-black/55 opacity-0 group-hover/lights:opacity-100";
    return (
        <div className="group/lights flex h-titlebar items-center gap-2 pl-4" data-no-drag>
            <button type="button" aria-label="Close" onClick={onClose} className={cn(light, "bg-[#ff5f57]")}>
                <span className={glyph}>×</span>
            </button>
            <button type="button" aria-label="Minimize" onClick={onMinimize} className={cn(light, "bg-[#febc2e]")}>
                <span className={glyph}>–</span>
            </button>
            <button type="button" aria-label="Zoom" onClick={onToggleMaximize} className={cn(light, "bg-[#28c840]")}>
                <span className={glyph}>+</span>
            </button>
        </div>
    );
}

export function WindowControls({
    isMaximized,
    onMinimize,
    onToggleMaximize,
    onClose,
    surface = "panel",
    spacer = true,
    floating = true,
    bare = false,
    barClass = "h-titlebar",
}: {
    isMaximized: boolean;
    onMinimize: () => void;
    onToggleMaximize: () => void;
    onClose: () => void;
    /** Match the panel the controls sit on. */
    surface?: "chrome" | "panel" | "sidebar";
    spacer?: boolean;
    floating?: boolean;
    /** Sit on a painted strip with no solid backing. */
    bare?: boolean;
    /** Match the tab strip when it is taller than the default titlebar. */
    barClass?: string;
}) {
    const [host, setHost] = useState<HTMLElement | null>(null);
    const platform = useSyncExternalStore(subscribeChromePlatform, chromePlatform, () => "windows" as const);
    const mac = platform === "macos";
    useEffect(() => {
        setHost(document.body);
    }, []);

    const buttons = (
        <WindowControlButtons
            isMaximized={isMaximized}
            onMinimize={onMinimize}
            onToggleMaximize={onToggleMaximize}
            onClose={onClose}
        />
    );

    const bg =
        surface === "sidebar" ? "bg-sidebar" : surface === "chrome" ? "bg-surface-3" : "bg-panel";

    /** Same layer as Radix overlays (document.body) so blur cannot cover these. */
    const floatingEl = floating ? (
        <div
            className={cn(
                "titlebar-window-controls pointer-events-auto fixed top-0 isolate z-titlebar-controls flex shrink-0 items-stretch",
                mac ? cn("left-0 bg-transparent", barClass) : "right-0",
                !mac && (bare ? cn(barClass, "bg-transparent") : cn(barClass, bg)),
            )}
            data-no-drag
        >
            {mac ? (
                <MacTrafficLights onMinimize={onMinimize} onToggleMaximize={onToggleMaximize} onClose={onClose} />
            ) : (
                buttons
            )}
        </div>
    ) : null;

    return (
        <>
            {spacer ? <WindowControlsSpacer /> : null}
            {floatingEl ? (host ? createPortal(floatingEl, host) : floatingEl) : null}
        </>
    );
}

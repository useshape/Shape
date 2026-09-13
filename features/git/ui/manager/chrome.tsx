"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AGENT_TABS_SLOT } from "@/features/agent/chrome";
import { TitlebarSearch } from "./titlebar-search";
import { useFilter } from "./filter-context";

export const GIT_CHROME_ACTIONS_SLOT = "shape-git-chrome-actions";
export const GIT_WINDOW_TITLE_SLOT = "shape-git-window-title";

function useSlot(id: string) {
    const [el, setEl] = useState<HTMLElement | null>(null);
    useEffect(() => {
        const find = () => document.getElementById(id);
        setEl(find());
        const timer = window.setInterval(() => {
            const next = find();
            if (next) {
                setEl(next);
                window.clearInterval(timer);
            }
        }, 40);
        const stop = window.setTimeout(() => window.clearInterval(timer), 2000);
        return () => {
            window.clearInterval(timer);
            window.clearTimeout(stop);
        };
    }, [id]);
    return el;
}

/** Section title + search + action slot in the window / agent top bar. */
export function GitPageChrome() {
    const { sectionTitle } = useFilter();
    const agentSlot = useSlot(AGENT_TABS_SLOT);
    const windowSlot = useSlot(GIT_WINDOW_TITLE_SLOT);
    const host = agentSlot ?? windowSlot;
    if (!host) return null;
    return createPortal(
        <div className="flex min-w-0 items-center gap-2 pr-2" data-no-drag>
            <span className="min-w-0 truncate text-sm font-normal text-text-primary">
                {sectionTitle}
            </span>
            <div id={GIT_CHROME_ACTIONS_SLOT} className="flex shrink-0 items-center gap-0.5" />
            <TitlebarSearch />
        </div>,
        host,
    );
}

/** Toolbar buttons for the active Git section (icons + tooltips). */
export function GitChromeActions({ children }: { children: ReactNode }) {
    const slot = useSlot(GIT_CHROME_ACTIONS_SLOT);
    if (!slot) return null;
    return createPortal(children, slot);
}

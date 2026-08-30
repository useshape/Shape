"use client";

import { Suspense, useEffect } from "react";
import { FilterProvider } from "@/features/git/ui/manager/filter-context";
import { SettingsView } from "@/features/settings/ui/settings";
import { GitManager } from "@/features/git/ui";

export type AgentOverlay =
    | { type: "settings"; category?: string; section?: string }
    | { type: "git"; section?: string }
    | null;

/**
 * Main-area content for Settings / Git. Nav is portaled into the agent sidebar
 * via `navPortalTarget` (same shell as Agents/Projects — not a second sidebar).
 */
export function AgentOverlayView({
    overlay,
    onClose,
    navPortalTarget,
    sidebarExpanded,
}: {
    overlay: NonNullable<AgentOverlay>;
    onClose: () => void;
    navPortalTarget: HTMLElement | null;
    sidebarExpanded: boolean;
}) {
    useEffect(() => {
        if (overlay.type !== "settings") return;
        if (!overlay.category && !overlay.section) return;
        window.dispatchEvent(
            new CustomEvent("shape-settings-navigate", {
                detail: {
                    category: overlay.category ?? "",
                    section: overlay.section ?? "",
                },
            }),
        );
    }, [overlay]);

    useEffect(() => {
        if (overlay.type !== "git" || !overlay.section) return;
        window.dispatchEvent(
            new CustomEvent("shape-git-section", { detail: { section: overlay.section } }),
        );
    }, [overlay]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    if (overlay.type === "settings") {
        return (
            <div className="h-full min-h-0 w-full overflow-hidden animate-in">
                <Suspense fallback={<div className="h-full bg-panel" />}>
                    <SettingsView
                        navPortalTarget={navPortalTarget}
                        sidebarExpanded={sidebarExpanded}
                        onBack={onClose}
                    />
                </Suspense>
            </div>
        );
    }

    return (
        <div className="h-full min-h-0 w-full overflow-hidden animate-in">
            <FilterProvider>
                <GitManager
                    embedded
                    navPortalTarget={navPortalTarget}
                    sidebarExpanded={sidebarExpanded}
                    onClose={onClose}
                />
            </FilterProvider>
        </div>
    );
}

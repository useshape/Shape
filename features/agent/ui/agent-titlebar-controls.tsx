"use client";

import { AnimatedSecondarySidebarIcon, AnimatedSidebarIcon } from "@/features/activity-bar";
import { useAgentLayoutOptional } from "@/features/agent/lib/agent-layout-context";
import { TitlebarLayoutButton } from "@/features/workbench/titlebar/ui/layout-controls";

const ICON_SIZE = 16;

export function AgentSessionsToggle() {
    const layout = useAgentLayoutOptional();
    if (!layout) return null;

    return (
        <TitlebarLayoutButton
            label="Toggle Sessions"
            active={layout.sessionsOpen}
            onClick={layout.toggleSessions}
        >
            <AnimatedSidebarIcon active={layout.sessionsOpen} size={ICON_SIZE} />
        </TitlebarLayoutButton>
    );
}

/** Toggle the right Agent workbench rail (Changes / Preview / Terminal). */
export function AgentPanelToggle() {
    const layout = useAgentLayoutOptional();
    if (!layout) return null;

    return (
        <TitlebarLayoutButton
            label="Toggle Panel"
            active={layout.panelOpen}
            onClick={layout.togglePanel}
        >
            <AnimatedSecondarySidebarIcon active={layout.panelOpen} size={ICON_SIZE} />
        </TitlebarLayoutButton>
    );
}

/** @deprecated Use AgentPanelToggle — kept so old imports don't break mid-HMR. */
export const AgentPreviewToggle = AgentPanelToggle;

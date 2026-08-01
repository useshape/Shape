"use client";

import { AnimatedSidebarIcon } from "@/features/activity-bar";
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

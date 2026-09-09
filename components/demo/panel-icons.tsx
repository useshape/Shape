"use client";

import { RiLayoutBottomLine, RiLayoutRightLine, RiSideBarLine } from "@remixicon/react";
import { Icon } from "./icon";

export function AnimatedSidebarIcon({ active: _active }: { active?: boolean; size?: number }) {
    return <Icon icon={RiSideBarLine} />;
}

export function AnimatedSecondarySidebarIcon({ active: _active }: { active?: boolean; size?: number }) {
    return <Icon icon={RiLayoutRightLine} />;
}

export function AnimatedPanelIcon({ active: _active }: { active?: boolean; size?: number }) {
    return <Icon icon={RiLayoutBottomLine} />;
}

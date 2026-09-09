"use client";

import { RiLayoutBottomLine, RiLayoutRightLine, RiSideBarLine } from "@remixicon/react";
import { Icon } from "@/components/ui/icon";

/** Left primary sidebar — Remix layout icon. */
export function AnimatedSidebarIcon({ active: _active }: { active?: boolean; size?: number }) {
    return <Icon icon={RiSideBarLine} />;
}

/** Right secondary sidebar. */
export function AnimatedSecondarySidebarIcon({ active: _active }: { active?: boolean; size?: number }) {
    return <Icon icon={RiLayoutRightLine} />;
}

/** Bottom panel / terminal. */
export function AnimatedPanelIcon({ active: _active }: { active?: boolean; size?: number }) {
    return <Icon icon={RiLayoutBottomLine} />;
}

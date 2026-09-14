"use client";

import type { RemixiconComponentType } from "@remixicon/react";
import {
    RiAddLine,
    RiApps2Line,
    RiBox3Line,
    RiCheckboxCircleLine,
    RiDatabase2Line,
    RiFileTextLine,
    RiImageLine,
    RiLineChartLine,
    RiListCheck3,
    RiNodeTree,
    RiPaletteLine,
    RiPriceTag3Line,
    RiQuestionLine,
    RiSearchLine,
    RiSettings3Line,
    RiShoppingBag3Line,
    RiUserLine,
} from "@remixicon/react";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function RailBtn({
    label,
    icon,
    active,
}: {
    label: string;
    icon: RemixiconComponentType;
    active?: boolean;
}) {
    return (
        <Tooltip content={label} side="right">
            <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                className={cn(
                    "flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                    "hover:bg-panel-hover hover:text-text-primary",
                    active && "bg-panel-active text-text-primary",
                )}
            >
                <Icon icon={icon} size={18} />
            </button>
        </Tooltip>
    );
}

const TOP_TOOLS: { label: string; icon: RemixiconComponentType; active?: boolean }[] = [
    { label: "Add", icon: RiAddLine },
    { label: "Pages", icon: RiFileTextLine },
    { label: "Sections", icon: RiListCheck3, active: true },
    { label: "Theme", icon: RiBox3Line },
    { label: "Apps", icon: RiApps2Line },
    { label: "Media", icon: RiImageLine },
    { label: "Metaobjects", icon: RiDatabase2Line },
    { label: "Navigation", icon: RiNodeTree },
    { label: "Customers", icon: RiUserLine },
    { label: "Products", icon: RiShoppingBag3Line },
    { label: "Discounts", icon: RiPriceTag3Line },
    { label: "Analytics", icon: RiLineChartLine },
];

const BOTTOM_TOOLS: { label: string; icon: RemixiconComponentType }[] = [
    { label: "Settings", icon: RiSettings3Line },
    { label: "Help", icon: RiQuestionLine },
    { label: "Theme check", icon: RiCheckboxCircleLine },
    { label: "Search", icon: RiSearchLine },
    { label: "Themes", icon: RiPaletteLine },
];

export function DesignToolRail() {
    return (
        <div className="flex h-full w-11 shrink-0 flex-col items-center overflow-y-auto border-r border-border-subtle bg-panel py-1.5">
            <div className="flex flex-col items-center gap-0.5">
                {TOP_TOOLS.map((tool) => (
                    <RailBtn key={tool.label} {...tool} />
                ))}
            </div>
            <div className="mt-auto flex flex-col items-center gap-0.5 pt-2">
                {BOTTOM_TOOLS.map((tool) => (
                    <RailBtn key={tool.label} {...tool} />
                ))}
            </div>
        </div>
    );
}

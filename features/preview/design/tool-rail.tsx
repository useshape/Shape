"use client";

import { type SolarIconName,  Icon, ICON_SIZE_MD } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function RailBtn({
    label,
    icon,
    active,
}: {
    label: string;
    icon: SolarIconName;
    active?: boolean;
}) {
    return (
        <Tooltip content={label} side="right">
            <Button
                variant="ghost"
                size="icon"
                className={cn(
                    "size-10",
                    active && "bg-panel-active text-text-primary",
                )}
                aria-label={label}
                aria-pressed={active}
            >
                <Icon icon={icon} size={ICON_SIZE_MD} />
            </Button>
        </Tooltip>
    );
}

const TOP_TOOLS: { label: string; icon: SolarIconName; active?: boolean }[] = [
    { label: "Add", icon: "add-circle" },
    { label: "Pages", icon: "file-text" },
    { label: "Sections", icon: "list-check", active: true },
    { label: "Theme", icon: "box" },
    { label: "Apps", icon: "widget" },
    { label: "Media", icon: "gallery" },
    { label: "Metaobjects", icon: "database" },
    { label: "Navigation", icon: "list" },
    { label: "Customers", icon: "user" },
    { label: "Products", icon: "bag" },
    { label: "Discounts", icon: "tag" },
    { label: "Analytics", icon: "chart" },
];

const BOTTOM_TOOLS: { label: string; icon: SolarIconName }[] = [
    { label: "Settings", icon: "settings" },
    { label: "Help", icon: "question-circle" },
    { label: "Theme check", icon: "check-circle" },
    { label: "Search", icon: "magnifier" },
    { label: "Themes", icon: "palette" },
];

export function DesignToolRail() {
    return (
        <div className="flex h-full w-13 shrink-0 flex-col items-center overflow-y-auto border-r border-border bg-surface-3 py-1.5">
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

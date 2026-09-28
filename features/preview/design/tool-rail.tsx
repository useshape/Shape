"use client";

import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
import { Camera20Filled } from "@fluentui/react-icons/headless/svg/camera";
import { CheckboxUnchecked20Regular } from "@fluentui/react-icons/headless/svg/checkbox-unchecked";
import { CheckmarkCircle20Filled } from "@fluentui/react-icons/headless/svg/checkmark-circle";
import { Color20Regular } from "@fluentui/react-icons/headless/svg/color";
import { DataTrending20Regular } from "@fluentui/react-icons/headless/svg/data-trending";
import { Database20Regular } from "@fluentui/react-icons/headless/svg/database";
import { DocumentText20Regular } from "@fluentui/react-icons/headless/svg/document-text";
import { Grid20Regular } from "@fluentui/react-icons/headless/svg/grid";
import { Person20Regular } from "@fluentui/react-icons/headless/svg/person";
import { QuestionCircle20Regular } from "@fluentui/react-icons/headless/svg/question-circle";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { Settings20Regular } from "@fluentui/react-icons/headless/svg/settings";
import { ShoppingBag20Regular } from "@fluentui/react-icons/headless/svg/shopping-bag";
import { Tag20Regular } from "@fluentui/react-icons/headless/svg/tag";
import { TaskListSquareLtr20Regular } from "@fluentui/react-icons/headless/svg/task-list-square-ltr";
import { TextNumberListLtr20Regular } from "@fluentui/react-icons/headless/svg/text-number-list-ltr";


import { type IconGlyph, Icon } from "@/components/ui/icon";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function RailBtn({
    label,
    icon,
    active,
}: {
    label: string;
    icon: IconGlyph;
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
                <Icon icon={icon} />
            </Button>
        </Tooltip>
    );
}

const TOP_TOOLS: { label: string; icon: IconGlyph; active?: boolean }[] = [
    { label: "Add", icon: Add20Regular },
    { label: "Pages", icon: DocumentText20Regular },
    { label: "Sections", icon: TaskListSquareLtr20Regular, active: true },
    { label: "Theme", icon: CheckboxUnchecked20Regular },
    { label: "Apps", icon: Grid20Regular },
    { label: "Media", icon: Camera20Filled },
    { label: "Metaobjects", icon: Database20Regular },
    { label: "Navigation", icon: TextNumberListLtr20Regular },
    { label: "Customers", icon: Person20Regular },
    { label: "Products", icon: ShoppingBag20Regular },
    { label: "Discounts", icon: Tag20Regular },
    { label: "Analytics", icon: DataTrending20Regular },
];

const BOTTOM_TOOLS: { label: string; icon: IconGlyph }[] = [
    { label: "Settings", icon: Settings20Regular },
    { label: "Help", icon: QuestionCircle20Regular },
    { label: "Theme check", icon: CheckmarkCircle20Filled },
    { label: "Search", icon: Search20Regular },
    { label: "Themes", icon: Color20Regular },
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

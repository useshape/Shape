"use client";

import type { RemixiconComponentType } from "@remixicon/react";
import {
    RiAddLine,
    RiArrowDownSLine,
    RiArrowRightSLine,
    RiGridLine,
    RiImageLine,
    RiLayoutBottom2Line,
    RiLayoutTop2Line,
    RiMegaphoneLine,
    RiRectangleLine,
    RiText,
} from "@remixicon/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon, ICON_SIZE_MD, ICON_SIZE_SM } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll";
import { SIDEBAR_PANEL_HEADER_HEIGHT_CLASS } from "@/features/panels/ui/sidebar-panel-header";
import { cn } from "@/lib/utils";

export type DesignOutlineId =
    | "announcement"
    | "header"
    | "image-banner"
    | "heading"
    | "buttons"
    | "featured-collection"
    | "footer";

type OutlineItem = {
    id: DesignOutlineId;
    label: string;
    icon: RemixiconComponentType;
    hint?: string;
    children?: OutlineItem[];
};

const GROUPS: { id: string; label: string; items: OutlineItem[]; addAfter?: boolean }[] = [
    {
        id: "header",
        label: "Header",
        addAfter: true,
        items: [
            { id: "announcement", label: "Announcement bar", icon: RiMegaphoneLine },
            { id: "header", label: "Header", icon: RiLayoutTop2Line },
        ],
    },
    {
        id: "template",
        label: "Template",
        addAfter: true,
        items: [
            {
                id: "image-banner",
                label: "Image banner",
                icon: RiImageLine,
                children: [
                    {
                        id: "heading",
                        label: "Heading",
                        hint: "Browse our latest pro…",
                        icon: RiText,
                    },
                    { id: "buttons", label: "Buttons", icon: RiRectangleLine },
                ],
            },
            { id: "featured-collection", label: "Featured collection", icon: RiGridLine },
        ],
    },
    {
        id: "footer",
        label: "Footer",
        addAfter: true,
        items: [{ id: "footer", label: "Footer", icon: RiLayoutBottom2Line }],
    },
];

function OutlineRow({
    item,
    depth,
    selectedId,
    onSelect,
}: {
    item: OutlineItem;
    depth: number;
    selectedId: DesignOutlineId;
    onSelect: (id: DesignOutlineId) => void;
}) {
    const hasKids = Boolean(item.children?.length);
    const [open, setOpen] = useState(item.id === "image-banner");
    const selected = selectedId === item.id;
    const childSelected = item.children?.some((c) => c.id === selectedId);

    return (
        <div>
            <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                    "flex h-8 w-full items-center gap-1 rounded-md px-1.5 text-left text-sm font-medium",
                    "transition-colors duration-(--transition-fast) ease-[var(--ease-out)]",
                    selected
                        ? "bg-panel-active text-text-primary"
                        : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                )}
                style={{ paddingLeft: 6 + depth * 14 }}
            >
                {hasKids ? (
                    <span
                        className="flex size-4 shrink-0 items-center justify-center"
                        onClick={(e) => {
                            e.stopPropagation();
                            setOpen((v) => !v);
                        }}
                    >
                        <Icon
                            icon={open || childSelected ? RiArrowDownSLine : RiArrowRightSLine}
                            size={ICON_SIZE_SM}
                            className="text-text-muted"
                        />
                    </span>
                ) : (
                    <span className="size-4 shrink-0" />
                )}
                <Icon icon={item.icon} size={ICON_SIZE_SM} className="shrink-0 text-text-muted" />
                <span className="min-w-0 truncate">
                    {item.label}
                    {item.hint ? (
                        <span className="text-text-muted"> – {item.hint}</span>
                    ) : null}
                </span>
            </button>
            {hasKids && (open || childSelected)
                ? item.children!.map((child) => (
                      <OutlineRow
                          key={child.id}
                          item={child}
                          depth={depth + 1}
                          selectedId={selectedId}
                          onSelect={onSelect}
                      />
                  ))
                : null}
        </div>
    );
}

export function DesignOutlinePanel({
    selectedId,
    onSelect,
}: {
    selectedId: DesignOutlineId;
    onSelect: (id: DesignOutlineId) => void;
}) {
    const [openGroups, setOpenGroups] = useState<Set<string>>(
        () => new Set(["header", "template", "footer"]),
    );

    const toggleGroup = (id: string) => {
        setOpenGroups((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <aside className="flex h-full w-120 shrink-0 flex-col overflow-hidden border-r border-border bg-surface-3">
            <div className={cn("flex shrink-0 items-center px-3 border-b border-border", SIDEBAR_PANEL_HEADER_HEIGHT_CLASS)}>
                <span className="text-md font-medium text-text-primary">Home page</span>
            </div>
            <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                <div className="space-y-2 px-2 pb-3">
                    {GROUPS.map((group) => {
                        const open = openGroups.has(group.id);
                        return (
                            <div key={group.id}>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleGroup(group.id)}
                                    aria-expanded={open}
                                    className="flex h-9 w-full items-center gap-1 rounded-md px-1.5 text-left justify-start text-sm font-medium text-text-muted hover:bg-panel-hover hover:text-text-primary"
                                >
                                    <Icon
                                        icon={open ? RiArrowDownSLine : RiArrowRightSLine}
                                        size={ICON_SIZE_MD}
                                        className="shrink-0"
                                    />
                                    <span>{group.label}</span>
                                </Button>
                                {open ? (
                                    <div className="space-y-1">
                                        {group.id === "footer" ? (
                                            <AddSectionButton />
                                        ) : null}
                                        {group.items.map((item) => (
                                            <OutlineRow
                                                key={item.id}
                                                item={item}
                                                depth={0}
                                                selectedId={selectedId}
                                                onSelect={onSelect}
                                            />
                                        ))}
                                        {group.addAfter && group.id !== "footer" ? (
                                            <AddSectionButton />
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>
        </aside>
    );
}

function AddSectionButton() {
    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-1 px-1.5 text-info hover:text-info-hover"
        >
            <Icon icon={RiAddLine} size={ICON_SIZE_MD} />
            Add section
        </Button>
    );
}

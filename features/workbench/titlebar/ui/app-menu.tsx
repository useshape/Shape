"use client";

import {
    Menubar,
    MenubarMenu,
    MenubarTrigger,
    MenubarContent,
    MenubarItem,
    MenubarSeparator,
    MenubarShortcut,
    MenubarPortal,
    MenubarSub,
    MenubarSubTrigger,
    MenubarSubContent,
} from "@/components/ui/dropdown";
import { menuStructure, type MenuItem } from "@/lib/ui/menus";
import type { RepoHistoryEntry } from "@/lib/repo-history";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { titlebarIconButtonClass } from "./layout-controls";

function MenuItems({
    items,
    onAction,
    repoHistory,
    onClearHistory,
}: {
    items: MenuItem[];
    onAction: (label: string) => void;
    repoHistory: RepoHistoryEntry[];
    onClearHistory: () => void;
}) {
    return (
        <>
            {items.map((item, idx) =>
                item.type === "separator" ? (
                    <MenubarSeparator key={`sep-${idx}`} />
                ) : (
                    <div key={`item-${idx}`}>
                        {item.submenu ? (
                            <MenubarSub>
                                <MenubarSubTrigger>{item.label}</MenubarSubTrigger>
                                <MenubarPortal>
                                    <MenubarSubContent>
                                        {item.submenu.map((sub, sidx) =>
                                            sub.type === "separator" ? (
                                                <MenubarSeparator key={`sep-${idx}-${sidx}`} />
                                            ) : (
                                                <MenubarItem
                                                    key={`item-${idx}-${sidx}`}
                                                    onClick={() => onAction(sub.label!)}
                                                >
                                                    <span className="flex-1 min-w-0 truncate">{sub.label}</span>
                                                    {sub.shortcut && (
                                                        <MenubarShortcut>{sub.shortcut}</MenubarShortcut>
                                                    )}
                                                </MenubarItem>
                                            ),
                                        )}
                                    </MenubarSubContent>
                                </MenubarPortal>
                            </MenubarSub>
                        ) : (
                            <MenubarItem onClick={() => onAction(item.label!)}>
                                <span className="flex-1 min-w-0 truncate">{item.label}</span>
                                {item.shortcut && <MenubarShortcut>{item.shortcut}</MenubarShortcut>}
                            </MenubarItem>
                        )}
                        {item.label === "Open Folder" && (
                            <MenubarSub>
                                <MenubarSubTrigger>Open Recent</MenubarSubTrigger>
                                <MenubarPortal>
                                    <MenubarSubContent>
                                        {repoHistory.length === 0 ? (
                                            <MenubarItem disabled>No recent projects</MenubarItem>
                                        ) : (
                                            <>
                                                <MenubarItem
                                                    onClick={() =>
                                                        window.dispatchEvent(
                                                            new CustomEvent("shape-open-project", {
                                                                detail: { path: repoHistory[0].path },
                                                            }),
                                                        )
                                                    }
                                                >
                                                    Open Most Recent
                                                </MenubarItem>
                                                <MenubarSeparator />
                                                {repoHistory.map((entry) => (
                                                    <MenubarItem
                                                        key={entry.path}
                                                        onClick={() =>
                                                            window.dispatchEvent(
                                                                new CustomEvent("shape-open-project", {
                                                                    detail: { path: entry.path },
                                                                }),
                                                            )
                                                        }
                                                    >
                                                        <span className="text-md py-0.5 truncate max-w-[400px]">
                                                            {entry.path}
                                                        </span>
                                                    </MenubarItem>
                                                ))}
                                                <MenubarSeparator />
                                                <MenubarItem onClick={onClearHistory}>
                                                    Clear Folder History
                                                </MenubarItem>
                                            </>
                                        )}
                                    </MenubarSubContent>
                                </MenubarPortal>
                            </MenubarSub>
                        )}
                    </div>
                ),
            )}
        </>
    );
}

export function TitlebarMenuToggle({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <Tooltip content={open ? "Close menu" : "Menu"} side="bottom">
            <button
                type="button"
                aria-label="Menu"
                aria-expanded={open}
                onClick={() => onOpenChange(!open)}
                className={cn(titlebarIconButtonClass, open && "bg-panel-hover text-text-primary")}
            >
                <Icon name="three_bars" size={16} />
            </button>
        </Tooltip>
    );
}

export function TitlebarMenubar({
    windowWidth,
    onAction,
    repoHistory,
    onClearHistory,
    structure = menuStructure,
}: {
    windowWidth: number;
    onAction: (label: string) => void;
    repoHistory: RepoHistoryEntry[];
    onClearHistory: () => void;
    structure?: Record<string, MenuItem[]>;
}) {
    const entries = Object.entries(structure);
    let visibleCount = entries.length;
    if (windowWidth < 800) visibleCount = 2;
    else if (windowWidth < 950) visibleCount = 3;
    else if (windowWidth < 1100) visibleCount = 4;
    else if (windowWidth < 1250) visibleCount = 5;
    else if (windowWidth < 1400) visibleCount = 6;

    const visible = entries.slice(0, visibleCount);
    const overflow = entries.slice(visibleCount);

    return (
        <Menubar>
            {visible.map(([menuName, items]) => (
                <MenubarMenu key={menuName}>
                    <MenubarTrigger>{menuName}</MenubarTrigger>
                    <MenubarPortal>
                        <MenubarContent alignOffset={-5}>
                            <MenuItems
                                items={items}
                                onAction={onAction}
                                repoHistory={repoHistory}
                                onClearHistory={onClearHistory}
                            />
                        </MenubarContent>
                    </MenubarPortal>
                </MenubarMenu>
            ))}
            {overflow.length > 0 && (
                <MenubarMenu>
                    <MenubarTrigger>
                        <Icon name="more_horiz" size={16} filled />
                    </MenubarTrigger>
                    <MenubarPortal>
                        <MenubarContent alignOffset={-5}>
                            {overflow.map(([menuName, items]) => (
                                <MenubarSub key={menuName}>
                                    <MenubarSubTrigger>{menuName}</MenubarSubTrigger>
                                    <MenubarPortal>
                                        <MenubarSubContent>
                                            <MenuItems
                                                items={items}
                                                onAction={onAction}
                                                repoHistory={repoHistory}
                                                onClearHistory={onClearHistory}
                                            />
                                        </MenubarSubContent>
                                    </MenubarPortal>
                                </MenubarSub>
                            ))}
                        </MenubarContent>
                    </MenubarPortal>
                </MenubarMenu>
            )}
        </Menubar>
    );
}

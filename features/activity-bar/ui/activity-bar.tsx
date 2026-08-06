"use client";

import { useProjectState } from "@/lib/backend";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { openSettingsWindow } from "@/lib/open-settings";
import { ActivityBarItem, activityBarClassName } from "./activity-bar-item";

const ICON_SIZE = 16;

/** Left activity bar — primary sidebar views (explorer, git, search, …). */
export function ActivityBar({
    activeTab,
    toggleTab,
}: {
    activeTab: string;
    toggleTab: (id: string) => void;
}) {
    const { open_files } = useProjectState();
    const dirtyCount = open_files.filter((f) => f.is_dirty).length;

    return (
        <nav
            className={cn(activityBarClassName, "h-full justify-between py-0.5")}
            aria-label="Active View Switcher"
        >
            <div className="flex flex-col items-stretch">
                <ActivityBarItem
                    label="Explorer"
                    active={activeTab === "explorer"}
                    onClick={() => toggleTab("explorer")}
                    badge={
                        dirtyCount > 0 ? (
                            <div className="absolute top-[9px] right-[3px] pointer-events-none" aria-hidden>
                                <div className="flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-2xs font-medium leading-none text-white bg-accent">
                                    {dirtyCount}
                                </div>
                            </div>
                        ) : undefined
                    }
                >
                    <Icon name="insert_drive_file" size={ICON_SIZE} />
                </ActivityBarItem>
                <ActivityBarItem
                    label="Source Control"
                    active={activeTab === "source"}
                    onClick={() => toggleTab("source")}
                >
                    <Icon name="account_tree" size={ICON_SIZE} />
                </ActivityBarItem>
                <ActivityBarItem
                    label="Git Graph"
                    active={activeTab === "graph"}
                    onClick={() => toggleTab("graph")}
                >
                    <Icon name="commit" size={ICON_SIZE} />
                </ActivityBarItem>
                <ActivityBarItem
                    label="Outline"
                    active={activeTab === "outline"}
                    onClick={() => toggleTab("outline")}
                >
                    <Icon name="format_list_bulleted" size={ICON_SIZE} />
                </ActivityBarItem>
                <ActivityBarItem
                    label="Search"
                    active={activeTab === "search"}
                    onClick={() => toggleTab("search")}
                >
                    <Icon name="search" size={ICON_SIZE} />
                </ActivityBarItem>
            </div>

            <div className="flex flex-col items-stretch mt-auto">
                <ActivityBarItem
                    label="Settings"
                    onClick={() => void openSettingsWindow()}
                >
                    <Icon name="settings" size={ICON_SIZE} />
                </ActivityBarItem>
            </div>
        </nav>
    );
}

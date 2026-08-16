"use client";

import { useMemo } from "react";
import { useProjectState, type FileInfo } from "@/lib/backend";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useEditorSplit, type EditorGroupId } from "@/core/providers/editor";
import { getIconPath } from "@/lib/ui/icons/files";
import { isSettingsTab, isVirtualEditorTab } from "@/lib/settings-tab";
import { isDesignPreviewTab } from "@/lib/design-preview-tab";
import { isBrowserTab } from "@/lib/browser-tab";
import { ChromeBrowserIcon } from "@/components/ui/chrome-browser-icon";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { TabBarActions } from "./tab-bar-actions";

function getTabLabel(file: FileInfo): string {
    const isDiff = file.path.startsWith("diff:");
    const isStaged = file.path.startsWith("diff:staged:");
    const rawFileName = isDiff
        ? file.name.replace(/^(⟷\s*)?/, "").replace(/^diff:(staged|unstaged):/, "")
        : file.name;
    const diffLabel = isDiff ? (isStaged ? "Index" : "Working Tree") : "";
    return isDiff ? `${rawFileName} (${diffLabel})` : file.name;
}

function TabFileIcon({ file }: { file: FileInfo }) {
    if (isDesignPreviewTab(file.path)) {
        return <Icon name="auto_awesome" size={14} className="shrink-0 text-text-muted" />;
    }
    if (isBrowserTab(file.path)) {
        return <ChromeBrowserIcon size={14} className="shrink-0 text-text-muted" />;
    }
    if (isSettingsTab(file.path)) {
        return <Icon name="settings" size={14} className="shrink-0 text-accent" />;
    }
    const rawFileName = file.path.startsWith("diff:")
        ? file.name.replace(/^(⟷\s*)?/, "").replace(/^diff:(staged|unstaged):/, "")
        : file.name;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={getIconPath(rawFileName)} alt="" className="w-4 h-4 shrink-0" />
    );
}

export function CompactTabBar({
    group = "left",
    showActions = true,
}: {
    group?: EditorGroupId;
    showActions?: boolean;
}) {
    const { open_files } = useProjectState();
    const { getGroupActiveFile, setGroupActiveFile, getGroupTabs, splitEnabled } = useEditorSplit();
    const groupActiveFile = getGroupActiveFile(group);
    const groupTabPaths = getGroupTabs(group);

    const sortedFiles = useMemo(() => {
        const pathSet = new Set(groupTabPaths);
        const inGroup = open_files.filter((f) => pathSet.has(f.path));
        const pinned = inGroup.filter((f) => f.is_pinned);
        const unpinned = inGroup.filter((f) => !f.is_pinned);
        return [...pinned, ...unpinned];
    }, [open_files, groupTabPaths]);

    const activeFile = sortedFiles.find((f) => f.path === groupActiveFile) ?? sortedFiles[0];

    if (sortedFiles.length === 0 && !splitEnabled) return null;

    return (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-end p-1.5">
            <div
                className={cn(
                    "pointer-events-auto flex max-w-[min(100%,420px)] items-center gap-0.5",
                    "rounded-lg border border-border-subtle bg-panel shadow-sm",
                )}
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 min-w-0 max-w-[200px] gap-1.5 px-2 font-normal"
                        >
                            {activeFile ? (
                                <>
                                    <TabFileIcon file={activeFile} />
                                    <span className="truncate text-sm">{getTabLabel(activeFile)}</span>
                                </>
                            ) : (
                                <span className="truncate text-sm text-text-muted">Open editors</span>
                            )}
                            <Icon name="expand_more" className="size-icon-sm shrink-0 text-text-muted" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 min-w-[220px] overflow-y-auto">
                        {sortedFiles.map((file) => (
                            <DropdownMenuCheckboxItem
                                key={file.path}
                                checked={groupActiveFile === file.path}
                                onCheckedChange={() => setGroupActiveFile(group, file.path)}
                                className="gap-2"
                            >
                                <TabFileIcon file={file} />
                                <span className="truncate">{getTabLabel(file)}</span>
                                {file.is_dirty && (
                                    <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                                )}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                {isVirtualEditorTab(groupActiveFile) ? (
                    <TabBarActions compactOnly />
                ) : showActions ? (
                    <TabBarActions />
                ) : null}
            </div>
        </div>
    );
}

"use client";

import { createPortal } from "react-dom";
import { commands, useProjectState } from "@/lib/backend";
import { FileTree } from "./tree";
import { HostedSidebarBack } from "@/features/agent/sidebar/hosted-nav";

/** File tree portaled into the agent sidebar. Files open in the right panel. */
export function FilesMode({
    projectPath,
    navPortalTarget,
    sidebarExpanded = true,
    onClose,
}: {
    projectPath: string;
    navPortalTarget: HTMLElement | null;
    sidebarExpanded?: boolean;
    onClose?: () => void;
}) {
    const { active_file } = useProjectState();
    const collapsed = Boolean(navPortalTarget) && !sidebarExpanded;

    const openDiskFile = (path: string) => {
        const name = path.split(/[\\/]/).pop() || path;
        void commands.openFile(path, name);
    };

    const tree = (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            {onClose ? (
                <HostedSidebarBack
                    label="Chats"
                    onBack={onClose}
                    collapsed={collapsed}
                />
            ) : null}
            {collapsed ? null : (
                <div className="min-h-0 flex-1 overflow-hidden">
                    <FileTree
                        projectPath={projectPath}
                        activePath={active_file}
                        onOpenFile={openDiskFile}
                    />
                </div>
            )}
        </div>
    );

    if (navPortalTarget && typeof document !== "undefined") {
        return createPortal(tree, navPortalTarget);
    }

    return <div className="flex h-full w-60 shrink-0 flex-col overflow-hidden">{tree}</div>;
}

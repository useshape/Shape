"use client";

import { createPortal } from "react-dom";
import { commands, useProjectState } from "@/lib/backend";
import { EditorViewProvider, EditorSplitProvider } from "@/core/providers/editor";
import EditorTabs from "@/features/editor/ui/tabs/tabs";
import { FileTree } from "./tree";
import { FileEditor } from "./editor";
import { HostedSidebarBack } from "@/features/agent/sidebar/hosted-nav";
import { AccountRow } from "@/features/agent/sidebar/account";

/** Editor in main; file tree portaled into the agent sidebar. */
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
    return (
        <EditorViewProvider>
            <EditorSplitProvider>
                <FilesModeInner
                    projectPath={projectPath}
                    navPortalTarget={navPortalTarget}
                    sidebarExpanded={sidebarExpanded}
                    onClose={onClose}
                />
            </EditorSplitProvider>
        </EditorViewProvider>
    );
}

function FilesModeInner({
    projectPath,
    navPortalTarget,
    sidebarExpanded,
    onClose,
}: {
    projectPath: string;
    navPortalTarget: HTMLElement | null;
    sidebarExpanded: boolean;
    onClose?: () => void;
}) {
    const { active_file } = useProjectState();

    const openDiskFile = (path: string) => {
        const name = path.split(/[\\/]/).pop() || path;
        void commands.openFile(path, name);
    };

    const collapsed = Boolean(navPortalTarget) && !sidebarExpanded;

    const tree = (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            {onClose ? (
                <HostedSidebarBack label="Back" onBack={onClose} collapsed={collapsed} />
            ) : null}
            {collapsed ? null : (
                <>
                    <div className="min-h-0 flex-1 overflow-hidden">
                        <FileTree
                            projectPath={projectPath}
                            activePath={active_file}
                            onOpenFile={openDiskFile}
                        />
                    </div>
                    <div className="mt-auto shrink-0 px-1 pb-1">
                        <AccountRow />
                    </div>
                </>
            )}
        </div>
    );

    return (
        <div className="flex h-full min-h-0 w-full overflow-hidden bg-panel">
            {navPortalTarget ? (
                createPortal(tree, navPortalTarget)
            ) : (
                <div className="flex h-full w-60 shrink-0 flex-col overflow-hidden">{tree}</div>
            )}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <EditorTabs showActions />
                {active_file ? (
                    <div className="min-h-0 flex-1 overflow-hidden">
                        <FileEditor key={active_file} path={active_file} />
                    </div>
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3">
                        <p className="text-sm text-text-muted">Open a file to get started.</p>
                        <button
                            type="button"
                            className="rounded-md border border-border-subtle px-3 py-1 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                            onClick={() =>
                                window.dispatchEvent(
                                    new CustomEvent("shape-command-palette", {
                                        detail: { mode: "files", placeholder: "Open any file…" },
                                    }),
                                )
                            }
                        >
                            Open File
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

import React, { useState, useCallback, useRef, useMemo } from "react";
import { Icon } from "@/components/ui/icon";
import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
} from "@/components/ui/context";
import { cn } from "@/lib/utils";
import { FileIcon } from "@/components/ui/file-icon";
import {
    commands,
    GitFileParams,
    GitLogEntry,
    GraphNode
} from "@/lib/backend";
import { notify } from "@/features/notifications";
import { Tooltip } from "@/components/ui/tooltip";
import { confirm } from "@tauri-apps/plugin-dialog";
import { getRelativeTime, renderCommitMessage } from "./utils";
import { LANE_WIDTH, ROW_HEIGHT } from "./constants";
import { RefPill, type RefInfo } from "./ref-pill";
import { GraphSvgRow } from "./svg-row";
import { CreateBranchFromCommitInline } from "./create-branch";

// ── COMMIT ROW ──
export const GraphCommitRow = React.memo(function GraphCommitRow({
    log, node, repoPath, index, total, isExpanded,
    onToggleExpand, onShowCommitDiff, onOpenFile, onRefresh,
    files, filesLoaded, onFilesLoaded, laneAvatarUrl,
    surface = "panel",
}: {
    log: GitLogEntry; node: GraphNode; repoPath: string | null;
    index: number; total: number; isExpanded: boolean;
    onToggleExpand: (hash: string) => void;
    onShowCommitDiff: (hash: string, path: string) => void;
    onOpenFile: (path: string) => void;
    onRefresh: () => void;
    files: GitFileParams[]; filesLoaded: boolean;
    onFilesLoaded: (hash: string, files: GitFileParams[]) => void;
    laneAvatarUrl?: string | null;
    /** panel = sidebar graph; editor = Git Manager. Affects commit tooltip placement. */
    surface?: "panel" | "editor";
}) {
    const isCurrent = index === 0;
    const isFirst = index === 0;
    const isLast = index === total - 1;
    const isMerge = log.parent_count > 1;
    const filesLoadingRef = useRef(false);
    const [showBranchInput, setShowBranchInput] = useState(false);

    // Highly robust Tooltip state interceptor!
    const [tooltipOpen, setTooltipOpen] = useState(false);
    const isDraggingRef = useRef(false);

    // Auto-timeout for Tooltip when dragging finishes outside bounds
    const closeTimeoutRef = useRef<number | null>(null);

    const allRefs = useMemo((): RefInfo[] => {
        if (!log.refs || log.refs.length === 0) return [];
        return log.refs.map(r => {
            const cleaned = r.replace(/HEAD -> /g, '').replace(/HEAD/g, 'head').trim();
            const isRemote = cleaned.startsWith('origin/') || cleaned.startsWith('upstream/');
            const isHead = r.toLowerCase().includes('head');
            const isTag = cleaned.startsWith('tag: ');
            return { label: cleaned, isRemote, isHead, isTag };
        });
    }, [log.refs]);

    let rowMaxLane = node.lane;
    for (const p of node.paths) {
        if (p.fromX > rowMaxLane) rowMaxLane = p.fromX;
        if (p.toX > rowMaxLane) rowMaxLane = p.toX;
    }

    const visibleRefs = useMemo(() => {
        const preferred = allRefs.filter((r) => r.label.toLowerCase() !== "head" && r.label !== "origin/head");
        const list = preferred.length > 0 ? preferred : allRefs;
        return list.slice(0, 3);
    }, [allRefs]);
    const extraRefCount = Math.max(0, allRefs.filter((r) => r.label.toLowerCase() !== "head").length - visibleRefs.length);

    const triggerFileLoad = useCallback(() => {
        if (!filesLoaded && repoPath && !filesLoadingRef.current) {
            filesLoadingRef.current = true;
            commands.gitCommitFiles(repoPath, log.hash).then(results => {
                onFilesLoaded(log.hash, results);
            }).catch(() => {
                filesLoadingRef.current = false;
            });
        }
    }, [filesLoaded, repoPath, log.hash, onFilesLoaded]);

    const handleOpenGitHub = async (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (!repoPath) return;
        try {
            let remoteUrl = await commands.gitRemoteUrl(repoPath);
            if (!remoteUrl) { notify.error("Git", "No remote URL found"); return; }
            if (remoteUrl.startsWith("git@")) remoteUrl = remoteUrl.replace(/^git@([^:]+):/, "https://$1/");
            remoteUrl = remoteUrl.replace(/\.git$/, "");
            commands.openUrlExternal(`${remoteUrl}/commit/${log.hash}`);
        } catch (err) { notify.error("Git", "Failed to get remote URL: " + String(err)); }
    };

    // Open default mail client for the author
    const handleOpenAuthorEmail = (e?: React.MouseEvent) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (log.author_email) {
            commands.openUrlExternal(`mailto:${log.author_email}`);
        } else {
            notify.error("Git", "No email found for this author.");
        }
    };

    return (
        <div className="flex flex-col px-1.5">
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        className="relative z-0 flex items-center rounded-lg cursor-pointer group transition-colors"
                        style={{ height: ROW_HEIGHT, lineHeight: `${ROW_HEIGHT}px` }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpand(log.hash);
                            if (!filesLoaded && repoPath && !isExpanded) triggerFileLoad();
                        }}
                        onPointerEnter={triggerFileLoad}
                    >
                        <div className="absolute inset-y-0 left-2 right-2 rounded-lg group-hover:bg-panel-hover pointer-events-none -z-10 transition-colors" />
                        <GraphSvgRow
                            node={node}
                            isFirst={isFirst}
                            isLast={isLast}
                            avatarUrl={laneAvatarUrl}
                            avatarKey={log.hash}
                        />
                        <div className="flex-1 flex items-center min-w-0 gap-1.5 pr-2 @container">
                            {visibleRefs.map((refInfo) => (
                                <RefPill
                                    key={refInfo.label}
                                    refInfo={refInfo}
                                    color={node.color}
                                    emphasized={refInfo.isHead || isCurrent}
                                />
                            ))}
                            {extraRefCount > 0 && (
                                <span className="text-xs text-text-muted shrink-0 tabular-nums">+{extraRefCount}</span>
                            )}
                            {isMerge && <Icon name="merge" size={16} className="text-text-primary shrink-0" />}
                            <Tooltip
                                open={tooltipOpen}
                                onOpenChange={(open) => {
                                    if (!open && isDraggingRef.current) return;
                                    setTooltipOpen(open);
                                }}
                                side={surface === "panel" ? "right" : "bottom"}
                                align={surface === "panel" ? "center" : "center"}
                                sideOffset={surface === "panel" ? 10 : 8}
                                delayDuration={200}
                                avoidCollisions
                                collisionPadding={surface === "panel"
                                    ? { top: 40, bottom: 31, left: 10, right: 10 }
                                    : { top: 48, bottom: 40, left: 16, right: 16 }}
                                content={
                                    <div
                                        id={`tooltip-content-${log.hash}`}
                                        className="flex p-0.5 flex-col gap-2 min-w-[300px] max-w-[500px]"
                                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                        onPointerDown={() => {
                                            isDraggingRef.current = true;
                                            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                                            const upHandler = () => {
                                                isDraggingRef.current = false;
                                                window.removeEventListener('pointerup', upHandler);
                                            };
                                            window.addEventListener('pointerup', upHandler);
                                        }}
                                        onPointerLeave={(e) => {
                                            if (e.buttons === 1) return;
                                            closeTimeoutRef.current = window.setTimeout(() => setTooltipOpen(false), 250);
                                        }}
                                        onPointerEnter={() => {
                                            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                                        }}
                                    >
                                        <div className="flex items-center gap-1 text-sm text-text-secondary flex-wrap pointer-events-auto">
                                            <span
                                                className="font-medium text-text-primary cursor-pointer hover:underline hover:text-accent"
                                                onClick={handleOpenAuthorEmail}
                                            >
                                                {log.author}
                                            </span>
                                            <span>,</span>
                                            <span>{getRelativeTime(log.date)}</span>
                                            <span className="text-text-muted">
                                                ({new Date(parseInt(log.date) * 1000).toLocaleString(undefined, {
                                                    month: 'long', day: 'numeric', year: 'numeric',
                                                    hour: 'numeric', minute: '2-digit', hour12: true
                                                })})
                                            </span>
                                        </div>
                                        <div
                                            className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap wrap-break-word max-h-[250px] overflow-y-auto custom-scrollbar pr-2 pb-2 select-text pointer-events-auto"
                                            style={{ WebkitMaskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)' }}
                                        >
                                            {renderCommitMessage(log.message)}
                                        </div>
                                        <div className="flex items-center gap-4 mt-0.5 text-text-muted pointer-events-auto">
                                            <div
                                                className="flex items-center gap-1.5 cursor-pointer hover:text-text-primary transition-colors py-0.5"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(log.hash); notify.success("Copied", "Commit hash copied to clipboard"); }}
                                            >
                                                <Icon name="content_copy" size={16} />
                                                <span className="text-sm font-medium select-text">{log.hash.slice(0, 7)}</span>
                                            </div>
                                            <div
                                                className="flex items-center gap-1.5 cursor-pointer hover:text-text-primary transition-colors py-0.5"
                                                onClick={handleOpenGitHub}
                                            >
                                                <Icon name="open_in_new" size={16} />
                                                <span className="text-sm">Open in GitHub</span>
                                            </div>
                                        </div>
                                    </div>
                                }
                            >
                                <span
                                    className={cn(
                                        "text-sm truncate flex-1 min-w-0",
                                        isCurrent ? "text-text-primary font-medium" : "text-text-secondary",
                                    )}
                                >
                                    {log.message.split('\n')[0]}
                                </span>
                            </Tooltip>
                            <span className="text-sm text-text-primary shrink-0 opacity-50 max-w-[60px] truncate hidden @[360px]:inline">{log.author.split(' ')[0]}</span>
                            <span className="text-sm text-text-primary shrink-0 opacity-35 tabular-nums hidden @[300px]:inline">{getRelativeTime(log.date)}</span>
                        </div>
                    </div>
                </ContextMenuTrigger>

                <ContextMenuContent>
                    <ContextMenuItem onClick={() => { navigator.clipboard.writeText(log.hash); notify.success("Copied", "Commit hash copied"); }}>
                        Copy Commit Hash
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => { navigator.clipboard.writeText(log.message); notify.success("Copied", "Commit message copied"); }}>
                        Copy Commit Message
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => { navigator.clipboard.writeText(log.author); notify.success("Copied", "Author copied"); }}>
                        Copy Author Name
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={async () => {
                        if (!repoPath) return;
                        try {
                            const commitFiles = filesLoaded ? files : await commands.gitCommitFiles(repoPath, log.hash);
                            commitFiles.forEach((file: GitFileParams) => onShowCommitDiff(log.hash, file.path));
                        } catch (e) { notify.error("Git Error", String(e)); }
                    }}>
                        Open All Changes
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    {showBranchInput ? (
                        <CreateBranchFromCommitInline
                            hash={log.hash}
                            repoPath={repoPath || ""}
                            onDone={() => { setShowBranchInput(false); onRefresh(); }}
                            onCancel={() => setShowBranchInput(false)}
                        />
                    ) : (
                        <ContextMenuItem onClick={(e) => { e.preventDefault(); setShowBranchInput(true); }}>
                            Create Branch from Here...
                        </ContextMenuItem>
                    )}
                    <ContextMenuItem onClick={async () => {
                        if (!repoPath) return;
                        const ok = await confirm(
                            `Checkout commit ${log.hash.slice(0, 7)}? This creates a detached HEAD.`,
                            { title: "Checkout commit", kind: "warning", okLabel: "Checkout", cancelLabel: "Cancel" },
                        );
                        if (!ok) return;
                        try {
                            await commands.gitCheckoutCommit(repoPath, log.hash);
                            notify.success("Git", `Checked out ${log.hash.slice(0, 7)}`);
                            onRefresh();
                        } catch (e) { notify.gitError(e); }
                    }}>
                        Checkout This Commit...
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={async () => {
                        if (!repoPath) return;
                        const ok = await confirm(
                            `Cherry-pick ${log.hash.slice(0, 7)} onto current branch?`,
                            { title: "Cherry-pick", kind: "info", okLabel: "Cherry-pick", cancelLabel: "Cancel" },
                        );
                        if (!ok) return;
                        try {
                            await commands.gitCherryPick(repoPath, log.hash);
                            notify.success("Git", `Cherry-picked ${log.hash.slice(0, 7)}`);
                            onRefresh();
                        } catch (e) { notify.gitError(e); }
                    }}>
                        Cherry-pick Commit
                    </ContextMenuItem>
                    <ContextMenuItem onClick={async () => {
                        if (!repoPath) return;
                        const ok = await confirm(
                            `Revert ${log.hash.slice(0, 7)}? This creates a new revert commit.`,
                            { title: "Revert commit", kind: "warning", okLabel: "Revert", cancelLabel: "Cancel" },
                        );
                        if (!ok) return;
                        try {
                            await commands.gitRevertCommit(repoPath, log.hash);
                            notify.success("Git", `Reverted ${log.hash.slice(0, 7)}`);
                            onRefresh();
                        } catch (e) { notify.gitError(e); }
                    }}>
                        Revert Commit
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={handleOpenGitHub}>
                        Open in GitHub
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {/* Expanded file list */}
            <div className={isExpanded ? "block" : "hidden"}>
                <div className="overflow-hidden relative">
                    {!isLast && node.paths.filter(p => p.type === 'passthrough' || p.type === 'outgoing').map((p, pi) => (
                        <div
                            key={`cont-${pi}`}
                            className="absolute top-0 bottom-0 pointer-events-none"
                            style={{ left: p.toX * LANE_WIDTH + LANE_WIDTH / 2 + 4 - 1, width: 2, backgroundColor: p.color }}
                        />
                    ))}
                    <div style={{ paddingLeft: Math.max((rowMaxLane + 1) * LANE_WIDTH, 28) }} className="pr-1 space-y-0 relative z-10">
                        {files.length > 0 ? (
                            files.map((file: GitFileParams, i: number) => {
                                const name = file.path.split(/[\\\/]/).pop() || "";
                                const folder = file.path.substring(0, file.path.length - name.length - 1);
                                return (
                                    <ContextMenu key={i}>
                                        <ContextMenuTrigger asChild>
                                            <Tooltip
                                                content={`${file.path} • ${file.status === 'M' ? 'Modified' : file.status === 'A' ? 'Added' : file.status === 'D' ? 'Deleted' : file.status === 'R' ? 'Renamed' : 'Changed'}`}
                                                side="bottom"
                                                align="start"
                                                delayDuration={400}
                                            >
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); onShowCommitDiff(log.hash, file.path); }}
                                                    className="flex items-center gap-2 group/file cursor-pointer hover:bg-panel-hover px-2 rounded-md w-full"
                                                    style={{ height: 22 }}
                                                >
                                                    <div className="w-3.5 flex justify-center opacity-80 shrink-0">
                                                        <FileIcon name={name} className="w-3.5 h-3.5" />
                                                    </div>
                                                    <span className="text-sm text-text-secondary group-hover/file:text-text-primary transition-colors shrink-0 truncate max-w-[50%]">{name}</span>
                                                    {folder && (
                                                        <span className="text-sm text-text-muted truncate flex-1 opacity-60 text-left min-w-0 pr-2">{folder}</span>
                                                    )}
                                                    <span
                                                        className="text-sm font-medium w-4 text-center shrink-0 ml-auto"
                                                        style={{
                                                            color: file.status === "C" ? "var(--git-conflict)" :
                                                                file.status === "M" ? "var(--git-modified)" :
                                                                file.status === "A" || file.status === "U" ? "var(--git-added)" :
                                                                    file.status === "D" ? "var(--git-deleted)" : "var(--git-added)"
                                                        }}
                                                    >
                                                        {file.status}
                                                    </span>
                                                </div>
                                            </Tooltip>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent>
                                            <ContextMenuItem onClick={() => onShowCommitDiff(log.hash, file.path)}>
                                                Open Changes
                                            </ContextMenuItem>
                                        </ContextMenuContent>
                                    </ContextMenu>
                                );
                            })
                        ) : (
                            <div className="text-xs text-text-disabled py-1 pl-2">No changes found</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

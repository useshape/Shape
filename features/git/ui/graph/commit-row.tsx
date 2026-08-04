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
import { LANE_WIDTH, ROW_HEIGHT, commitIsHead } from "./constants";
import { RefPill, type RefInfo } from "./ref-pill";
import { GraphSvgRow } from "./svg-row";
import { CreateBranchFromCommitInline } from "./create-branch";

export const GraphCommitRow = React.memo(function GraphCommitRow({
    log, node, repoPath, index, total, isExpanded,
    onToggleExpand, onShowCommitDiff, onOpenFile, onRefresh,
    files, filesLoaded, onFilesLoaded, laneAvatarUrl,
    surface = "panel",
    muted = false,
    selected = false,
    onSelect,
    onRefActivate,
    matchHighlight = false,
    blendTop = false,
    blendBottom = false,
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
    /** Filter miss — dim lane lines (keep topology); text/refs stay readable. */
    muted?: boolean;
    selected?: boolean;
    onSelect?: (hash: string) => void;
    /** Manager: clicking a branch/tag pill filters the graph. */
    onRefActivate?: (ref: RefInfo) => void;
    /** Filter hit — soft lane emphasis. */
    matchHighlight?: boolean;
    /** Adjacent commit above/below is a match — fade mute into it. */
    blendTop?: boolean;
    blendBottom?: boolean;
}) {
    const isManager = surface === "editor";
    const isHead = commitIsHead(log.refs);
    const isFirst = index === 0;
    const isLast = index === total - 1;
    const isMerge = log.parent_count > 1;
    const filesLoadingRef = useRef(false);
    const [showBranchInput, setShowBranchInput] = useState(false);

    const [tooltipOpen, setTooltipOpen] = useState(false);
    const isDraggingRef = useRef(false);
    const closeTimeoutRef = useRef<number | null>(null);

    const allRefs = useMemo((): RefInfo[] => {
        if (!log.refs || log.refs.length === 0) return [];
        return log.refs.map(r => {
            const cleaned = r.replace(/HEAD -> /g, '').replace(/HEAD/g, 'head').trim();
            const isRemote = cleaned.startsWith('origin/') || cleaned.startsWith('upstream/');
            const isHeadRef = r.toLowerCase().includes('head');
            const isTag = cleaned.startsWith('tag: ');
            return { label: cleaned, isRemote, isHead: isHeadRef, isTag };
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
                filesLoadingRef.current = false;
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

    const handleOpenAuthorEmail = (e?: React.MouseEvent) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (log.author_email) {
            commands.openUrlExternal(`mailto:${log.author_email}`);
        } else {
            notify.error("Git", "No email found for this author.");
        }
    };

    return (
        <div
            className={cn(
                "flex flex-col px-1.5",
                muted && "graph-commit-mute",
                matchHighlight && !muted && "graph-commit-match",
            )}
            data-hash={log.hash}
            data-blend-top={muted && blendTop ? "1" : undefined}
            data-blend-bottom={muted && blendBottom ? "1" : undefined}
        >
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        role="option"
                        aria-selected={selected}
                        tabIndex={-1}
                        className={cn(
                            "relative z-0 flex items-center rounded-lg cursor-pointer group transition-colors outline-none",
                            selected && "bg-black/[0.12] dark:bg-white/[0.12]",
                        )}
                        style={{ height: ROW_HEIGHT, lineHeight: `${ROW_HEIGHT}px` }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect?.(log.hash);
                            onToggleExpand(log.hash);
                            if (!filesLoaded && repoPath && !isExpanded) triggerFileLoad();
                        }}
                        onPointerEnter={triggerFileLoad}
                    >
                        {/* Hover / selected / expanded backgrounds — vscode-git-graph style */}
                        <div
                            className={cn(
                                "absolute inset-y-0 left-1 right-1 rounded-md pointer-events-none -z-10 transition-colors",
                                isExpanded
                                    ? "bg-black/15 dark:bg-white/15"
                                    : selected
                                      ? "bg-black/[0.12] dark:bg-white/[0.12]"
                                      : "group-hover:bg-black/[0.08] dark:group-hover:bg-white/[0.08]",
                            )}
                        />
                        <GraphSvgRow
                            node={node}
                            isFirst={isFirst}
                            isLast={isLast}
                            isHead={isHead}
                            muted={muted}
                            avatarUrl={laneAvatarUrl}
                            avatarKey={log.hash}
                        />
                        <div className="flex-1 flex items-center min-w-0 gap-1.5 pr-2 @container">
                            {visibleRefs.map((refInfo) => (
                                <RefPill
                                    key={refInfo.label}
                                    refInfo={refInfo}
                                    color={node.color}
                                    emphasized={refInfo.isHead || isHead}
                                    hoverOnly={isManager}
                                    onActivate={isManager ? onRefActivate : undefined}
                                />
                            ))}
                            {extraRefCount > 0 && (
                                isManager ? (
                                    <span
                                        className="text-xs text-text-muted shrink-0 tabular-nums cursor-default"
                                        title={allRefs
                                            .filter((r) => r.label.toLowerCase() !== "head")
                                            .slice(visibleRefs.length)
                                            .map((r) => r.label.replace(/^tag:\s*/i, ""))
                                            .join(", ")}
                                    >
                                        +{extraRefCount}
                                    </span>
                                ) : (
                                    <Tooltip
                                        content={
                                            <div className="flex flex-col gap-1 max-w-[240px]">
                                                <span className="text-xs text-text-muted">
                                                    +{extraRefCount} more ref{extraRefCount === 1 ? "" : "s"}
                                                </span>
                                                {allRefs
                                                    .filter((r) => r.label.toLowerCase() !== "head")
                                                    .slice(visibleRefs.length)
                                                    .map((r) => (
                                                        <span key={r.label} className="text-sm text-text-primary truncate">
                                                            {r.label.replace(/^tag:\s*/i, "")}
                                                        </span>
                                                    ))}
                                            </div>
                                        }
                                        side="top"
                                        delayDuration={200}
                                    >
                                        <span className="text-xs text-text-muted shrink-0 tabular-nums cursor-default">
                                            +{extraRefCount}
                                        </span>
                                    </Tooltip>
                                )
                            )}
                            {isMerge && <Icon name="merge" size={16} className="text-text-primary shrink-0 opacity-80" />}
                            {isManager ? (
                                <span
                                    className={cn(
                                        "text-sm truncate flex-1 min-w-0",
                                        isHead || isExpanded ? "text-text-primary font-medium" : "text-text-secondary",
                                    )}
                                >
                                    {log.message.split('\n')[0]}
                                </span>
                            ) : (
                            <Tooltip
                                open={tooltipOpen}
                                onOpenChange={(open) => {
                                    if (!open && isDraggingRef.current) return;
                                    setTooltipOpen(open);
                                }}
                                side="right"
                                align="center"
                                sideOffset={10}
                                delayDuration={200}
                                avoidCollisions
                                collisionPadding={{ top: 40, bottom: 31, left: 10, right: 10 }}
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
                                        isHead || isExpanded ? "text-text-primary font-medium" : "text-text-secondary",
                                    )}
                                >
                                    {log.message.split('\n')[0]}
                                </span>
                            </Tooltip>
                            )}
                            <Tooltip content={log.author} side="top" delayDuration={250}>
                                <span className="text-sm text-text-muted shrink-0 max-w-[100px] truncate hidden @[380px]:inline text-right">
                                    {log.author}
                                </span>
                            </Tooltip>
                            <span className="text-sm text-text-muted shrink-0 tabular-nums w-[52px] text-right hidden @[320px]:inline">
                                {getRelativeTime(log.date)}
                            </span>
                            <Tooltip content={log.hash} side="top" delayDuration={250}>
                                <span
                                    className="text-xs text-text-disabled shrink-0 font-mono tabular-nums w-[52px] text-right hidden @[480px]:inline opacity-70 cursor-default"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        void navigator.clipboard.writeText(log.hash);
                                        notify.success("Copied", "Commit hash copied");
                                    }}
                                >
                                    {log.hash.slice(0, 7)}
                                </span>
                            </Tooltip>
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
                    <ContextMenuItem onClick={async () => {
                        if (!repoPath) return;
                        const ok = await confirm(
                            `Soft reset HEAD to ${log.hash.slice(0, 7)}? Keeps your working tree and index changes.`,
                            { title: "Soft reset", kind: "warning", okLabel: "Reset", cancelLabel: "Cancel" },
                        );
                        if (!ok) return;
                        try {
                            await commands.gitReset(repoPath, log.hash, "soft");
                            notify.success("Git", `Soft reset to ${log.hash.slice(0, 7)}`);
                            onRefresh();
                        } catch (e) { notify.gitError(e); }
                    }}>
                        Soft Reset to Here...
                    </ContextMenuItem>
                    <ContextMenuItem onClick={async () => {
                        if (!repoPath) return;
                        const ok = await confirm(
                            `Mixed reset HEAD to ${log.hash.slice(0, 7)}? Keeps working tree; unstages index.`,
                            { title: "Mixed reset", kind: "warning", okLabel: "Reset", cancelLabel: "Cancel" },
                        );
                        if (!ok) return;
                        try {
                            await commands.gitReset(repoPath, log.hash, "mixed");
                            notify.success("Git", `Mixed reset to ${log.hash.slice(0, 7)}`);
                            onRefresh();
                        } catch (e) { notify.gitError(e); }
                    }}>
                        Mixed Reset to Here...
                    </ContextMenuItem>
                    <ContextMenuItem onClick={async () => {
                        if (!repoPath) return;
                        const ok = await confirm(
                            `HARD reset HEAD to ${log.hash.slice(0, 7)}? Discards uncommitted changes.`,
                            { title: "Hard reset", kind: "warning", okLabel: "Hard reset", cancelLabel: "Cancel" },
                        );
                        if (!ok) return;
                        try {
                            await commands.gitReset(repoPath, log.hash, "hard");
                            notify.success("Git", `Hard reset to ${log.hash.slice(0, 7)}`);
                            onRefresh();
                        } catch (e) { notify.gitError(e); }
                    }}>
                        Hard Reset to Here...
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={async () => {
                        if (!repoPath) return;
                        const name = window.prompt("Tag name", `v-${log.hash.slice(0, 7)}`);
                        if (!name?.trim()) return;
                        try {
                            await commands.gitCreateTag(repoPath, name.trim(), log.hash, null);
                            notify.success("Git", `Created tag ${name.trim()}`);
                            onRefresh();
                        } catch (e) { notify.gitError(e); }
                    }}>
                        Create Tag Here...
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={handleOpenGitHub}>
                        Open in GitHub
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {/* Expanded file list — keep same left inset as SVG so lanes don't jump */}
            <div className={isExpanded ? "block" : "hidden"}>
                <div className="overflow-hidden relative rounded-b-lg mb-0.5 bg-black/[0.06] dark:bg-white/[0.06]">
                    {!isLast && node.paths.filter(p => p.type === 'passthrough' || p.type === 'outgoing').map((p, pi) => (
                        <div
                            key={`cont-${pi}`}
                            className={cn("graph-lane-cont absolute top-0 bottom-0 pointer-events-none")}
                            style={{
                                left: p.toX * LANE_WIDTH + LANE_WIDTH / 2 + 4 - 1,
                                width: 2,
                                backgroundColor: p.color,
                            }}
                        />
                    ))}
                    <div style={{ paddingLeft: Math.max((rowMaxLane + 1) * LANE_WIDTH, 28) }} className="pr-1 py-0.5 space-y-0 relative z-10">
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
                                                    onDoubleClick={(e) => {
                                                        e.stopPropagation();
                                                        onOpenFile(file.path);
                                                    }}
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
                                            <ContextMenuItem onClick={() => onOpenFile(file.path)}>
                                                Open File
                                            </ContextMenuItem>
                                            <ContextMenuItem onClick={() => {
                                                void navigator.clipboard.writeText(file.path);
                                                notify.success("Copied", "File path copied");
                                            }}>
                                                Copy Path
                                            </ContextMenuItem>
                                        </ContextMenuContent>
                                    </ContextMenu>
                                );
                            })
                        ) : (
                            <div className="text-xs text-text-disabled py-1 pl-2">
                                {filesLoaded ? "No changes found" : "Loading…"}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

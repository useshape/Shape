"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { commands, useProjectState } from "@/lib/backend";
import type { GitBranchGraph, GitBranchGraphNode } from "@/lib/backend/types";
import { useGitRepos } from "@/lib/git/repos";
import { FadeTruncate } from "@/components/ui/fade-truncate";
import { Tooltip } from "@/components/ui/tooltip";
import { notify } from "@/features/notifications";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useFilter } from "@/features/git/ui/manager/filter-context";
import {
    DOT,
    PILL_H,
    PILL_W,
    anchor,
    colorFor,
    edgePath,
    fitGraph,
    inView,
    lodForZoom,
    nodeSize,
    shortLabel,
    type Pos,
} from "./explorer/layout";
import { BranchNode } from "./explorer/branch-node";

/** Branch-tip explorer with LOD, canvas edges, drag, and path highlighting. */
export function GraphExplorer() {
    const { project_path } = useProjectState();
    const { scmRepoPath } = useGitRepos(project_path);
    const { query } = useFilter();

    const [graph, setGraph] = useState<GitBranchGraph | null>(null);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [hovered, setHovered] = useState<string | null>(null);
    const [edgePair, setEdgePair] = useState<[string, string] | null>(null);
    const [overrides, setOverrides] = useState<Record<string, Pos>>({});
    const [pan, setPan] = useState({ x: 24, y: 24 });
    const [zoom, setZoom] = useState(1);
    const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });

    const panDragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
    const nodeDragRef = useRef<{
        name: string;
        px: number;
        py: number;
        ox: number;
        oy: number;
        moved: boolean;
    } | null>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const layerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const panRef = useRef(pan);
    const zoomRef = useRef(zoom);
    const rafRef = useRef<number | null>(null);
    const fittedKeyRef = useRef("");

    panRef.current = pan;
    zoomRef.current = zoom;
    const lod = lodForZoom(zoom);

    const applyTransform = useCallback(() => {
        if (!layerRef.current) return;
        layerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`;
    }, []);

    const refresh = useCallback(async () => {
        if (!scmRepoPath) {
            setGraph(null);
            return;
        }
        setLoading(true);
        try {
            const next = await commands.gitBranchGraph(scmRepoPath, true);
            fittedKeyRef.current = "";
            setOverrides({});
            setEdgePair(null);
            setGraph(next);
            setSelected((prev) => prev ?? next.currentBranch ?? null);
        } catch (e) {
            notify.gitError(e);
            setGraph(null);
        } finally {
            setLoading(false);
        }
    }, [scmRepoPath]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        const onRefresh = () => void refresh();
        window.addEventListener("shape-git-refresh", onRefresh);
        return () => window.removeEventListener("shape-git-refresh", onRefresh);
    }, [refresh]);

    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            setViewportSize({ w: entry.contentRect.width, h: entry.contentRect.height });
        });
        ro.observe(el);
        setViewportSize({ w: el.clientWidth, h: el.clientHeight });
        return () => ro.disconnect();
    }, []);

    const positioned = useMemo(() => {
        if (!graph) return [] as Array<GitBranchGraphNode & Pos>;
        return graph.nodes.map((n) => {
            const o = overrides[n.name];
            return { ...n, x: o?.x ?? n.x, y: o?.y ?? n.y };
        });
    }, [graph, overrides]);

    const bounds = useMemo(() => {
        if (positioned.length === 0) return { width: 400, height: 300 };
        let maxX = 0;
        let maxY = 0;
        const { w, h } = nodeSize(lod);
        for (const n of positioned) {
            maxX = Math.max(maxX, n.x + w);
            maxY = Math.max(maxY, n.y + h);
        }
        return { width: maxX + 56, height: maxY + 56 };
    }, [positioned, lod]);

    useEffect(() => {
        if (!graph || viewportSize.w <= 0 || viewportSize.h <= 0) return;
        const key = `${graph.nodes.length}:${graph.width}:${viewportSize.w}x${viewportSize.h}`;
        if (fittedKeyRef.current === key) return;
        fittedKeyRef.current = key;
        const fit = fitGraph({ width: graph.width, height: graph.height }, viewportSize.w, viewportSize.h);
        panRef.current = fit.pan;
        zoomRef.current = fit.zoom;
        setPan(fit.pan);
        setZoom(fit.zoom);
        requestAnimationFrame(applyTransform);
    }, [graph, viewportSize.w, viewportSize.h, applyTransform]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return positioned;
        return positioned.filter(
            (n) => n.name.toLowerCase().includes(q) || n.author.toLowerCase().includes(q),
        );
    }, [positioned, query]);

    const byName = useMemo(() => {
        const m = new Map<string, GitBranchGraphNode & Pos>();
        for (const n of filtered) m.set(n.name, n);
        return m;
    }, [filtered]);

    const edges = useMemo(() => {
        const out: Array<{ from: string; to: string; key: string }> = [];
        for (const n of filtered) {
            const parents = n.parents?.length ? n.parents : n.parentName ? [n.parentName] : [];
            for (const p of parents) {
                if (!byName.has(p)) continue;
                out.push({ from: p, to: n.name, key: `${p}->${n.name}` });
            }
        }
        return out;
    }, [filtered, byName]);

    const focusSet = useMemo(() => {
        const set = new Set<string>();
        if (edgePair) {
            set.add(edgePair[0]);
            set.add(edgePair[1]);
        }
        const seed = hovered ?? selected;
        if (!seed) return set;
        set.add(seed);
        const node = byName.get(seed);
        const parents = node?.parents?.length
            ? node.parents
            : node?.parentName
              ? [node.parentName]
              : [];
        for (const p of parents) set.add(p);
        for (const e of edges) {
            if (e.from === seed || e.to === seed) {
                set.add(e.from);
                set.add(e.to);
            }
        }
        return set;
    }, [hovered, selected, edgePair, byName, edges]);

    const dimming = focusSet.size > 0 && (hovered != null || edgePair != null);

    const visibleNodes = useMemo(
        () => filtered.filter((n) => inView(n, lod, pan, zoom, viewportSize.w, viewportSize.h)),
        [filtered, lod, pan, zoom, viewportSize.w, viewportSize.h],
    );

    // Canvas: edges always + node dots/pills when zoomed out (avoids 400 DOM cards).
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = bounds.width;
        const h = bounds.height;
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const stroke =
            getComputedStyle(document.documentElement).getPropertyValue("--color-border").trim() ||
            "#666";
        const accent =
            getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() ||
            "#3b82f6";

        for (const e of edges) {
            const from = byName.get(e.from);
            const to = byName.get(e.to);
            if (!from || !to) continue;
            const active =
                (edgePair && edgePair[0] === e.from && edgePair[1] === e.to) ||
                (focusSet.has(e.from) &&
                    focusSet.has(e.to) &&
                    (hovered === e.from ||
                        hovered === e.to ||
                        selected === e.from ||
                        selected === e.to ||
                        !!edgePair));
            const dim = dimming && !active;
            const path = new Path2D(edgePath(from, to, lod));
            ctx.lineWidth = active ? 2.5 : 1.25;
            ctx.strokeStyle = active ? accent : stroke;
            ctx.globalAlpha = dim ? 0.12 : active ? 1 : 0.55;
            ctx.stroke(path);
            ctx.globalAlpha = 1;
        }

        if (lod === "dot" || lod === "pill") {
            for (const n of filtered) {
                const c = colorFor(n.name, n.isCurrent);
                const active = selected === n.name || focusSet.has(n.name);
                const dim = dimming && !focusSet.has(n.name);
                ctx.globalAlpha = dim ? 0.2 : 1;
                if (lod === "dot") {
                    const r = n.isCurrent ? 7 : 5;
                    ctx.beginPath();
                    ctx.arc(n.x + DOT / 2, n.y + DOT / 2, r, 0, Math.PI * 2);
                    ctx.fillStyle = c;
                    ctx.fill();
                    if (active) {
                        ctx.strokeStyle = accent;
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }
                } else {
                    const pw = PILL_W;
                    const ph = PILL_H;
                    ctx.fillStyle = "rgba(30,30,30,0.85)";
                    ctx.strokeStyle = active ? accent : stroke;
                    ctx.lineWidth = active ? 2 : 1;
                    ctx.beginPath();
                    if (typeof ctx.roundRect === "function") {
                        ctx.roundRect(n.x, n.y, pw, ph, 10);
                    } else {
                        ctx.rect(n.x, n.y, pw, ph);
                    }
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = c;
                    ctx.fillRect(n.x, n.y, 3, ph);
                    ctx.fillStyle = "#ddd";
                    ctx.font = "10px sans-serif";
                    ctx.fillText(shortLabel(n.name).slice(0, 14), n.x + 8, n.y + 14);
                }
                ctx.globalAlpha = 1;
            }
        }
    }, [edges, byName, bounds, lod, focusSet, dimming, hovered, selected, edgePair, filtered]);

    const selectedNode = selected ? byName.get(selected) ?? null : null;

    const checkout = useCallback(
        async (name: string) => {
            if (!scmRepoPath || name === graph?.currentBranch) return;
            const ok = await confirm(`Check out branch "${name}"?`, {
                title: "Switch Branch",
                kind: "info",
                okLabel: "Checkout",
                cancelLabel: "Cancel",
            });
            if (!ok) return;
            try {
                await commands.gitSwitchBranch(scmRepoPath, name);
                notify.success("Git", `Checked out ${name}`);
                window.dispatchEvent(new Event("shape-git-refresh"));
                await refresh();
            } catch (e) {
                notify.gitError(e);
            }
        },
        [scmRepoPath, graph?.currentBranch, refresh],
    );

    const copy = useCallback((text: string, label: string) => {
        void navigator.clipboard.writeText(text);
        notify.success("Copied", `${label} copied`);
    }, []);

    const focusNode = useCallback(
        (name: string) => {
            const n = byName.get(name);
            if (!n || viewportSize.w <= 0) return;
            setSelected(name);
            setEdgePair(null);
            const { w, h } = nodeSize(lod);
            const z = Math.max(zoomRef.current, 0.85);
            zoomRef.current = z;
            setZoom(z);
            const next = {
                x: viewportSize.w / 2 - (n.x + w / 2) * z,
                y: viewportSize.h / 2 - (n.y + h / 2) * z,
            };
            panRef.current = next;
            setPan(next);
            applyTransform();
        },
        [byName, viewportSize.w, viewportSize.h, lod, applyTransform],
    );

    const onDropMerge = useCallback(
        async (from: string, onto: string) => {
            if (!scmRepoPath) return;
            const ok = await confirm(`Check out "${onto}" then merge "${from}"?`, {
                title: "Merge branches",
                kind: "info",
                okLabel: "Continue",
                cancelLabel: "Cancel",
            });
            if (!ok) return;
            try {
                await commands.gitSwitchBranch(scmRepoPath, onto);
                notify.info("Git", `On ${onto}. Finish merge of ${from} from Source Control / terminal.`);
                window.dispatchEvent(new Event("shape-git-refresh"));
                await refresh();
            } catch (e) {
                notify.gitError(e);
            }
        },
        [scmRepoPath, refresh],
    );

    const scheduleTransform = useCallback(() => {
        if (rafRef.current != null) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            applyTransform();
        });
    }, [applyTransform]);

    const syncViewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scheduleViewSync = useCallback(() => {
        if (syncViewTimer.current) return;
        syncViewTimer.current = setTimeout(() => {
            syncViewTimer.current = null;
            setPan({ ...panRef.current });
            setZoom(zoomRef.current);
        }, 80);
    }, []);

    const onWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            const next = Math.min(1.8, Math.max(0.12, zoomRef.current - e.deltaY * 0.0012));
            zoomRef.current = next;
            scheduleTransform();
            scheduleViewSync();
        } else {
            panRef.current = {
                x: panRef.current.x - e.deltaX,
                y: panRef.current.y - e.deltaY,
            };
            scheduleTransform();
            scheduleViewSync();
        }
    };

    const onNodeDragStart = (name: string, e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const n = byName.get(name);
        if (!n) return;
        nodeDragRef.current = {
            name,
            px: e.clientX,
            py: e.clientY,
            ox: n.x,
            oy: n.y,
            moved: false,
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const onPointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest("[data-branch-node]")) return;
        if ((e.target as HTMLElement).closest("[data-edge-hit]")) return;
        setEdgePair(null);
        panDragRef.current = { px: e.clientX, py: e.clientY, ox: panRef.current.x, oy: panRef.current.y };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const nd = nodeDragRef.current;
        if (nd) {
            const dx = (e.clientX - nd.px) / zoomRef.current;
            const dy = (e.clientY - nd.py) / zoomRef.current;
            if (Math.abs(dx) + Math.abs(dy) > 2) nd.moved = true;
            setOverrides((prev) => ({
                ...prev,
                [nd.name]: { x: nd.ox + dx, y: nd.oy + dy },
            }));
            return;
        }
        const d = panDragRef.current;
        if (!d) return;
        panRef.current = { x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) };
        scheduleTransform();
        scheduleViewSync();
    };

    const onPointerUp = () => {
        if (nodeDragRef.current) {
            nodeDragRef.current = null;
            return;
        }
        if (!panDragRef.current) return;
        panDragRef.current = null;
        setPan({ ...panRef.current });
    };

    const resetView = () => {
        if (!graph || viewportSize.w <= 0) return;
        fittedKeyRef.current = "";
        const fit = fitGraph({ width: graph.width, height: graph.height }, viewportSize.w, viewportSize.h);
        panRef.current = fit.pan;
        zoomRef.current = fit.zoom;
        setPan(fit.pan);
        setZoom(fit.zoom);
        applyTransform();
        fittedKeyRef.current = `${graph.nodes.length}:${graph.width}:${viewportSize.w}x${viewportSize.h}`;
    };

    const hitEdge = (e: React.MouseEvent) => {
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;
        const wx = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
        const wy = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;

        // Prefer node hit when zoomed out (canvas dots have no DOM).
        if (lod !== "card") {
            let bestNode: { name: string; dist: number } | null = null;
            const { w, h } = nodeSize(lod);
            for (const n of visibleNodes) {
                const cx = n.x + w / 2;
                const cy = n.y + h / 2;
                const dist = Math.hypot(wx - cx, wy - cy);
                const thresh = lod === "dot" ? 16 : 28;
                if (dist < thresh && (!bestNode || dist < bestNode.dist)) {
                    bestNode = { name: n.name, dist };
                }
            }
            if (bestNode) {
                setSelected(bestNode.name);
                setEdgePair(null);
                return;
            }
        }

        let best: { from: string; to: string; dist: number } | null = null;
        for (const edge of edges) {
            const from = byName.get(edge.from);
            const to = byName.get(edge.to);
            if (!from || !to) continue;
            const a = anchor(from, lod, "right");
            const b = anchor(to, lod, "left");
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const dist = Math.hypot(wx - mx, wy - my);
            if (dist < 28 && (!best || dist < best.dist)) {
                best = { from: edge.from, to: edge.to, dist };
            }
        }
        if (best) {
            setEdgePair([best.from, best.to]);
            setSelected(best.to);
        }
    };

    if (!project_path || !scmRepoPath) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
                Open a Git repository to explore branches.
            </div>
        );
    }

    const shown = filtered.length;
    const total = graph?.total ?? shown;
    const barPos = selectedNode
        ? {
              left: selectedNode.x,
              top: selectedNode.y - 36,
              width: Math.max(nodeSize(lod).w, 160),
          }
        : null;

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-editor text-text-primary">
            <div className="flex h-9 shrink-0 items-center justify-between gap-2 px-3">
                <FadeTruncate className="min-w-0 flex-1 text-sm font-regular" title="Explorer">
                    Explorer
                    {graph ? (
                        <span className="ml-2 text-xs font-normal text-text-muted">
                            {graph.truncated ? `${shown}/${total}` : shown}
                            {graph.detached ? " · detached" : ""}
                        </span>
                    ) : null}
                </FadeTruncate>
                <div className="flex shrink-0 items-center gap-0.5">
                    <Tooltip content="Zoom out">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                zoomRef.current = Math.max(0.18, zoomRef.current - 0.1);
                                setZoom(zoomRef.current);
                                applyTransform();
                            }}
                        >
                            <Icon name="remove" size={14} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Zoom in">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                zoomRef.current = Math.min(1.8, zoomRef.current + 0.1);
                                setZoom(zoomRef.current);
                                applyTransform();
                            }}
                        >
                            <Icon name="add" size={14} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Fit">
                        <Button variant="ghost" size="icon" onClick={resetView}>
                            <Icon name="colorize" size={14} />
                        </Button>
                    </Tooltip>
                    <Tooltip content="Refresh">
                        <Button
                            variant="ghost"
                            size="icon"
                            disabled={loading}
                            onClick={() => void refresh()}
                        >
                            <Icon name="refresh" size={14} />
                        </Button>
                    </Tooltip>
                </div>
            </div>

            <div className="min-h-0 flex-1 p-2 pt-0">
                <div
                    ref={viewportRef}
                    className="relative h-full min-h-0 cursor-grab overflow-hidden rounded-lg border border-border bg-panel/40 active:cursor-grabbing"
                    onWheel={onWheel}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onClick={hitEdge}
                >
                    <div
                        ref={layerRef}
                        className="absolute left-0 top-0 origin-top-left"
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            width: bounds.width,
                            height: bounds.height,
                            willChange: "transform",
                        }}
                    >
                        <canvas
                            ref={canvasRef}
                            className="pointer-events-none absolute left-0 top-0"
                            aria-hidden
                        />

                        {/* Edge hits only when an endpoint is on-screen */}
                        <svg
                            className="absolute left-0 top-0 overflow-visible"
                            width={bounds.width}
                            height={bounds.height}
                        >
                            {edges.map((e) => {
                                const from = byName.get(e.from);
                                const to = byName.get(e.to);
                                if (!from || !to) return null;
                                if (
                                    !inView(from, lod, pan, zoom, viewportSize.w, viewportSize.h) &&
                                    !inView(to, lod, pan, zoom, viewportSize.w, viewportSize.h)
                                ) {
                                    return null;
                                }
                                return (
                                    <path
                                        key={e.key}
                                        data-edge-hit
                                        d={edgePath(from, to, lod)}
                                        fill="none"
                                        stroke="transparent"
                                        strokeWidth={14}
                                        className="cursor-pointer"
                                        onClick={(ev) => {
                                            ev.stopPropagation();
                                            setEdgePair([e.from, e.to]);
                                            setSelected(e.to);
                                        }}
                                        onMouseEnter={() => setHovered(e.to)}
                                        onMouseLeave={() => setHovered(null)}
                                    />
                                );
                            })}
                        </svg>

                        {/* Cards only when zoomed in — dots/pills are canvas-drawn */}
                        {lod === "card"
                            ? visibleNodes.map((node) => (
                                  <div
                                      key={node.name}
                                      onMouseEnter={() => setHovered(node.name)}
                                      onMouseLeave={() => setHovered(null)}
                                  >
                                      <BranchNode
                                          node={node}
                                          pos={{ x: node.x, y: node.y }}
                                          lod={lod}
                                          color={colorFor(node.name, node.isCurrent)}
                                          selected={selected === node.name}
                                          dimmed={dimming && !focusSet.has(node.name)}
                                          highlighted={
                                              focusSet.has(node.name) &&
                                              (hovered === node.name || !!edgePair)
                                          }
                                          onSelect={(name) => {
                                              setSelected(name);
                                              setEdgePair(null);
                                          }}
                                          onCheckout={(name) => void checkout(name)}
                                          onCopy={copy}
                                          onFocus={focusNode}
                                          onNodeDragStart={onNodeDragStart}
                                          onDropMerge={(from, onto) => void onDropMerge(from, onto)}
                                      />
                                  </div>
                              ))
                            : null}

                        {selectedNode && barPos ? (
                            <div
                                className="absolute z-10 flex items-center gap-1 rounded-md border border-border bg-panel px-1.5 py-0.5 shadow-md"
                                style={{ left: barPos.left, top: barPos.top, maxWidth: 280 }}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <span className="min-w-0 flex-1 truncate px-1 text-[11px] font-medium">
                                    {selectedNode.name}
                                </span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-1.5 text-[11px]"
                                    onClick={() => focusNode(selectedNode.name)}
                                >
                                    Focus
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-6 px-1.5 text-[11px]"
                                    disabled={selectedNode.isCurrent || !!selectedNode.isDetached}
                                    onClick={() => void checkout(selectedNode.name)}
                                >
                                    Checkout
                                </Button>
                            </div>
                        ) : null}
                    </div>

                    {loading ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-editor/40">
                            <div className="h-8 w-40 animate-pulse rounded-lg bg-panel-hover/90" />
                        </div>
                    ) : null}

                    {!loading && filtered.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-text-muted">
                            No branches match.
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

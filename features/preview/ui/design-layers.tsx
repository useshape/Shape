"use client";

import React from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SidebarPanelHeaderFrame } from "@/features/panels/ui/sidebar-panel-header";
import type { DesignLayerNode } from "../design-mode/types";
import { findLayerPath, flattenLayers } from "../design-mode/tree";
import { getDesignBridge, useDesignModeStore } from "../design-mode/store";
import { DesignInspectPanel } from "./design-inspect-panel";

function layerIcon(tag: string): string {
    if (tag === "img" || tag === "svg") return "image";
    if (tag === "button" || tag === "a") return "link";
    if (tag === "p" || tag === "span" || tag === "h1" || tag === "h2" || tag === "h3") return "description";
    return "crop_square";
}

function LayerRow({
    node,
    depth,
    selectedId,
    expanded,
    onToggle,
    onSelect,
}: {
    node: DesignLayerNode;
    depth: number;
    selectedId: string | null;
    expanded: Set<string>;
    onToggle: (id: string) => void;
    onSelect: (id: string) => void;
}) {
    const hasKids = node.children.length > 0;
    const open = expanded.has(node.id);
    const active = selectedId === node.id;
    const rowRef = React.useRef<HTMLButtonElement>(null);

    React.useEffect(() => {
        if (!active || !rowRef.current) return;
        rowRef.current.scrollIntoView({ block: "nearest" });
    }, [active]);

    return (
        <div>
            <button
                ref={rowRef}
                type="button"
                onClick={() => onSelect(node.id)}
                className={cn(
                    "flex h-7 w-full items-center gap-1 rounded-md py-0.5 pr-2 text-left text-xs",
                    active ? "bg-accent-text-bg text-accent-text" : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                    node.hidden && "opacity-50",
                )}
                style={{ paddingLeft: 8 + depth * 12 }}
            >
                {hasKids ? (
                    <span
                        role="presentation"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggle(node.id);
                        }}
                        className="flex h-4 w-4 shrink-0 items-center justify-center"
                    >
                        <Icon name="chevron_right" size={12} className={cn("opacity-60 transition-transform", open && "rotate-90")} />
                    </span>
                ) : (
                    <span className="w-4 shrink-0" />
                )}
                <Icon name={layerIcon(node.tag)} size={12} className="shrink-0 text-text-muted" />
                <span className="min-w-0 truncate">{node.label}</span>
            </button>
            {hasKids && open
                ? node.children.map((child) => (
                      <LayerRow
                          key={child.id}
                          node={child}
                          depth={depth + 1}
                          selectedId={selectedId}
                          expanded={expanded}
                          onToggle={onToggle}
                          onSelect={onSelect}
                      />
                  ))
                : null}
        </div>
    );
}

function collectIds(nodes: DesignLayerNode[], into: Set<string>, depth = 0) {
    for (const n of nodes) {
        into.add(n.id);
        if (depth < 1) collectIds(n.children, into, depth + 1);
    }
}

function layerDepth(nodes: DesignLayerNode[], id: string, depth = 0): number | null {
    for (const n of nodes) {
        if (n.id === id) return depth;
        const child = layerDepth(n.children, id, depth + 1);
        if (child != null) return child;
    }
    return null;
}

export function DesignLayersPanel({
    onSelectId,
}: {
    onSelectId?: (id: string) => void;
}) {
    const { layers, selected } = useDesignModeStore();
    const roots = layers.length ? layers : [];
    const selectedId = selected?.id ?? null;
    const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
    const [tab, setTab] = React.useState<"layers" | "inspect">("layers");
    const [paused, setPaused] = React.useState(false);
    const [resumeAfterEdit, setResumeAfterEdit] = React.useState(true);
    const [pseudo, setPseudo] = React.useState<Record<string, boolean>>({});
    const [styleFilter, setStyleFilter] = React.useState("");
    const [layerQuery, setLayerQuery] = React.useState("");
    const [visibleOnly, setVisibleOnly] = React.useState(false);
    const [interactiveOnly, setInteractiveOnly] = React.useState(false);
    const [watching, setWatching] = React.useState(false);
    const [emulateFocus, setEmulateFocus] = React.useState(false);
    const treeRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        setExpanded((prev) => {
            const known = new Set<string>();
            const walk = (nodes: DesignLayerNode[]) => {
                for (const n of nodes) {
                    known.add(n.id);
                    walk(n.children);
                }
            };
            walk(layers);
            const next = new Set<string>();
            for (const id of prev) if (known.has(id)) next.add(id);
            if (next.size === 0) collectIds(layers, next);
            return next;
        });
    }, [layers]);

    React.useEffect(() => {
        if (!selectedId) return;
        const path = findLayerPath(layers, selectedId);
        if (!path) return;
        setExpanded((prev) => {
            let changed = false;
            const next = new Set(prev);
            for (const id of path.slice(0, -1)) {
                if (!next.has(id)) {
                    next.add(id);
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [selectedId, layers]);

    const onToggle = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const bridge = getDesignBridge();
    const togglePseudo = (name: string) => {
        const next = !pseudo[name];
        setPseudo((p) => ({ ...p, [name]: next }));
        if (selectedId) bridge?.pseudo?.(selectedId, name, next, selected?.selector);
    };

    const visible = flattenLayers(roots, expanded, {
        query: layerQuery,
        visibleOnly,
        interactiveOnly,
    });

    const onTreeKey = (e: React.KeyboardEvent) => {
        if (!visible.length) return;
        const idx = visible.findIndex((n) => n.id === selectedId);
        if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = visible[Math.min(visible.length - 1, Math.max(0, idx) + 1)];
            if (next) onSelectId?.(next.id);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const next = visible[Math.max(0, (idx < 0 ? 0 : idx) - 1)];
            if (next) onSelectId?.(next.id);
        } else if (e.key === "ArrowRight" && selectedId) {
            e.preventDefault();
            setExpanded((prev) => new Set(prev).add(selectedId));
        } else if (e.key === "ArrowLeft" && selectedId) {
            e.preventDefault();
            setExpanded((prev) => {
                const next = new Set(prev);
                next.delete(selectedId);
                return next;
            });
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
            <SidebarPanelHeaderFrame
                title={tab === "layers" ? "Layers" : "Inspect"}
                actions={
                    <button
                        type="button"
                        title={tab === "layers" ? "Inspect" : "Layers"}
                        className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-md",
                            tab === "inspect" ? "bg-panel-active text-text-primary" : "text-text-muted hover:bg-panel-hover hover:text-text-primary",
                        )}
                        onClick={() => setTab((t) => (t === "layers" ? "inspect" : "layers"))}
                    >
                        <Icon name="bug_report" size={14} />
                    </button>
                }
            />
            {tab === "layers" ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-2 py-1.5">
                        <Input
                            value={layerQuery}
                            onChange={(e) => setLayerQuery(e.target.value)}
                            placeholder="Search layers"
                            className="h-7 min-w-0 flex-1 text-xs"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className={cn(visibleOnly && "bg-panel-active")}
                            onClick={() => setVisibleOnly((v) => !v)}
                        >
                            Visible
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className={cn(interactiveOnly && "bg-panel-active")}
                            onClick={() => setInteractiveOnly((v) => !v)}
                        >
                            Interactive
                        </Button>
                    </div>
                    <div
                        ref={treeRef}
                        tabIndex={0}
                        onKeyDown={onTreeKey}
                        className="min-h-0 flex-1 overflow-y-auto px-1 py-1 custom-scrollbar outline-none"
                    >
                        {roots.length === 0 ? (
                            <p className="px-3 py-4 text-xs text-text-muted">
                                Click an element in the preview to inspect the page tree.
                            </p>
                        ) : layerQuery || visibleOnly || interactiveOnly ? (
                            visible.map((node) => (
                                <LayerRow
                                    key={node.id}
                                    node={{ ...node, children: [] }}
                                    depth={layerDepth(roots, node.id) ?? 0}
                                    selectedId={selectedId}
                                    expanded={expanded}
                                    onToggle={onToggle}
                                    onSelect={(id) => onSelectId?.(id)}
                                />
                            ))
                        ) : (
                            roots.map((node) => (
                                <LayerRow
                                    key={node.id}
                                    node={node}
                                    depth={0}
                                    selectedId={selectedId}
                                    expanded={expanded}
                                    onToggle={onToggle}
                                    onSelect={(id) => onSelectId?.(id)}
                                />
                            ))
                        )}
                    </div>
                </div>
            ) : (
                <DesignInspectPanel
                    styleFilter={styleFilter}
                    onStyleFilter={setStyleFilter}
                    paused={paused}
                    onPaused={(next) => {
                        setPaused(next);
                        bridge?.pause?.(next, resumeAfterEdit);
                    }}
                    resumeAfterEdit={resumeAfterEdit}
                    onResumeAfterEdit={setResumeAfterEdit}
                    pseudo={pseudo}
                    onPseudo={togglePseudo}
                    watching={watching}
                    onWatch={(next) => {
                        setWatching(next);
                        if (selectedId) bridge?.watch?.(selectedId, next, selected?.selector);
                    }}
                    emulateFocus={emulateFocus}
                    onEmulateFocus={(next) => {
                        setEmulateFocus(next);
                        bridge?.emulateFocus?.(next);
                    }}
                />
            )}
        </div>
    );
}

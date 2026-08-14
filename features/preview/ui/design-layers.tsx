"use client";

import React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { SidebarPanelHeaderFrame } from "@/features/panels/ui/sidebar-panel-header";
import { ToggleBtn } from "@/features/editor/ui/tailwind-controls/tw-control-shared";
import type { DesignLayerNode } from "../design-mode/types";
import { findLayerPath } from "../design-mode/tree";
import { getDesignBridge, useDesignModeStore } from "../design-mode/store";

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
                        <Icon
                            name="chevron_right"
                            size={12}
                            className={cn("opacity-60 transition-transform", open && "rotate-90")}
                        />
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
    const [pseudo, setPseudo] = React.useState<Record<string, boolean>>({});
    const [network, setNetwork] = React.useState<Array<{ method: string; url: string; status: number; ms: number }>>([]);

    React.useEffect(() => {
        const onNet = (e: Event) => {
            const d = (e as CustomEvent).detail;
            if (!d?.url) return;
            setNetwork((prev) => [{ method: d.method || "GET", url: d.url, status: d.status ?? 0, ms: d.ms ?? 0 }, ...prev].slice(0, 80));
        };
        window.addEventListener("shape-design-network", onNet as EventListener);
        return () => window.removeEventListener("shape-design-network", onNet as EventListener);
    }, []);

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

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
            <SidebarPanelHeaderFrame
                title={tab === "layers" ? "Layers" : "Inspect"}
                actions={
                    <button
                        type="button"
                        title={tab === "layers" ? "Inspect tools" : "Layers"}
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
                <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1 custom-scrollbar">
                    {roots.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-text-muted">
                            Click an element in the preview to inspect the page tree.
                        </p>
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
            ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex flex-col gap-2 border-b border-border-subtle px-3 py-3">
                        <div className="flex gap-1">
                            <ToggleBtn
                                label="Pause page"
                                active={paused}
                                onClick={() => {
                                    const next = !paused;
                                    setPaused(next);
                                    bridge?.pause?.(next);
                                }}
                            >
                                <Icon name={paused ? "play_arrow" : "pause"} size={14} />
                            </ToggleBtn>
                        </div>
                        <div className="flex gap-1">
                            {(["hover", "focus", "active"] as const).map((name) => (
                                <ToggleBtn
                                    key={name}
                                    label={`:${name}`}
                                    active={!!pseudo[name]}
                                    onClick={() => togglePseudo(name)}
                                >
                                    <span className="px-1 text-[10px]">:{name}</span>
                                </ToggleBtn>
                            ))}
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 custom-scrollbar">
                        <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">Network</p>
                        {network.length === 0 ? (
                            <p className="px-1 text-xs text-text-muted">Requests from the preview will show up here.</p>
                        ) : (
                            network.map((row, i) => (
                                <div key={`${row.url}-${i}`} className="flex items-start gap-2 rounded-md px-1 py-1 text-[11px]">
                                    <span className="w-8 shrink-0 tabular-nums text-text-muted">{row.status || "—"}</span>
                                    <span className="min-w-0 flex-1 truncate text-text-primary" title={row.url}>
                                        {row.url.replace(/^https?:\/\/[^/]+/, "") || row.url}
                                    </span>
                                    <span className="shrink-0 tabular-nums text-text-muted">{row.ms}ms</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

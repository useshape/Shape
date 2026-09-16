"use client";

import {
    RiArrowDownSLine,
    RiArrowRightSLine,
    RiBox3Line,
    RiCodeLine,
    RiEyeOffLine,
    RiFileLine,
    RiImageLine,
    RiSearchLine,
    RiText,
} from "@remixicon/react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll";
import { cn } from "@/lib/utils";
import type { DesignLayerSnapshot } from "./bridge";

type PanelTab = "layers" | "pages" | "assets";

function iconForLayer(layer: DesignLayerSnapshot) {
    if (/^(img|picture|video|svg|canvas)$/.test(layer.tag)) return RiImageLine;
    if (/^(h1|h2|h3|h4|h5|h6|p|span|label|a|button)$/.test(layer.tag)) return RiText;
    return RiBox3Line;
}

export function DesignLeftPanel({
    layers,
    selectedKey,
    onSelectLayer,
    pages,
    activePage,
    onPageChange,
    assets,
    projectRoot,
}: {
    layers: DesignLayerSnapshot[];
    selectedKey: string | null;
    onSelectLayer: (key: string) => void;
    pages: Array<{ path: string; label: string; source?: string }>;
    activePage: string;
    onPageChange: (path: string) => void;
    assets: Array<{ path: string; name: string; bytes: number; kind: "image" | "font" | "video" }>;
    projectRoot: string;
}) {
    const [tab, setTab] = useState<PanelTab>("layers");
    const [query, setQuery] = useState("");
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const visibleLayers = useMemo(() => {
        const hiddenParents = new Set<string>();
        return layers.filter((layer) => {
            if (layer.parentKey && hiddenParents.has(layer.parentKey)) {
                hiddenParents.add(layer.key);
                return false;
            }
            if (collapsed.has(layer.key)) hiddenParents.add(layer.key);
            if (!query.trim()) return true;
            return `${layer.label} ${layer.tag}`.toLowerCase().includes(query.toLowerCase());
        });
    }, [collapsed, layers, query]);
    const parentKeys = useMemo(() => new Set(layers.map((layer) => layer.parentKey).filter(Boolean)), [layers]);

    return (
        <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-panel">
            <div className="grid h-9 shrink-0 grid-cols-3 border-b border-border px-1">
                {(["layers", "pages", "assets"] as const).map((item) => (
                    <button
                        key={item}
                        type="button"
                        onClick={() => setTab(item)}
                        className={cn(
                            "relative text-xs capitalize text-text-muted transition-colors hover:text-text-primary",
                            tab === item && "text-text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-accent",
                        )}
                    >
                        {item}
                    </button>
                ))}
            </div>

            {tab === "layers" ? (
                <>
                    <div className="shrink-0 border-b border-border p-2">
                        <label className="relative flex h-6 items-center rounded-md bg-input-bg text-text-muted">
                            <span className="pointer-events-none absolute left-0 top-0 flex size-6 items-center justify-center">
                                <Icon icon={RiSearchLine} size={ICON_SIZE_SM} />
                            </span>
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Filter layers"
                                className="h-6 min-w-0 flex-1 bg-transparent pl-6 pr-2 text-xs leading-none text-text-primary outline-none placeholder:text-text-muted"
                            />
                        </label>
                    </div>
                    <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                        <div className="py-1">
                            {visibleLayers.map((layer) => {
                                const hasChildren = parentKeys.has(layer.key);
                                const isCollapsed = collapsed.has(layer.key);
                                const LayerIcon = iconForLayer(layer);
                                return (
                                    <button
                                        key={layer.key}
                                        type="button"
                                        onClick={() => onSelectLayer(layer.key)}
                                        className={cn(
                                            "flex h-6 w-full items-center gap-1 px-1.5 text-left text-xs text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                                            selectedKey === layer.key && "bg-panel-active text-text-primary",
                                        )}
                                        style={{ paddingLeft: 6 + Math.min(layer.depth, 12) * 12 }}
                                    >
                                        <span
                                            className="flex size-4 shrink-0 items-center justify-center"
                                            onClick={(event) => {
                                                if (!hasChildren) return;
                                                event.stopPropagation();
                                                setCollapsed((current) => {
                                                    const next = new Set(current);
                                                    if (next.has(layer.key)) next.delete(layer.key);
                                                    else next.add(layer.key);
                                                    return next;
                                                });
                                            }}
                                        >
                                            {hasChildren ? (
                                                <Icon
                                                    icon={isCollapsed ? RiArrowRightSLine : RiArrowDownSLine}
                                                    size={12}
                                                />
                                            ) : null}
                                        </span>
                                        <Icon icon={LayerIcon} size={ICON_SIZE_SM} className="text-text-muted" />
                                        <span className="min-w-0 flex-1 truncate">{layer.label}</span>
                                        {layer.hidden ? <Icon icon={RiEyeOffLine} size={12} /> : null}
                                    </button>
                                );
                            })}
                            {layers.length === 0 ? (
                                <p className="px-3 py-6 text-center text-xs leading-relaxed text-text-muted">
                                    Layers appear when the live page is ready.
                                </p>
                            ) : null}
                        </div>
                    </ScrollArea>
                </>
            ) : null}

            {tab === "pages" ? (
                <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                    <div className="p-1.5">
                        {pages.map((page) => (
                            <button
                                key={page.path}
                                type="button"
                                onClick={() => onPageChange(page.path)}
                                className={cn(
                                    "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                                    activePage === page.path && "bg-panel-active text-text-primary",
                                )}
                            >
                                <Icon icon={RiFileLine} size={ICON_SIZE_SM} className="text-text-muted" />
                                <span className="min-w-0 flex-1 truncate">{page.label}</span>
                                <span className="max-w-20 truncate text-2xs text-text-muted">{page.path}</span>
                            </button>
                        ))}
                    </div>
                </ScrollArea>
            ) : null}

            {tab === "assets" ? (
                <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                    <div className="grid grid-cols-2 gap-1.5 p-2">
                        {assets.map((asset) => (
                            <div
                                key={asset.path}
                                title={asset.path}
                                className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-2 text-left"
                            >
                                <span className="flex aspect-[4/3] w-full items-center justify-center bg-input-bg text-text-muted">
                                    {asset.kind === "image" ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={convertFileSrc(
                                                `${projectRoot.replace(/[/\\]+$/, "")}${projectRoot.includes("\\") ? "\\" : "/"}${asset.path}`,
                                            )}
                                            alt=""
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <Icon icon={RiFileLine} />
                                    )}
                                </span>
                                <span className="w-full truncate px-2 pt-1.5 text-xs text-text-secondary">
                                    {asset.name}
                                </span>
                                <span className="px-2 pb-1.5 text-2xs text-text-muted">
                                    {asset.bytes < 1024 * 1024
                                        ? `${Math.max(1, Math.round(asset.bytes / 1024))} KB`
                                        : `${(asset.bytes / 1024 / 1024).toFixed(1)} MB`}
                                </span>
                            </div>
                        ))}
                    </div>
                    {assets.length === 0 ? (
                        <p className="px-3 py-6 text-center text-xs leading-relaxed text-text-muted">
                            No image, font, or video assets found.
                        </p>
                    ) : null}
                </ScrollArea>
            ) : null}

            <div className="shrink-0 border-t border-border p-1.5">
                <div className="flex h-6 items-center gap-1.5 px-2 text-xs text-text-muted">
                    <Icon icon={RiCodeLine} size={ICON_SIZE_SM} />
                    Source-backed canvas
                </div>
            </div>
        </aside>
    );
}

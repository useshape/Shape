"use client";

import {
    RiArrowDownSLine,
    RiArrowRightSLine,
    RiBox3Line,
    RiBrushLine,
    RiCodeLine,
    RiColorFilterLine,
    RiEyeOffLine,
    RiFileLine,
    RiImageLine,
    RiLink,
    RiShapesLine,
    RiText,
} from "@remixicon/react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon, ICON_SIZE_MD, ICON_SIZE_SM } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll";
import { SearchInput } from "@/components/ui/search";
import { cn } from "@/lib/utils";
import type { DesignElementSnapshot, DesignLayerSnapshot } from "./bridge";
import { type ComponentOptionPatch } from "./panel/options";
import {
    componentFolder,
    groupThemeTokens,
    isEditableText,
    layerKind,
    layerTitle,
    libraryGroup,
    type ThemeToken,
} from "./library";

type PanelTab = "layers" | "pages" | "library";

function kindIcon(kind: ReturnType<typeof layerKind>) {
    if (kind === "text") return RiText;
    if (kind === "link") return RiLink;
    if (kind === "image") return RiImageLine;
    if (kind === "vector") return RiShapesLine;
    if (kind === "button") return RiBox3Line;
    return RiBox3Line;
}

function kindClass(kind: ReturnType<typeof layerKind>) {
    if (kind === "frame") return "text-accent";
    if (kind === "text") return "text-text-secondary";
    if (kind === "link" || kind === "button") return "text-accent";
    if (kind === "vector") return "text-success";
    if (kind === "image") return "text-warning";
    return "text-text-muted";
}

function Section({
    title,
    count,
    open,
    onToggle,
    children,
}: {
    title: string;
    count?: number;
    open: boolean;
    onToggle: () => void;
    children: ReactNode;
}) {
    return (
        <div className="border-b border-border">
            <button
                type="button"
                onClick={onToggle}
                className="flex h-8 w-full items-center gap-2 px-3 text-left text-sm font-medium text-text-primary"
            >
                <span className="min-w-0 flex-1">{title}</span>
                {count != null ? <span className="text-xs text-text-muted">{count}</span> : null}
                <Icon icon={open ? RiArrowDownSLine : RiArrowRightSLine} size={ICON_SIZE_MD} className="text-text-muted" />
            </button>
            {open ? <div className="pb-2">{children}</div> : null}
        </div>
    );
}

export function DesignLeftPanel({
    layers,
    selectedKey,
    onSelectLayer,
    onChangeText,
    pages,
    activePage,
    onPageChange,
    assets,
    themeTokens,
    onOpenPath,
    selectedElement: _selectedElement,
    onComponentPatch: _onComponentPatch,
    className,
}: {
    layers: DesignLayerSnapshot[];
    selectedKey: string | null;
    onSelectLayer: (key: string) => void;
    onChangeText?: (key: string, text: string) => void;
    pages: Array<{ path: string; label: string; source?: string }>;
    activePage: string;
    onPageChange: (path: string) => void;
    assets: Array<{ path: string; name: string; bytes: number; kind: string }>;
    themeTokens: ThemeToken[];
    onOpenPath?: (path: string) => void;
    selectedElement?: DesignElementSnapshot | null;
    onComponentPatch?: (patch: ComponentOptionPatch) => void;
    className?: string;
}) {
    const [tab, setTab] = useState<PanelTab>("layers");
    const [query, setQuery] = useState("");
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
        Templates: true,
        Components: true,
        Styles: true,
        Vectors: true,
        Code: false,
    });

    const visibleLayers = useMemo(() => {
        const hiddenParents = new Set<string>();
        return layers.filter((layer) => {
            if (layer.parentKey && hiddenParents.has(layer.parentKey)) {
                hiddenParents.add(layer.key);
                return false;
            }
            if (collapsed.has(layer.key)) hiddenParents.add(layer.key);
            const title = layerTitle(layer);
            if (!query.trim()) return true;
            return `${title} ${layer.tag} ${layer.text}`.toLowerCase().includes(query.toLowerCase());
        });
    }, [collapsed, layers, query]);
    const parentKeys = useMemo(() => new Set(layers.map((layer) => layer.parentKey).filter(Boolean)), [layers]);

    const tokens = useMemo(() => groupThemeTokens(themeTokens), [themeTokens]);
    const grouped = useMemo(() => {
        const components: typeof assets = [];
        const styles: typeof assets = [];
        const vectors: typeof assets = [];
        const code: typeof assets = [];
        for (const asset of assets) {
            const group = libraryGroup(asset.path, asset.kind);
            if (group === "components") components.push(asset);
            else if (group === "styles") styles.push(asset);
            else if (group === "vectors") vectors.push(asset);
            else if (group === "code") code.push(asset);
        }
        return { components, styles, vectors, code };
    }, [assets]);
    const componentFolders = useMemo(() => {
        const map = new Map<string, typeof assets>();
        for (const item of grouped.components) {
            const folder = componentFolder(item.path);
            const list = map.get(folder) ?? [];
            list.push(item);
            map.set(folder, list);
        }
        return [...map.entries()];
    }, [grouped.components]);

    const filtered = (path: string, name: string) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return path.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    };

    return (
        <aside className={cn("relative flex h-full w-full min-w-0 flex-col border-r border-border bg-surface-3", className)}>
            <div className="grid h-9 shrink-0 grid-cols-3 pt-1">
                {(["layers", "pages", "library"] as const).map((item) => (
                    <Button
                        key={item}
                        variant="ghost"
                        size="sm"
                        onClick={() => setTab(item)}
                        className={cn(
                            "relative text-sm capitalize text-text-muted transition-colors hover:bg-transparent hover:text-text-primary",
                            tab === item && "text-text-primary",
                        )}
                    >
                        {item}
                    </Button>
                ))}
            </div>

            {tab !== "pages" ? (
                <div className="shrink-0 px-2 pb-2">
                    <SearchInput
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={tab === "layers" ? "Filter layers" : "Search"}
                    />
                </div>
            ) : null}

            {tab === "layers" ? (
                <ScrollArea className="min-h-0 flex-1" fadeFrom="from-surface-3">
                    <div className="py-1">
                        {visibleLayers.map((layer) => {
                            const hasChildren = parentKeys.has(layer.key);
                            const isCollapsed = collapsed.has(layer.key);
                            const kind = layerKind(layer);
                            const title = layerTitle(layer);
                            const selected = selectedKey === layer.key;
                            const editing = selected && isEditableText(layer) && onChangeText;
                            const KindIcon = kindIcon(kind);
                            return (
                                <div
                                    key={layer.key}
                                    className={cn(
                                        "flex h-8 w-full items-center gap-1.5 px-1.5 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                                        selected && "bg-panel-active text-text-primary",
                                    )}
                                    style={{ paddingLeft: 9 + Math.min(layer.depth, 12) * 12 }}
                                >
                                    <span
                                        className="flex size-4 shrink-0 items-center justify-center"
                                        onClick={() => {
                                            if (!hasChildren) return;
                                            setCollapsed((current) => {
                                                const next = new Set(current);
                                                if (next.has(layer.key)) next.delete(layer.key);
                                                else next.add(layer.key);
                                                return next;
                                            });
                                        }}
                                    >
                                        {hasChildren ? (
                                            <Icon icon={isCollapsed ? RiArrowRightSLine : RiArrowDownSLine} size={ICON_SIZE_SM} />
                                        ) : null}
                                    </span>
                                    <Icon
                                        icon={KindIcon}
                                        size={ICON_SIZE_SM}
                                        className={layer.variable ? "text-violet-400" : kindClass(kind)}
                                    />
                                    {editing ? (
                                        <input
                                            value={drafts[layer.key] ?? layer.text}
                                            onChange={(event) =>
                                                setDrafts((current) => ({ ...current, [layer.key]: event.target.value }))
                                            }
                                            onBlur={() => {
                                                const next = drafts[layer.key];
                                                if (next != null && next !== layer.text) onChangeText?.(layer.key, next);
                                            }}
                                            className="h-5 min-w-0 flex-1 squircle-xl bg-input-bg px-1 text-sm text-text-primary outline-none"
                                            onClick={(event) => event.stopPropagation()}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") event.currentTarget.blur();
                                            }}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => onSelectLayer(layer.key)}
                                            className="min-w-0 flex-1 truncate text-left"
                                        >
                                            {title}
                                        </button>
                                    )}
                                    {layer.hidden ? <Icon icon={RiEyeOffLine} size={12} /> : null}
                                </div>
                            );
                        })}
                        {layers.length === 0 ? (
                            <p className="px-3 py-6 text-center text-sm leading-relaxed text-text-muted">
                                Layers appear when the live page is ready.
                            </p>
                        ) : null}
                    </div>
                </ScrollArea>
            ) : null}

            {tab === "pages" ? (
                <ScrollArea className="min-h-0 flex-1" fadeFrom="from-surface-3">
                    <div className="p-1.5">
                        {pages.map((page) => (
                            <button
                                key={page.path}
                                type="button"
                                onClick={() => onPageChange(page.path)}
                                className={cn(
                                    "flex min-h-8 w-full items-center gap-2 squircle-xl px-2 text-left text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary",
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

            {tab === "library" ? (
                <ScrollArea className="min-h-0 flex-1" fadeFrom="from-surface-3">
                    <Section
                        title="Templates"
                        count={pages.length}
                        open={openGroups.Templates}
                        onToggle={() => setOpenGroups((c) => ({ ...c, Templates: !c.Templates }))}
                    >
                        {pages.filter((page) => filtered(page.path, page.label)).map((page) => (
                            <button
                                key={page.path}
                                type="button"
                                onClick={() => onPageChange(page.path)}
                                className="flex h-8 w-full items-center gap-2 px-3 text-left text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                            >
                                <Icon icon={RiFileLine} size={ICON_SIZE_SM} className="text-accent" />
                                <span className="min-w-0 flex-1 truncate">{page.label}</span>
                            </button>
                        ))}
                    </Section>
                    <Section
                        title="Components"
                        count={grouped.components.length}
                        open={openGroups.Components}
                        onToggle={() => setOpenGroups((c) => ({ ...c, Components: !c.Components }))}
                    >
                        {componentFolders.map(([folder, items]) => (
                            <div key={folder}>
                                <p className="px-3 py-1 text-xs font-medium text-text-muted">{folder}</p>
                                {items.filter((item) => filtered(item.path, item.name)).map((item) => (
                                    <button
                                        key={item.path}
                                        type="button"
                                        onClick={() => onOpenPath?.(item.path)}
                                        className="flex h-7 w-full items-center gap-2 px-3 text-left text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                                    >
                                        <Icon icon={RiBox3Line} size={ICON_SIZE_SM} className="text-accent" />
                                        <span className="min-w-0 flex-1 truncate">{item.name.replace(/\.(tsx|jsx)$/i, "")}</span>
                                    </button>
                                ))}
                            </div>
                        ))}
                    </Section>
                    <Section
                        title="Styles"
                        open={openGroups.Styles}
                        onToggle={() => setOpenGroups((c) => ({ ...c, Styles: !c.Styles }))}
                    >
                        {[
                            ["Text", tokens.text, RiText],
                            ["Link", tokens.link, RiLink],
                            ["Color", tokens.color, RiColorFilterLine],
                        ].map(([label, list, icon]) => (
                            <div key={String(label)}>
                                <p className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-text-muted">
                                    <Icon icon={icon as typeof RiText} size={ICON_SIZE_SM} />
                                    {String(label)}
                                </p>
                                {(list as ThemeToken[]).slice(0, 24).filter((token) => filtered(token.name, token.value)).map((token) => (
                                    <div
                                        key={token.name}
                                        className="flex h-8 items-center gap-2 px-3 text-sm text-text-secondary"
                                        title={`${token.name}: ${token.value}`}
                                    >
                                        {String(label) === "Color" ? (
                                            <span
                                                className="size-3 shrink-0 squircle-sm border border-border"
                                                style={{ background: token.value }}
                                            />
                                        ) : (
                                            <Icon icon={RiBrushLine} size={ICON_SIZE_SM} className="text-text-muted" />
                                        )}
                                        <span className="min-w-0 flex-1 truncate">{token.name}</span>
                                    </div>
                                ))}
                                {grouped.styles.filter((item) => filtered(item.path, item.name)).map((item) => (
                                    <button
                                        key={item.path}
                                        type="button"
                                        onClick={() => onOpenPath?.(item.path)}
                                        className="flex h-7 w-full items-center gap-2 px-3 text-left text-sm text-text-secondary hover:bg-panel-hover"
                                    >
                                        <Icon icon={RiFileLine} size={ICON_SIZE_SM} />
                                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                                    </button>
                                ))}
                            </div>
                        ))}
                    </Section>
                    <Section
                        title="Vectors"
                        count={grouped.vectors.length}
                        open={openGroups.Vectors}
                        onToggle={() => setOpenGroups((c) => ({ ...c, Vectors: !c.Vectors }))}
                    >
                        {grouped.vectors.filter((item) => filtered(item.path, item.name)).map((item) => (
                            <button
                                key={item.path}
                                type="button"
                                onClick={() => onOpenPath?.(item.path)}
                                className="flex h-7 w-full items-center gap-2 px-3 text-left text-sm text-text-secondary hover:bg-panel-hover"
                            >
                                <Icon icon={RiShapesLine} size={ICON_SIZE_SM} className="text-success" />
                                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            </button>
                        ))}
                    </Section>
                    <Section
                        title="Code"
                        count={grouped.code.length}
                        open={openGroups.Code}
                        onToggle={() => setOpenGroups((c) => ({ ...c, Code: !c.Code }))}
                    >
                        {grouped.code.filter((item) => filtered(item.path, item.name)).slice(0, 80).map((item) => (
                            <button
                                key={item.path}
                                type="button"
                                onClick={() => onOpenPath?.(item.path)}
                                className="flex h-7 w-full items-center gap-2 px-3 text-left text-sm text-text-secondary hover:bg-panel-hover"
                            >
                                <Icon icon={RiCodeLine} size={ICON_SIZE_SM} className="text-text-muted" />
                                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            </button>
                        ))}
                    </Section>
                </ScrollArea>
            ) : null}
        </aside>
    );
}

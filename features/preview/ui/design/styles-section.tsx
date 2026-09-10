"use client";

import { RiAddLine, RiArrowDownSLine, RiArrowRightSLine } from "@remixicon/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Checkmark } from "@/components/ui/checkmark";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll";
import { commands, useProjectState } from "@/lib/backend";
import { parseCssVariables, setCachedGlobalsCssContent } from "@/lib/css-variables";
import {
    invalidateGlobalsCssCache,
    resolveGlobalsCss,
} from "@/lib/css-variables-loader";
import {
    cssHasThemeDirective,
    insertCustomProperty,
    patchCustomProperty,
} from "@/features/preview/design-mode/apply/patch-css";
import { getDesignBridge } from "@/features/preview/design-mode/store";
import { cssColorToHex, isTransparentColor } from "@/features/preview/design-mode/css";
import { FlyoutCard } from "./fields";
import {
    colorStylesFromVariables,
    groupByGroupKey,
    slugToCssVarName,
    textStylesFromVariables,
    type DesignColorStyle,
    type DesignTextStyle,
} from "./styles-model";

type StylesSectionProps = {
    onApplyColorVar?: (cssVar: string) => void;
    onApplyTextStyle?: (style: DesignTextStyle) => void;
};

export function DesignStylesSection({ onApplyColorVar, onApplyTextStyle }: StylesSectionProps) {
    const { project_path } = useProjectState();
    const [open, setOpen] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cssPath, setCssPath] = useState<string | null>(null);
    const [cssContent, setCssContent] = useState("");
    const [createKind, setCreateKind] = useState<"menu" | "color" | "text" | null>(null);
    const [createAnchor, setCreateAnchor] = useState<DOMRect | null>(null);
    const addRef = useRef<HTMLButtonElement>(null);
    const [expandedText, setExpandedText] = useState<Set<string>>(() => new Set());
    const [expandedColor, setExpandedColor] = useState<Set<string>>(() => new Set());

    const reload = useCallback(async () => {
        if (!project_path) {
            setCssContent("");
            setCssPath(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { content, path } = await resolveGlobalsCss(project_path);
            setCssContent(content);
            setCssPath(path);
            if (!content.trim()) {
                setError("No globals.css (or theme CSS) with variables found.");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load styles.");
            setCssContent("");
            setCssPath(null);
        } finally {
            setLoading(false);
        }
    }, [project_path]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const variables = useMemo(() => parseCssVariables(cssContent), [cssContent]);
    const colors = useMemo(() => colorStylesFromVariables(variables), [variables]);
    const texts = useMemo(() => textStylesFromVariables(variables), [variables]);
    const colorGroups = useMemo(() => groupByGroupKey(colors), [colors]);
    const textGroups = useMemo(() => groupByGroupKey(texts), [texts]);
    const hasTheme = useMemo(() => cssHasThemeDirective(cssContent), [cssContent]);

    const liveSetVar = useCallback((name: string, value: string) => {
        getDesignBridge()?.setCssVar?.(name, value);
    }, []);

    const persistCss = useCallback(
        async (next: string) => {
            if (!cssPath) throw new Error("No token stylesheet path.");
            await commands.saveFile(cssPath, next);
            setCachedGlobalsCssContent(next);
            setCssContent(next);
            invalidateGlobalsCssCache();
            setCachedGlobalsCssContent(next);
        },
        [cssPath],
    );

    const updateToken = useCallback(
        async (name: string, value: string) => {
            liveSetVar(name, value);
            const patched = patchCustomProperty(cssContent, name, value);
            if ("error" in patched) {
                const { notify } = await import("@/features/notifications");
                notify.error("Styles", patched.error);
                return;
            }
            try {
                await persistCss(patched.css);
            } catch (e) {
                const { notify } = await import("@/features/notifications");
                notify.error("Styles", e instanceof Error ? e.message : "Could not save token.");
            }
        },
        [cssContent, liveSetVar, persistCss],
    );

    const closeCreate = useCallback(() => {
        setCreateKind(null);
        setCreateAnchor(null);
    }, []);

    const createToken = useCallback(
        async (opts: {
            name: string;
            value: string;
            description?: string;
            createUtilities: boolean;
        }) => {
            if (!cssPath) {
                const { notify } = await import("@/features/notifications");
                notify.error("Styles", "No token stylesheet found in this project.");
                return;
            }
            const cssVar = slugToCssVarName(opts.name, "color");
            const into = opts.createUtilities && hasTheme ? "theme" : "root";
            const inserted = insertCustomProperty(cssContent || ":root {\n}\n", cssVar, opts.value, {
                into,
                comment: opts.description,
            });
            if ("error" in inserted) {
                const { notify } = await import("@/features/notifications");
                notify.error("Styles", inserted.error);
                return;
            }
            try {
                await persistCss(inserted.css);
                liveSetVar(cssVar, opts.value);
                closeCreate();
                const { notify } = await import("@/features/notifications");
                notify.success("Styles", `Created ${cssVar}`);
            } catch (e) {
                const { notify } = await import("@/features/notifications");
                notify.error("Styles", e instanceof Error ? e.message : "Could not create style.");
            }
        },
        [closeCreate, cssContent, cssPath, hasTheme, liveSetVar, persistCss],
    );

    const createTextStyle = useCallback(
        async (opts: {
            name: string;
            fontSize: string;
            lineHeight?: string;
            fontWeight?: string;
            description?: string;
            createUtilities: boolean;
        }) => {
            if (!cssPath) {
                const { notify } = await import("@/features/notifications");
                notify.error("Styles", "No token stylesheet found in this project.");
                return;
            }
            const into = opts.createUtilities && hasTheme ? "theme" : "root";
            const sizeVar = slugToCssVarName(opts.name, "text");
            const bare = sizeVar.replace(/^--font-size-/, "").replace(/^--/, "");
            let css = cssContent || ":root {\n}\n";
            const sizeIns = insertCustomProperty(css, sizeVar, opts.fontSize.trim(), {
                into,
                comment: opts.description,
            });
            if ("error" in sizeIns) {
                const { notify } = await import("@/features/notifications");
                notify.error("Styles", sizeIns.error);
                return;
            }
            css = sizeIns.css;
            liveSetVar(sizeVar, opts.fontSize.trim());

            if (opts.lineHeight?.trim()) {
                const lhVar = `--line-height-${bare}`;
                const lhIns = insertCustomProperty(css, lhVar, opts.lineHeight.trim(), { into });
                if (!("error" in lhIns)) {
                    css = lhIns.css;
                    liveSetVar(lhVar, opts.lineHeight.trim());
                }
            }
            if (opts.fontWeight?.trim()) {
                const wVar = `--font-weight-${bare}`;
                const wIns = insertCustomProperty(css, wVar, opts.fontWeight.trim(), { into });
                if (!("error" in wIns)) {
                    css = wIns.css;
                    liveSetVar(wVar, opts.fontWeight.trim());
                }
            }

            try {
                await persistCss(css);
                closeCreate();
                const { notify } = await import("@/features/notifications");
                notify.success("Styles", `Created text style ${sizeVar}`);
            } catch (e) {
                const { notify } = await import("@/features/notifications");
                notify.error("Styles", e instanceof Error ? e.message : "Could not create text style.");
            }
        },
        [closeCreate, cssContent, cssPath, hasTheme, liveSetVar, persistCss],
    );

    const toggleGroup = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
        const next = new Set(set);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setter(next);
    };

    return (
        <div className="flex min-h-0 flex-col border-t border-border-subtle">
            <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3">
                <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium text-text-primary"
                    onClick={() => setOpen((v) => !v)}
                >
                    <Icon
                        icon={open ? RiArrowDownSLine : RiArrowRightSLine}
                        className="shrink-0 text-text-muted"
                    />
                    Styles
                </button>
                <Button
                    ref={addRef}
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Create style"
                    className="size-7 text-text-muted hover:text-text-primary"
                    onClick={(e) => {
                        setCreateAnchor(e.currentTarget.getBoundingClientRect());
                        setCreateKind((v) => (v ? null : "menu"));
                    }}
                >
                    <Icon icon={RiAddLine} />
                </Button>
            </div>

            {open ? (
                <ScrollArea className="max-h-72 min-h-0" fadeFrom="from-panel">
                    <div className="pb-2">
                        {loading ? (
                            <p className="px-3 py-3 text-sm text-text-muted">Loading styles…</p>
                        ) : error ? (
                            <p className="px-3 py-3 text-sm leading-relaxed text-text-muted">{error}</p>
                        ) : (
                            <>
                                <CollapsibleSection title="Text styles" defaultOpen storageKey="design-styles-text">
                                    {textGroups.length === 0 ? (
                                        <p className="px-3 py-2 text-sm text-text-muted">
                                            No typography tokens found. Use + to create a text style.
                                        </p>
                                    ) : (
                                        textGroups.map(({ group, items }) => (
                                            <StyleGroup
                                                key={group}
                                                label={group}
                                                expanded={expandedText.has(group)}
                                                onToggle={() =>
                                                    toggleGroup(expandedText, group, setExpandedText)
                                                }
                                            >
                                                {items.map((style) => (
                                                    <button
                                                        key={style.id}
                                                        type="button"
                                                        className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-panel-hover"
                                                        onClick={() => onApplyTextStyle?.(style)}
                                                        title={style.id}
                                                    >
                                                        <span className="truncate text-sm text-text-primary">
                                                            {style.name}
                                                        </span>
                                                        <span className="truncate text-xs text-text-muted">
                                                            {style.subtitle}
                                                        </span>
                                                    </button>
                                                ))}
                                            </StyleGroup>
                                        ))
                                    )}
                                </CollapsibleSection>

                                <CollapsibleSection title="Color tokens" defaultOpen storageKey="design-styles-color">
                                    {colorGroups.length === 0 ? (
                                        <p className="px-3 py-2 text-sm text-text-muted">
                                            No color tokens found.
                                        </p>
                                    ) : (
                                        colorGroups.map(({ group, items }) => (
                                            <StyleGroup
                                                key={group}
                                                label={group}
                                                expanded={expandedColor.has(group)}
                                                onToggle={() =>
                                                    toggleGroup(expandedColor, group, setExpandedColor)
                                                }
                                            >
                                                {items.map((style) => (
                                                    <ColorStyleRow
                                                        key={style.id}
                                                        style={style}
                                                        onPick={() => onApplyColorVar?.(style.cssVar)}
                                                        onCommitValue={(v) => void updateToken(style.cssVar, v)}
                                                    />
                                                ))}
                                            </StyleGroup>
                                        ))
                                    )}
                                </CollapsibleSection>
                            </>
                        )}
                    </div>
                </ScrollArea>
            ) : null}

            {createKind && createAnchor ? (
                createKind === "menu" ? (
                    <FlyoutCard
                        title="Create"
                        anchor={createAnchor}
                        trigger={addRef.current}
                        onClose={closeCreate}
                        className="w-64"
                    >
                        <p className="px-0.5 text-xs text-text-muted">
                            Color tokens are single CSS variables. Text styles are composite type
                            recipes (size, line height, weight) — closer to Figma text styles.
                        </p>
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-9 w-full justify-start rounded-md px-2 font-normal text-sm"
                            onClick={() => setCreateKind("color")}
                        >
                            Color token
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-9 w-full justify-start rounded-md px-2 font-normal text-sm"
                            onClick={() => setCreateKind("text")}
                        >
                            Text style
                        </Button>
                    </FlyoutCard>
                ) : createKind === "color" ? (
                    <CreateColorStyleFlyout
                        hasTheme={hasTheme}
                        anchor={createAnchor}
                        trigger={addRef.current}
                        onClose={closeCreate}
                        onBack={() => setCreateKind("menu")}
                        onCreate={(opts) => void createToken(opts)}
                    />
                ) : (
                    <CreateTextStyleFlyout
                        hasTheme={hasTheme}
                        anchor={createAnchor}
                        trigger={addRef.current}
                        onClose={closeCreate}
                        onBack={() => setCreateKind("menu")}
                        onCreate={(opts) => void createTextStyle(opts)}
                    />
                )
            ) : null}
        </div>
    );
}

function StyleGroup({
    label,
    expanded,
    onToggle,
    children,
}: {
    label: string;
    expanded: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="px-1">
            <button
                type="button"
                className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                onClick={onToggle}
            >
                <Icon
                    icon={expanded ? RiArrowDownSLine : RiArrowRightSLine}
                    className="shrink-0 text-text-muted"
                />
                <span className="truncate">{label}</span>
            </button>
            {expanded ? <div className="pb-1 pl-2">{children}</div> : null}
        </div>
    );
}

function ColorStyleRow({
    style,
    onPick,
    onCommitValue,
}: {
    style: DesignColorStyle;
    onPick: () => void;
    onCommitValue: (value: string) => void;
}) {
    const [draft, setDraft] = useState(style.value);
    useEffect(() => setDraft(style.value), [style.value]);
    const hex = !isTransparentColor(style.value) ? cssColorToHex(style.value) : "";
    return (
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-panel-hover">
            <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={onPick}
                title={`Apply ${style.cssVar}`}
            >
                <span
                    className="size-3.5 shrink-0 rounded-md border border-border-subtle"
                    style={
                        hex
                            ? { backgroundColor: hex }
                            : {
                                  backgroundImage:
                                      "repeating-conic-gradient(rgba(255,255,255,0.18) 0% 25%, transparent 0% 50%)",
                                  backgroundSize: "8px 8px",
                              }
                    }
                />
                <span className="min-w-0 truncate text-sm text-text-primary">{style.name}</span>
            </button>
            <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                    if (draft.trim() && draft.trim() !== style.value) onCommitValue(draft.trim());
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="h-8 w-24 shrink-0 rounded-md px-1.5 text-xs tabular-nums"
                aria-label={`${style.name} value`}
            />
        </div>
    );
}

function CreateColorStyleFlyout({
    hasTheme,
    anchor,
    trigger,
    onClose,
    onBack,
    onCreate,
}: {
    hasTheme: boolean;
    anchor: DOMRect;
    trigger?: EventTarget | null;
    onClose: () => void;
    onBack?: () => void;
    onCreate: (opts: {
        name: string;
        value: string;
        description?: string;
        createUtilities: boolean;
    }) => void;
}) {
    const [name, setName] = useState("New color token");
    const [description, setDescription] = useState("");
    const [hex, setHex] = useState("D9D9D9");
    const [opacity, setOpacity] = useState(100);
    const [createUtilities, setCreateUtilities] = useState(false);

    const preview = useMemo(() => {
        const cleaned = hex.replace(/[^0-9a-fA-F]/g, "").slice(0, 8);
        if (cleaned.length !== 3 && cleaned.length !== 6 && cleaned.length !== 8) return "#D9D9D9";
        const full =
            cleaned.length === 3
                ? cleaned.split("").map((c) => c + c).join("")
                : cleaned.slice(0, 6);
        const a = Math.max(0, Math.min(100, opacity)) / 100;
        if (a >= 1) return `#${full}`;
        const aa = Math.round(a * 255).toString(16).padStart(2, "0");
        return `#${full}${aa}`;
    }, [hex, opacity]);

    return (
        <FlyoutCard
            title="Create color token"
            anchor={anchor}
            trigger={trigger}
            onClose={onClose}
            className="w-80"
        >
            {onBack ? (
                <Button type="button" variant="ghost" size="sm" className="h-7 self-start px-1.5" onClick={onBack}>
                    ← Back
                </Button>
            ) : null}
            <div
                className="h-16 rounded-lg border border-border-subtle"
                style={{ backgroundColor: preview }}
            />
            <label className="block space-y-1">
                <span className="text-xs text-text-muted">Name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
            </label>
            <label className="block space-y-1">
                <span className="text-xs text-text-muted">Description</span>
                <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's it for?"
                    className="h-8"
                />
            </label>
            <div>
                <div className="mb-1.5 text-xs text-text-muted">Properties</div>
                <div className="flex items-center gap-2">
                    <span
                        className="size-8 shrink-0 rounded-lg border border-border-subtle"
                        style={{ backgroundColor: preview }}
                    />
                    <Input
                        value={hex}
                        onChange={(e) => setHex(e.target.value.toUpperCase())}
                        className="h-8 flex-1 tabular-nums"
                        aria-label="Hex"
                    />
                    <div className="flex w-20 items-center gap-1">
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            value={opacity}
                            onChange={(e) => setOpacity(Number(e.target.value) || 0)}
                            className="h-8 tabular-nums"
                            aria-label="Opacity"
                        />
                        <span className="text-xs text-text-muted">%</span>
                    </div>
                </div>
            </div>
            {hasTheme ? (
                <label className="flex items-center gap-2 text-sm text-text-muted">
                    <Checkmark
                        checked={createUtilities}
                        onCheckedChange={(v) => setCreateUtilities(v === true)}
                    />
                    <span>Create Tailwind utilities</span>
                </label>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                        onCreate({
                            name,
                            value: preview,
                            description: description.trim() || undefined,
                            createUtilities,
                        })
                    }
                >
                    Create
                </Button>
            </div>
        </FlyoutCard>
    );
}

function CreateTextStyleFlyout({
    hasTheme,
    anchor,
    trigger,
    onClose,
    onBack,
    onCreate,
}: {
    hasTheme: boolean;
    anchor: DOMRect;
    trigger?: EventTarget | null;
    onClose: () => void;
    onBack?: () => void;
    onCreate: (opts: {
        name: string;
        fontSize: string;
        lineHeight?: string;
        fontWeight?: string;
        description?: string;
        createUtilities: boolean;
    }) => void;
}) {
    const [name, setName] = useState("Heading");
    const [description, setDescription] = useState("");
    const [fontSize, setFontSize] = useState("16px");
    const [lineHeight, setLineHeight] = useState("24px");
    const [fontWeight, setFontWeight] = useState("400");
    const [createUtilities, setCreateUtilities] = useState(false);

    return (
        <FlyoutCard
            title="Create text style"
            anchor={anchor}
            trigger={trigger}
            onClose={onClose}
            className="w-80"
        >
            {onBack ? (
                <Button type="button" variant="ghost" size="sm" className="h-7 self-start px-1.5" onClick={onBack}>
                    ← Back
                </Button>
            ) : null}
            <p className="text-xs text-text-muted">
                Writes paired CSS variables (font-size, line-height, font-weight) — like a Figma text
                style, backed by tokens.
            </p>
            <label className="block space-y-1">
                <span className="text-xs text-text-muted">Name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
            </label>
            <label className="block space-y-1">
                <span className="text-xs text-text-muted">Description</span>
                <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's it for?"
                    className="h-8"
                />
            </label>
            <div className="grid grid-cols-3 gap-2">
                <label className="block space-y-1">
                    <span className="text-xs text-text-muted">Size</span>
                    <Input value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="h-8" />
                </label>
                <label className="block space-y-1">
                    <span className="text-xs text-text-muted">Line</span>
                    <Input value={lineHeight} onChange={(e) => setLineHeight(e.target.value)} className="h-8" />
                </label>
                <label className="block space-y-1">
                    <span className="text-xs text-text-muted">Weight</span>
                    <Input value={fontWeight} onChange={(e) => setFontWeight(e.target.value)} className="h-8" />
                </label>
            </div>
            {hasTheme ? (
                <label className="flex items-center gap-2 text-sm text-text-muted">
                    <Checkmark
                        checked={createUtilities}
                        onCheckedChange={(v) => setCreateUtilities(v === true)}
                    />
                    <span>Create Tailwind utilities</span>
                </label>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                        onCreate({
                            name,
                            fontSize,
                            lineHeight: lineHeight.trim() || undefined,
                            fontWeight: fontWeight.trim() || undefined,
                            description: description.trim() || undefined,
                            createUtilities,
                        })
                    }
                >
                    Create
                </Button>
            </div>
        </FlyoutCard>
    );
}

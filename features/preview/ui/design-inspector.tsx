"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";
import { SidebarPanelHeaderFrame } from "@/features/panels/ui/sidebar-panel-header";
import { PxInput, ToggleBtn } from "@/features/editor/ui/tailwind-controls/tw-control-shared";
import { useProjectState } from "@/lib/backend";
import { applyEditsToProject } from "../design-mode/apply-to-source";
import {
    clearDesignPending,
    upsertDesignPending,
    useDesignModeStore,
    getDesignModeState,
} from "../design-mode/store";
import {
    clearHistory,
    historyRedo,
    historyUndo,
    recordChange,
    setHistoryPending,
} from "../design-mode/history";
import type { DesignComputedStyles } from "../design-mode/types";
import {
    firstFontFamily,
    isFlexDisplay,
    isGridDisplay,
    isTransparentColor,
    normalizeAlign,
    normalizeJustify,
    normalizeTextAlign,
    normalizeWeight,
    opacityPercent,
    parsePx,
    px,
} from "../design-mode/css";
import {
    AddHeader,
    AlignMatrix,
    ColorRow,
    CompactSelect,
    EffectsSection,
    effectsToStyles,
    Glyph,
    IconBtn,
    MicroLabel,
    PadXY,
    Section,
    SelectionColors,
    type DesignEffect,
} from "./design-inspector-fields";

type Bridge = {
    style: (id: string, styles: Record<string, string>, selector?: string) => void;
    content: (id: string, text: string, selector?: string) => void;
    undo: () => void;
    redo: () => void;
    reset: () => void;
};

const FONT_OPTIONS = [
    { value: "Inter, ui-sans-serif, system-ui, sans-serif", label: "Inter" },
    { value: "system-ui, sans-serif", label: "System Sans-Serif" },
    { value: "Georgia, ui-serif, serif", label: "Georgia" },
    { value: "ui-serif, Times New Roman, serif", label: "Serif" },
    { value: "ui-monospace, SFMono-Regular, Menlo, monospace", label: "Mono" },
    { value: '"IBM Plex Mono", ui-monospace, monospace', label: "IBM Plex Mono" },
];

const WEIGHT_OPTIONS = [
    { value: "100", label: "Thin" },
    { value: "200", label: "Extra Light" },
    { value: "300", label: "Light" },
    { value: "400", label: "Regular" },
    { value: "500", label: "Medium" },
    { value: "600", label: "Semibold" },
    { value: "700", label: "Bold" },
    { value: "800", label: "Extra Bold" },
    { value: "900", label: "Black" },
];

function TextAlignLeft() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M2 3h10M2 7h7M2 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
    );
}
function TextAlignCenter() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M2 3h10M3.5 7h7M2 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
    );
}
function TextAlignRight() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M2 3h10M5 7h7M2 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
    );
}
function TextAlignJustify() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M2 3h10M2 7h10M2 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
    );
}

function fontSelectValue(family: string): string {
    const first = firstFontFamily(family).toLowerCase();
    const match = FONT_OPTIONS.find((o) => firstFontFamily(o.value).toLowerCase() === first);
    return match?.value ?? family;
}

export function DesignInspectorPanel({ bridge }: { bridge: Bridge | null }) {
    const { selected, pending } = useDesignModeStore();
    const { project_path } = useProjectState();
    const [padIndependent, setPadIndependent] = React.useState(false);
    const [fillHidden, setFillHidden] = React.useState(false);
    const [lockRatio, setLockRatio] = React.useState(false);
    const [scope, setScope] = React.useState<"element" | "component">("element");
    const [effects, setEffects] = React.useState<DesignEffect[]>([]);
    const [applyError, setApplyError] = React.useState<string | null>(null);
    const [applying, setApplying] = React.useState(false);

    React.useEffect(() => {
        setFillHidden(false);
        setPadIndependent(false);
        setEffects([]);
        setApplyError(null);
    }, [selected?.id]);

    const patch = (styles: Partial<DesignComputedStyles>, text?: string, silent = false) => {
        if (!selected || !bridge) return;
        const clean = Object.fromEntries(
            Object.entries(styles).filter(([, v]) => v != null),
        ) as Record<string, string>;
        if (!silent) {
            const before: Record<string, string> = {};
            for (const key of Object.keys(clean) as (keyof DesignComputedStyles)[]) {
                before[key] = String(selected.styles[key] ?? "");
            }
            recordChange({
                id: selected.id,
                selector: selected.selector,
                label: selected.label,
                before,
                after: clean,
                textBefore: text != null ? selected.text : undefined,
                textAfter: text,
            });
        }
        if (Object.keys(clean).length) bridge.style(selected.id, clean, selected.selector);
        if (text != null) bridge.content(selected.id, text, selected.selector);
        upsertDesignPending({
            id: selected.id,
            tag: selected.tag,
            selector: selected.selector,
            className: selected.className,
            source: selected.source,
            label: selected.label,
            styles,
            text,
        });
        setHistoryPending(
            getDesignModeState().pending.map((p) => ({
                id: p.id,
                selector: p.selector,
                className: p.className,
                label: p.label,
                styles: Object.fromEntries(
                    Object.entries(p.styles).filter(([, v]) => v != null),
                ) as Record<string, string>,
                text: p.text,
            })),
        );
    };

    const applyHistory = (entry: ReturnType<typeof historyUndo>, side: "before" | "after") => {
        if (!entry || !bridge) return;
        const styles = side === "before" ? entry.before : entry.after;
        if (Object.keys(styles).length) bridge.style(entry.id, styles, entry.selector);
        const text = side === "before" ? entry.textBefore : entry.textAfter;
        if (text != null) bridge.content(entry.id, text, entry.selector);
    };

    const apply = async () => {
        const edits = getDesignModeState().pending;
        if (!edits.length || !project_path) {
            setApplyError(!project_path ? "Open a project to apply." : "Nothing to apply.");
            return;
        }
        setApplying(true);
        setApplyError(null);
        try {
            const result = await applyEditsToProject(project_path, edits, scope);
            if (result.errors.length && !result.files.length) {
                setApplyError(result.errors.join(" "));
                return;
            }
            if (result.errors.length) setApplyError(result.errors.join(" "));
            clearDesignPending();
            await clearHistory();
        } catch (err) {
            setApplyError(err instanceof Error ? err.message : "Couldn't patch source.");
        } finally {
            setApplying(false);
        }
    };

    const pendingStyles = selected ? (pending.find((p) => p.id === selected.id)?.styles ?? {}) : {};
    const computed = selected?.styles;
    const s = computed ? { ...computed, ...pendingStyles } : undefined;
    const display = s?.display ?? "block";
    const flex = isFlexDisplay(display);
    const grid = isGridDisplay(display);
    const autoLayout = flex || grid;
    const textAlign = normalizeTextAlign(s?.textAlign);
    const weight = normalizeWeight(s?.fontWeight);
    const justify = normalizeJustify(s?.justifyContent);
    const align = normalizeAlign(s?.alignItems);
    const direction = (s?.flexDirection || "row").startsWith("column") ? "column" : "row";
    const overflow = (s?.overflow || "visible").split(" ")[0] ?? "visible";
    const widthPx = parsePx(s?.width) ?? parsePx(computed?.width);
    const heightPx = parsePx(s?.height) ?? parsePx(computed?.height);
    const hasFill =
        !!s &&
        !fillHidden &&
        (!isTransparentColor(s.backgroundColor) || /gradient\(/i.test(s.backgroundImage || ""));
    const hasStroke = !!s && (s.borderStyle !== "none" && (parsePx(s.borderWidth) ?? 0) > 0);
    const showType =
        !!selected?.text ||
        /^(h[1-6]|p|span|a|button|label|li|td|th|blockquote|figcaption|em|strong|small|code|pre|input|textarea)$/.test(
            selected?.tag ?? "",
        );
    const padX = parsePx(s?.paddingLeft) ?? parsePx(s?.paddingRight);
    const padY = parsePx(s?.paddingTop) ?? parsePx(s?.paddingBottom);

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
            <SidebarPanelHeaderFrame
                title="Design"
                actions={
                    <div className="flex items-center gap-0.5">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => applyHistory(historyUndo(), "before")}
                            title="Undo"
                        >
                            <Icon name="undo" size={14} />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => applyHistory(historyRedo(), "after")}
                            title="Redo"
                        >
                            <Icon name="redo" size={14} />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                                bridge?.reset();
                                clearDesignPending();
                                clearHistory();
                            }}
                            title="Reset"
                        >
                            <Icon name="refresh" size={14} />
                        </Button>
                    </div>
                }
            />
            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                {!selected || !s ? (
                    <p className="px-3 py-4 text-xs leading-relaxed text-text-muted">
                        Click an element in the preview to inspect it.
                    </p>
                ) : (
                    <>
                        <Section title="Position">
                            <div className="flex gap-1">
                                <PxInput
                                    glyph={<Glyph>X</Glyph>}
                                    title="X"
                                    value={parsePx(s.left) ?? 0}
                                    min={-9999}
                                    onCommit={(n) =>
                                        patch({
                                            position: s.position === "static" ? "relative" : s.position,
                                            left: px(n),
                                        })
                                    }
                                />
                                <PxInput
                                    glyph={<Glyph>Y</Glyph>}
                                    title="Y"
                                    value={parsePx(s.top) ?? 0}
                                    min={-9999}
                                    onCommit={(n) =>
                                        patch({
                                            position: s.position === "static" ? "relative" : s.position,
                                            top: px(n),
                                        })
                                    }
                                />
                            </div>
                        </Section>
                        <Section title="Layout">
                            <div className="flex gap-1">
                                <PxInput
                                    glyph={<Glyph>W</Glyph>}
                                    title="Width"
                                    value={widthPx}
                                    onCommit={(n) => {
                                        if (lockRatio && widthPx && heightPx && widthPx > 0) {
                                            patch({
                                                width: px(n),
                                                height: px(Math.max(1, Math.round((n / widthPx) * heightPx))),
                                            });
                                            return;
                                        }
                                        patch({ width: px(n) });
                                    }}
                                />
                                <PxInput
                                    glyph={<Glyph>H</Glyph>}
                                    title="Height"
                                    value={heightPx}
                                    onCommit={(n) => {
                                        if (lockRatio && widthPx && heightPx && heightPx > 0) {
                                            patch({
                                                height: px(n),
                                                width: px(Math.max(1, Math.round((n / heightPx) * widthPx))),
                                            });
                                            return;
                                        }
                                        patch({ height: px(n) });
                                    }}
                                />
                                <IconBtn
                                    title="Constrain proportions"
                                    active={lockRatio}
                                    onClick={() => setLockRatio((v) => !v)}
                                >
                                    <Icon name="link" size={13} />
                                </IconBtn>
                            </div>
                            {!autoLayout ? (
                                <button
                                    type="button"
                                    className="flex h-7 w-full items-center justify-center rounded-md bg-panel-hover text-xs text-text-primary hover:bg-panel-active"
                                    onClick={() => patch({ display: "flex", flexDirection: "row" })}
                                >
                                    Wrap in flex
                                </button>
                            ) : (
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <div className="flex rounded-md bg-panel-hover p-0.5">
                                            <ToggleBtn
                                                label="Horizontal"
                                                active={direction === "row"}
                                                onClick={() => patch({ display: "flex", flexDirection: "row" })}
                                            >
                                                <Icon name="arrow_forward" size={14} />
                                            </ToggleBtn>
                                            <ToggleBtn
                                                label="Vertical"
                                                active={direction === "column"}
                                                onClick={() => patch({ display: "flex", flexDirection: "column" })}
                                            >
                                                <Icon name="arrow_downward" size={14} />
                                            </ToggleBtn>
                                        </div>
                                        <AlignMatrix
                                            justify={justify}
                                            align={align === "stretch" ? "center" : align}
                                            onChange={(j, a) => patch({ justifyContent: j, alignItems: a })}
                                        />
                                        <PxInput
                                            glyph={<Glyph>↕</Glyph>}
                                            title="Gap"
                                            value={parsePx(s.columnGap || s.gap) ?? parsePx(s.rowGap)}
                                            onCommit={(n) => patch({ gap: px(n), columnGap: px(n), rowGap: px(n) })}
                                        />
                                    </div>
                                    <PadXY
                                        x={padX}
                                        y={padY}
                                        independent={padIndependent}
                                        onToggleIndependent={() => setPadIndependent((v) => !v)}
                                        values={{
                                            top: s.paddingTop,
                                            right: s.paddingRight,
                                            bottom: s.paddingBottom,
                                            left: s.paddingLeft,
                                        }}
                                        onChange={(axis, n) => {
                                            const v = px(n);
                                            if (axis === "x") patch({ paddingLeft: v, paddingRight: v });
                                            else patch({ paddingTop: v, paddingBottom: v });
                                        }}
                                        onSide={(side, n) => patch({ [`padding${side}`]: px(n) } as Partial<DesignComputedStyles>)}
                                    />
                                </div>
                            )}
                            <label className="flex items-center gap-2 text-xs text-text-secondary">
                                <input
                                    type="checkbox"
                                    checked={overflow === "hidden"}
                                    onChange={(e) => patch({ overflow: e.target.checked ? "hidden" : "visible" })}
                                    className="accent-accent"
                                />
                                Clip content
                            </label>
                        </Section>

                        <Section title="Appearance">
                            <div className="flex gap-1">
                                <PxInput
                                    glyph={<Glyph>%</Glyph>}
                                    title="Opacity"
                                    value={opacityPercent(s.opacity)}
                                    max={100}
                                    onCommit={(n) => patch({ opacity: String(Math.max(0, Math.min(100, n)) / 100) })}
                                />
                                <PxInput
                                    glyph={<Glyph>R</Glyph>}
                                    title="Corner radius"
                                    value={parsePx(s.borderRadius) ?? 0}
                                    onCommit={(n) => patch({ borderRadius: px(n) })}
                                />
                            </div>
                            <CompactSelect
                                value={s.mixBlendMode || "normal"}
                                options={[
                                    { value: "normal", label: "Normal" },
                                    { value: "multiply", label: "Multiply" },
                                    { value: "screen", label: "Screen" },
                                    { value: "overlay", label: "Overlay" },
                                    { value: "darken", label: "Darken" },
                                    { value: "lighten", label: "Lighten" },
                                ]}
                                onChange={(v) => patch({ mixBlendMode: v })}
                            />
                        </Section>

                        {showType ? (
                        <Section title="Typography">
                            <CompactSelect
                                value={fontSelectValue(s.fontFamily)}
                                options={
                                    FONT_OPTIONS.some((o) => firstFontFamily(o.value).toLowerCase() === firstFontFamily(s.fontFamily).toLowerCase())
                                        ? FONT_OPTIONS
                                        : [{ value: s.fontFamily, label: firstFontFamily(s.fontFamily) }, ...FONT_OPTIONS]
                                }
                                onChange={(v) => patch({ fontFamily: v })}
                            />
                            <div className="flex gap-1">
                                <CompactSelect value={weight} options={WEIGHT_OPTIONS} onChange={(v) => patch({ fontWeight: v })} />
                                <PxInput
                                    glyph={<Glyph>T</Glyph>}
                                    title="Size"
                                    value={parsePx(s.fontSize)}
                                    onCommit={(n) => patch({ fontSize: px(n) })}
                                />
                            </div>
                            <div className="flex gap-1">
                                <MicroLabel label="Line height">
                                    <PxInput
                                        glyph={<Glyph>↕</Glyph>}
                                        title="Line height"
                                        value={parsePx(s.lineHeight)}
                                        onCommit={(n) => patch({ lineHeight: px(n) })}
                                    />
                                </MicroLabel>
                                <MicroLabel label="Letter spacing">
                                    <PxInput
                                        glyph={<Glyph>A</Glyph>}
                                        title="Letter spacing"
                                        value={parsePx(s.letterSpacing) ?? 0}
                                        min={-40}
                                        onCommit={(n) => patch({ letterSpacing: px(n) })}
                                    />
                                </MicroLabel>
                            </div>
                            <div className="flex rounded-md bg-panel-hover p-0.5">
                                <ToggleBtn label="Left" active={textAlign === "left"} onClick={() => patch({ textAlign: "left" })}>
                                    <TextAlignLeft />
                                </ToggleBtn>
                                <ToggleBtn label="Center" active={textAlign === "center"} onClick={() => patch({ textAlign: "center" })}>
                                    <TextAlignCenter />
                                </ToggleBtn>
                                <ToggleBtn label="Right" active={textAlign === "right"} onClick={() => patch({ textAlign: "right" })}>
                                    <TextAlignRight />
                                </ToggleBtn>
                                <ToggleBtn label="Justify" active={textAlign === "justify"} onClick={() => patch({ textAlign: "justify" })}>
                                    <TextAlignJustify />
                                </ToggleBtn>
                            </div>
                            <ColorRow cssValue={s.color} onChange={(c) => patch({ color: c })} />
                            {selected.text ? (
                                <Textarea
                                    value={selected.text}
                                    onChange={(e) => patch({}, e.target.value)}
                                    rows={2}
                                    placeholder="Content"
                                    className="min-h-10 resize-y bg-panel-hover text-xs"
                                />
                            ) : null}
                        </Section>
                        ) : null}

                        {hasFill ? (
                            <Section
                                title="Fill"
                                action={
                                    <IconBtn
                                        title="Remove fill"
                                        onClick={() => {
                                            setFillHidden(true);
                                            patch({ backgroundColor: "transparent", backgroundImage: "none" });
                                        }}
                                    >
                                        <Icon name="remove" size={14} />
                                    </IconBtn>
                                }
                            >
                                <ColorRow
                                    cssValue={/gradient\(/i.test(s.backgroundImage || "") ? s.backgroundImage : s.backgroundColor}
                                    hidden={fillHidden}
                                    onToggleHidden={() => {
                                        const next = !fillHidden;
                                        setFillHidden(next);
                                        patch(
                                            next
                                                ? { backgroundColor: "transparent", backgroundImage: "none" }
                                                : { backgroundColor: "#ffffff", backgroundImage: "none" },
                                        );
                                    }}
                                    onChange={(c) => {
                                        setFillHidden(false);
                                        if (/gradient\(/i.test(c)) {
                                            patch({ backgroundImage: c, backgroundColor: "transparent" });
                                            return;
                                        }
                                        patch({ backgroundColor: c, backgroundImage: "none" });
                                    }}
                                    onRemove={() => {
                                        setFillHidden(true);
                                        patch({ backgroundColor: "transparent", backgroundImage: "none" });
                                    }}
                                />
                            </Section>
                        ) : (
                            <AddHeader
                                title="Fill"
                                onAdd={() => {
                                    setFillHidden(false);
                                    patch({ backgroundColor: "#ffffff", backgroundImage: "none" });
                                }}
                            />
                        )}

                        {hasStroke ? (
                            <Section
                                title="Stroke"
                                action={
                                    <IconBtn title="Remove stroke" onClick={() => patch({ borderStyle: "none", borderWidth: "0px" })}>
                                        <Icon name="remove" size={14} />
                                    </IconBtn>
                                }
                            >
                                <div className="flex gap-1">
                                    <PxInput
                                        glyph={<Glyph>—</Glyph>}
                                        title="Thickness"
                                        value={parsePx(s.borderWidth) ?? 0}
                                        onCommit={(n) =>
                                            patch({
                                                borderWidth: px(n),
                                                borderStyle: n === 0 ? "none" : s.borderStyle === "none" ? "solid" : s.borderStyle,
                                            })
                                        }
                                    />
                                    <CompactSelect
                                        value={s.borderStyle === "none" ? "solid" : s.borderStyle}
                                        options={[
                                            { value: "solid", label: "Solid" },
                                            { value: "dashed", label: "Dashed" },
                                            { value: "dotted", label: "Dotted" },
                                        ]}
                                        onChange={(v) => patch({ borderStyle: v, borderWidth: s.borderWidth === "0px" ? "1px" : s.borderWidth })}
                                    />
                                </div>
                                <ColorRow
                                    cssValue={s.borderColor}
                                    onChange={(c) => patch({ borderColor: c, borderStyle: s.borderStyle === "none" ? "solid" : s.borderStyle })}
                                    onRemove={() => patch({ borderStyle: "none", borderWidth: "0px" })}
                                />
                            </Section>
                        ) : (
                            <AddHeader
                                title="Stroke"
                                onAdd={() => patch({ borderStyle: "solid", borderWidth: "1px", borderColor: "#000000" })}
                            />
                        )}

                        <EffectsSection
                            effects={effects}
                            onChange={(next) => {
                                setEffects(next);
                                patch(effectsToStyles(next));
                            }}
                        />
                        <SelectionColors
                            colors={[s.color, s.backgroundColor, s.borderColor].filter((c) => c && !isTransparentColor(c))}
                            onPick={(c) => patch({ color: c })}
                        />
                    </>
                )}
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-t border-border-subtle px-3 py-2">
                <div className="flex rounded-md bg-panel-hover p-0.5">
                    <ToggleBtn label="This element" active={scope === "element"} onClick={() => setScope("element")}>
                        <span className="px-1 text-[10px]">Element</span>
                    </ToggleBtn>
                    <ToggleBtn label="Component" active={scope === "component"} onClick={() => setScope("component")}>
                        <span className="px-1 text-[10px]">Component</span>
                    </ToggleBtn>
                </div>
                {applyError ? <p className="text-[10px] leading-snug text-text-muted">{applyError}</p> : (
                    <p className="text-[10px] leading-snug text-text-muted">
                        {scope === "component"
                            ? "Apply writes classes on the component’s root tag."
                            : "Apply writes classes on this element’s JSX tag."}
                    </p>
                )}
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-text-muted">
                        {pending.length > 0 ? `${pending.length} pending` : "Live preview"}
                    </span>
                    <Button
                        type="button"
                        size="sm"
                        className="h-7 px-3 text-xs"
                        onClick={() => void apply()}
                        disabled={applying || (!selected && pending.length === 0)}
                    >
                        {applying ? "Applying…" : "Apply"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

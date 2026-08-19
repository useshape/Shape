"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SidebarPanelHeaderFrame } from "@/features/panels/ui/sidebar-panel-header";
import { PxInput, ToggleBtn } from "@/features/editor/ui/tailwind-controls/tw-control-shared";
import { useProjectState } from "@/lib/backend";
import {
    clearDesignPending,
    designPendingCountLabel,
    setDesignApplyFailedIds,
    setDesignPending,
    upsertDesignPending,
    useDesignModeStore,
    getDesignModeState,
} from "../../design-mode/store";
import {
    clearHistory,
    getHistorySession,
    historyRedo,
    historyUndo,
    recordChange,
    setHistoryPending,
    subscribeHistory,
} from "../../design-mode/history";
import { commitDesignEdits } from "../../design-mode/commit";
import { designLog } from "../../design-mode/log";
import type { DesignComputedStyles } from "../../design-mode/types";
import {
    isFlexDisplay,
    isGridDisplay,
    isTransparentColor,
    normalizeAlign,
    normalizeJustify,
    opacityPercent,
    parsePx,
    px,
} from "../../design-mode/css";
import {
    AddHeader,
    AlignMatrix,
    Collapse,
    ColorRow,
    CompactSelect,
    CornerGlyph,
    EffectsSection,
    effectsToStyles,
    Glyph,
    IconBtn,
    IndependentCornersGlyph,
    PadXY,
    Section,
    type DesignEffect,
} from "./fields";
import { TypographySection } from "./typography-section";
import { ExportSection } from "./export-section";
import { parseEffectsFromStyles } from "./parse-effects";
import {
    designFillTarget,
    designFlow,
    formatRadiusCorners,
    isDesignTextElement,
    parseRadiusCorners,
    stylesForFlow,
} from "./panel-layout";

type Bridge = {
    style: (id: string, styles: Record<string, string>, selector?: string) => void;
    content: (id: string, text: string, selector?: string) => void;
    undo: () => void;
    redo: () => void;
    reset: () => void;
};

export function DesignInspectorPanel({ bridge }: { bridge: Bridge | null }) {
    const { selected, pending, selection, selecting, applyFailedIds } = useDesignModeStore();
    const { project_path } = useProjectState();
    const [padIndependent, setPadIndependent] = React.useState(false);
    const [fillHidden, setFillHidden] = React.useState(false);
    const [lockRatio, setLockRatio] = React.useState(false);
    const [radiusIndependent, setRadiusIndependent] = React.useState(false);
    const [effects, setEffects] = React.useState<DesignEffect[]>([]);
    const [applying, setApplying] = React.useState(false);
    const history = React.useSyncExternalStore(subscribeHistory, getHistorySession, getHistorySession);

    React.useEffect(() => {
        setFillHidden(false);
        setPadIndependent(false);
        setRadiusIndependent(false);
        setEffects(selected ? parseEffectsFromStyles(selected.styles) : []);
    }, [selected?.id]);

    const patch = React.useCallback(
        (styles: Partial<DesignComputedStyles>, text?: string, silent = false) => {
            const targets = getDesignModeState().selection.length
                ? getDesignModeState().selection
                : getDesignModeState().selected
                  ? [getDesignModeState().selected!]
                  : [];
            if (!targets.length || !bridge) return;
            const clean = Object.fromEntries(
                Object.entries(styles).filter(([, v]) => v != null),
            ) as Record<string, string>;
            if (clean.borderStyle === "none" && (clean.borderWidth == null || clean.borderWidth === "")) {
                clean.borderWidth = "0px";
            }
            if ((clean.borderWidth === "0px" || clean.borderWidth === "0") && !clean.borderStyle) {
                clean.borderStyle = "none";
            }
            for (const el of targets) {
                if (!silent) {
                    const before: Record<string, string> = {};
                    for (const key of Object.keys(clean) as (keyof DesignComputedStyles)[]) {
                        before[key] = String(el.styles[key] ?? "");
                    }
                    recordChange({
                        id: el.id,
                        selector: el.selector,
                        label: el.label,
                        before,
                        after: clean,
                        textBefore: text != null ? el.text : undefined,
                        textAfter: text,
                    });
                }
                if (Object.keys(clean).length) {
                    bridge.style(el.id, clean, el.selector);
                }
                if (text != null) bridge.content(el.id, text, el.selector);
                upsertDesignPending({
                    id: el.id,
                    tag: el.tag,
                    selector: el.selector,
                    className: el.className,
                    locateText: el.locateText,
                    source: el.source,
                    label: el.label,
                    styles,
                    text: text ?? el.text,
                    inspect: el.inspect,
                });
            }
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
        },
        [bridge],
    );

    const apply = async () => {
        const edits = getDesignModeState().pending;
        if (!edits.length || !project_path) {
            const msg = !project_path ? "Open a project to apply." : "Nothing to apply.";
            void import("@/features/notifications").then(({ notify }) => notify.warn("Apply", msg));
            return;
        }
        setApplying(true);
        try {
            const result = await commitDesignEdits(project_path, edits);
            const { notify } = await import("@/features/notifications");
            setDesignApplyFailedIds(result.failedIds);
            if (result.errors.length) {
                const msg = result.errors.join(" ");
                if (result.appliedIds.length) notify.warn("Some edits were not applied", msg);
                else notify.error("Apply failed", msg);
            }
            if (result.appliedIds.length || result.failedIds.length) {
                const remain = edits.filter((e) => !result.appliedIds.includes(e.id));
                if (remain.length) setDesignPending(remain);
                else clearDesignPending();
                setHistoryPending(
                    remain.map((p) => ({
                        id: p.id,
                        selector: p.selector,
                        className: p.className,
                        tag: p.tag,
                        locateText: p.locateText,
                        source: p.source,
                        label: p.label,
                        styles: Object.fromEntries(
                            Object.entries(p.styles).filter(([, v]) => v != null),
                        ) as Record<string, string>,
                        text: p.text,
                    })),
                );
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Couldn't patch source.";
            const { notify } = await import("@/features/notifications");
            notify.error("Apply failed", msg);
            designLog("ERROR", "apply threw", { error: msg });
            setDesignApplyFailedIds(edits.map((e) => e.id));
        } finally {
            setApplying(false);
        }
    };

    const applyHistory = (entry: ReturnType<typeof historyUndo>, side: "before" | "after") => {
        if (!entry || !bridge) return;
        const styles = side === "before" ? entry.before : entry.after;
        if (Object.keys(styles).length) bridge.style(entry.id, styles, entry.selector);
        const text = side === "before" ? entry.textBefore : entry.textAfter;
        if (text != null) bridge.content(entry.id, text, entry.selector);
    };

    const pendingStyles = selected ? (pending.find((p) => p.id === selected.id)?.styles ?? {}) : {};
    const computed = selected?.styles;
    const s = computed ? { ...computed, ...pendingStyles } : undefined;
    const display = s?.display ?? "block";
    const flex = isFlexDisplay(display);
    const grid = isGridDisplay(display);
    const autoLayout = flex || grid;
    const justify = normalizeJustify(s?.justifyContent);
    const align = normalizeAlign(s?.alignItems);
    const overflow = (s?.overflow || "visible").split(" ")[0] ?? "visible";
    const widthPx = parsePx(s?.width) ?? parsePx(computed?.width);
    const heightPx = parsePx(s?.height) ?? parsePx(computed?.height);
    const showType = isDesignTextElement(selected?.tag, selected?.text);
    const fillKey = designFillTarget(showType);
    const hasFill =
        !!s &&
        !fillHidden &&
        (showType
            ? !isTransparentColor(s.color)
            : !isTransparentColor(s.backgroundColor) || /gradient\(/i.test(s.backgroundImage || ""));
    const hasStroke = !!s && (s.borderStyle !== "none" && (parsePx(s.borderWidth) ?? 0) > 0);
    const padX = parsePx(s?.paddingLeft) ?? parsePx(s?.paddingRight);
    const padY = parsePx(s?.paddingTop) ?? parsePx(s?.paddingBottom);
    const flow = s ? designFlow(display, s.flexDirection || "row") : "block";
    const corners = parseRadiusCorners(s?.borderRadius || "0");

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
                {selecting && !selected ? (
                    <div className="flex flex-col gap-2 px-3 py-4">
                        <div className="h-3 w-24 animate-pulse rounded bg-panel-hover" />
                        <div className="h-8 w-full animate-pulse rounded-md bg-panel-hover" />
                        <div className="h-8 w-full animate-pulse rounded-md bg-panel-hover" />
                        <div className="h-8 w-2/3 animate-pulse rounded-md bg-panel-hover" />
                    </div>
                ) : !selected || !s ? (
                    <p className="px-3 py-4 text-xs leading-relaxed text-text-muted">
                        Click an element in the preview to inspect it.
                    </p>
                ) : (
                    <>
                        {selection.length > 1 ? (
                            <p className="border-b border-border-subtle px-3 py-2 text-xs text-text-muted">
                                Editing {selection.length} elements
                            </p>
                        ) : null}
                        {applyFailedIds.includes(selected.id) ? (
                            <div className="mx-3 mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-200">
                                Apply did not update this element
                            </div>
                        ) : null}
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
                                            left: px(Math.round(n)),
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
                                            top: px(Math.round(n)),
                                        })
                                    }
                                />
                            </div>
                        </Section>
                        <Section title="Layout">
                            <div className="flex rounded-md bg-panel-hover p-0.5">
                                {(
                                    [
                                        { kind: "block", label: "Block" },
                                        { kind: "row", label: "Horizontal" },
                                        { kind: "column", label: "Vertical" },
                                        { kind: "grid", label: "Grid" },
                                    ] as const
                                ).map(({ kind, label }) => (
                                    <ToggleBtn
                                        key={kind}
                                        label={label}
                                        active={flow === kind}
                                        onClick={() => patch(stylesForFlow(kind))}
                                    >
                                        {kind === "block" ? (
                                            <Icon name="crop_square" size={14} />
                                        ) : kind === "row" ? (
                                            <Icon name="arrow_forward" size={14} />
                                        ) : kind === "column" ? (
                                            <Icon name="arrow_downward" size={14} />
                                        ) : (
                                            <Icon name="layout_grid" size={14} />
                                        )}
                                    </ToggleBtn>
                                ))}
                            </div>
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
                                    <Icon name="constrain" size={13} />
                                </IconBtn>
                            </div>
                            <Collapse open={autoLayout}>
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <AlignMatrix
                                            justify={justify}
                                            align={align === "stretch" ? "center" : align}
                                            onChange={(j, a) => patch({ justifyContent: j, alignItems: a })}
                                        />
                                        <PxInput
                                            glyph={<Icon name="width" size={12} />}
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
                                        onSide={(side, n) =>
                                            patch({ [`padding${side}`]: px(n) } as Partial<DesignComputedStyles>)
                                        }
                                    />
                                </div>
                            </Collapse>
                            <label className="flex items-center gap-2 text-xs text-text-secondary" title="Clip overflowing children">
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
                                        glyph={<Icon name="radius" size={12} />}
                                    title="Corner radius"
                                    value={corners[0]}
                                    onCommit={(n) =>
                                        patch({
                                            borderRadius: radiusIndependent
                                                ? formatRadiusCorners(n, corners[1], corners[2], corners[3])
                                                : px(n),
                                        })
                                    }
                                />
                                    <IconBtn
                                        title="Independent corners"
                                        active={radiusIndependent}
                                        onClick={() => setRadiusIndependent((v) => !v)}
                                    >
                                        <IndependentCornersGlyph />
                                    </IconBtn>
                            </div>
                            <Collapse open={radiusIndependent}>
                                <div className="grid grid-cols-2 gap-1">
                                    {(["TL", "TR", "BL", "BR"] as const).map((label, i) => (
                                        <PxInput
                                            key={label}
                                            glyph={<CornerGlyph corner={label} />}
                                            title={`${label} radius`}
                                            value={corners[i] ?? 0}
                                            onCommit={(n) => {
                                                const next = [...corners] as [number, number, number, number];
                                                next[i] = n;
                                                patch({ borderRadius: formatRadiusCorners(...next) });
                                            }}
                                        />
                                    ))}
                                </div>
                            </Collapse>
                        </Section>

                        {showType ? (
                            <TypographySection s={s} text={selected.text} onPatch={patch} />
                        ) : null}

                        {hasFill ? (
                            <Section
                                title="Fill"
                                action={
                                    <IconBtn
                                        title="Remove fill"
                                        onClick={() => {
                                            setFillHidden(true);
                                            patch(
                                                fillKey === "color"
                                                    ? { color: "transparent" }
                                                    : { backgroundColor: "transparent", backgroundImage: "none" },
                                            );
                                        }}
                                    >
                                        <Icon name="remove" size={14} />
                                    </IconBtn>
                                }
                            >
                                <ColorRow
                                    cssValue={
                                        fillKey === "color"
                                            ? s.color
                                            : /gradient\(/i.test(s.backgroundImage || "")
                                              ? s.backgroundImage
                                              : s.backgroundColor
                                    }
                                    hidden={fillHidden}
                                    onToggleHidden={() => {
                                        const next = !fillHidden;
                                        setFillHidden(next);
                                        if (fillKey === "color") {
                                            patch({ color: next ? "transparent" : "#ffffff" });
                                            return;
                                        }
                                        patch(
                                            next
                                                ? { backgroundColor: "transparent", backgroundImage: "none" }
                                                : { backgroundColor: "#ffffff", backgroundImage: "none" },
                                        );
                                    }}
                                    onChange={(c) => {
                                        setFillHidden(false);
                                        if (fillKey === "color") {
                                            patch({ color: c });
                                            return;
                                        }
                                        if (/gradient\(/i.test(c)) {
                                            patch({ backgroundImage: c, backgroundColor: "transparent" });
                                            return;
                                        }
                                        patch({ backgroundColor: c, backgroundImage: "none" });
                                    }}
                                    onRemove={() => {
                                        setFillHidden(true);
                                        patch(
                                            fillKey === "color"
                                                ? { color: "transparent" }
                                                : { backgroundColor: "transparent", backgroundImage: "none" },
                                        );
                                    }}
                                />
                            </Section>
                        ) : (
                            <AddHeader
                                title="Fill"
                                onAdd={() => {
                                    setFillHidden(false);
                                    patch(
                                        fillKey === "color"
                                            ? { color: "#ffffff" }
                                            : { backgroundColor: "#ffffff", backgroundImage: "none" },
                                    );
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
                                        glyph={<Glyph>S</Glyph>}
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
                                        onChange={(v) =>
                                            patch({ borderStyle: v, borderWidth: s.borderWidth === "0px" ? "1px" : s.borderWidth })
                                        }
                                    />
                                </div>
                                <ColorRow
                                    cssValue={s.borderColor}
                                    onChange={(c) =>
                                        patch({ borderColor: c, borderStyle: s.borderStyle === "none" ? "solid" : s.borderStyle })
                                    }
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
                        <ExportSection />
                    </>
                )}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-3 py-2">
                {pending.length ? (
                    <span className="text-sm text-text-muted">{designPendingCountLabel(pending.length)}</span>
                ) : null}
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!history?.undo.length}
                    onClick={() => applyHistory(historyUndo(), "before")}
                >
                    <Icon name="undo" size={14} />
                    Undo
                </Button>
                <Button
                    type="button"
                    size="sm"
                    onClick={() => void apply()}
                    disabled={applying || pending.length === 0}
                >
                    {applying ? "Applying…" : "Apply"}
                </Button>
            </div>
        </div>
    );
}

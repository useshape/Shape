"use client";

import { RiAlignBottom, RiAlignCenter, RiAlignLeft, RiAlignRight, RiAlignTop, RiAlignVertically, RiArrowDownLine, RiArrowRightLine, RiCrosshair2Line, RiLink, RiSubtractLine, RiTextWrap } from "@remixicon/react";
import React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useProjectState } from "@/lib/backend";
import {
    clearDesignPending,
    designPendingCountLabel,
    setDesignApplyFailedIds,
    setDesignPending,
    upsertDesignPending,
    useDesignModeStore,
    getDesignModeState,
} from "@/features/preview/design/store";
import {
    clearHistory,
    historyRedo,
    historyUndo,
    recordChange,
    setHistoryPending,
} from "@/features/preview/design/history";
import { commitDesignEdits } from "@/features/preview/design/commit";
import { designLog } from "@/features/preview/design/log";
import type { DesignComputedStyles } from "@/features/preview/design/types";
import {
    isFlexDisplay,
    isGridDisplay,
    isTransparentColor,
    normalizeAlign,
    normalizeJustify,
    parsePx,
    px,
} from "@/features/preview/design/css";
import {
    AddHeader,
    AlignMatrix,
    CheckRow,
    ColorRow,
    CompactSelect,
    CornerGlyph,
    DimGrid,
    EffectsSection,
    effectsToStyles,
    Glyph,
    IconBtn,
    IndependentCornersGlyph,
    OpacityBlendRow,
    PadXY,
    PxInput,
    RadiusGlyph,
    Section,
    Segment,
    SelectionColors,
    ToggleBtn,
    type DesignEffect,
} from "../shared/fields";
import { TypographySection } from "../panels/typography";
import { ExportSection } from "../panels/export";
import { parseEffectsFromStyles } from "../shared/parse-effects";
import {
    designFillTarget,
    designFlow,
    formatRadiusCorners,
    isDesignTextElement,
    parseRadiusCorners,
    stylesForFlow,
} from "../shared/panel-layout";

type Bridge = {
    style: (id: string, styles: Record<string, string>, selector?: string) => void;
    content: (id: string, text: string, selector?: string) => void;
    undo: () => void;
    redo: () => void;
    reset: () => void;
    setCssVar?: (name: string, value: string) => void;
};

export function applyDesignHistory(bridge: Bridge | null, side: "before" | "after") {
    const entry = side === "before" ? historyUndo() : historyRedo();
    if (!entry || !bridge) return;
    const styles = side === "before" ? entry.before : entry.after;
    if (Object.keys(styles).length) bridge.style(entry.id, styles, entry.selector);
    const text = side === "before" ? entry.textBefore : entry.textAfter;
    if (text != null) bridge.content(entry.id, text, entry.selector);
}

export function DesignInspectorPanel({ bridge }: { bridge: Bridge | null }) {
    const { selected, pending, selection, selecting, applyFailedIds } = useDesignModeStore();
    const { project_path } = useProjectState();
    const [padIndependent, setPadIndependent] = React.useState(false);
    const [fillHidden, setFillHidden] = React.useState(false);
    const [lockRatio, setLockRatio] = React.useState(false);
    const [radiusIndependent, setRadiusIndependent] = React.useState(false);
    const [effects, setEffects] = React.useState<DesignEffect[]>([]);
    const [applying, setApplying] = React.useState(false);
    /** When fill is owned by var(--token), prefer editing the token unless user detaches. */
    const [fillDetach, setFillDetach] = React.useState(false);
    /** Default OFF — apply to the selected element, not the component definition. */
    const [applyToComponent, setApplyToComponent] = React.useState(false);

    React.useEffect(() => {
        setFillHidden(false);
        setPadIndependent(false);
        setRadiusIndependent(false);
        setFillDetach(false);
        setApplyToComponent(false);
        setEffects(selected ? parseEffectsFromStyles(selected.styles) : []);
    }, [selected?.id]);

    const patch = React.useCallback(
        (
            styles: Partial<DesignComputedStyles>,
            text?: string,
            silent = false,
            tokenUpdates?: Record<string, string>,
        ) => {
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
            if (tokenUpdates) {
                for (const [name, value] of Object.entries(tokenUpdates)) {
                    bridge.setCssVar?.(name, value);
                }
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
                    tokenUpdates,
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
            const scope = applyToComponent && edits.some((e) => e.source?.componentName)
                ? "component"
                : "element";
            const result = await commitDesignEdits(project_path, edits, scope);
            const { notify } = await import("@/features/notifications");
            setDesignApplyFailedIds(result.failedIds);
            if (result.errors.length) {
                const msg = result.errors.join(" ");
                if (result.appliedIds.length) notify.warn("Some edits were not applied", msg);
                else notify.error("Apply failed", msg);
            } else if (!result.appliedIds.length) {
                notify.error("Apply failed", "Nothing was written to source.");
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
            designLog("ERROR", "apply threw", {
                why: msg,
                error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
                tip: "Paste the ── shape/design … ── end block from the Shape terminal into chat",
            });
            setDesignApplyFailedIds(edits.map((e) => e.id));
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
    const justify = normalizeJustify(s?.justifyContent);
    const align = normalizeAlign(s?.alignItems);
    const overflow = (s?.overflow || "visible").split(" ")[0] ?? "visible";
    const widthPx = parsePx(s?.width) ?? parsePx(computed?.width);
    const heightPx = parsePx(s?.height) ?? parsePx(computed?.height);
    const showType = isDesignTextElement(selected?.tag, selected?.text);
    const fillKey = designFillTarget(showType);
    const fillOriginKey = fillKey === "color" ? "color" : "backgroundColor";
    const fillOrigin = selected?.inspect?.origins?.[fillOriginKey];
    const fillAuthored = fillOrigin?.authored?.trim() ?? "";
    const fillVarMatch = fillAuthored.match(/^var\(\s*(--[a-zA-Z0-9-_]+)/);
    const fillTokenName = fillVarMatch?.[1] ?? null;
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
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
                {selecting && !selected ? (
                    <div className="flex flex-col gap-3 px-4 py-4">
                        <div className="h-3 w-24 animate-pulse rounded bg-panel-hover" />
                        <div className="h-8 w-full animate-pulse rounded-lg bg-panel-hover" />
                        <div className="h-8 w-full animate-pulse rounded-lg bg-panel-hover" />
                        <div className="h-8 w-full animate-pulse rounded-lg bg-panel-hover" />
                    </div>
                ) : !selected || !s ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                        <Icon icon={RiCrosshair2Line} className="text-text-disabled" />
                        <p className="text-sm leading-relaxed text-text-muted">
                            Select an element on the canvas
                        </p>
                    </div>
                ) : (
                    <>
                        {selection.length > 1 ? (
                            <p className="border-b border-border-subtle px-4 py-2.5 text-sm text-text-muted">
                                Editing {selection.length} elements
                            </p>
                        ) : null}
                        {selected.source?.componentName ? (
                            <div className="flex flex-col gap-2 border-b border-border-subtle px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="rounded-md bg-panel-hover px-2 py-0.5 text-xs font-medium text-text-secondary">
                                        {selected.source.componentName}
                                    </span>
                                    <span className="truncate text-xs text-text-muted">
                                        {selected.tag}
                                        {selected.label ? ` · ${selected.label}` : ""}
                                    </span>
                                </div>
                                <CheckRow
                                    label="Apply to component"
                                    title="Write on the component definition instead of this element instance"
                                    checked={applyToComponent}
                                    onChange={setApplyToComponent}
                                />
                            </div>
                        ) : (
                            <div className="border-b border-border-subtle px-4 py-2 text-xs text-text-muted">
                                <span className="font-medium text-text-secondary">{selected.tag}</span>
                                {selected.label ? ` · ${selected.label}` : ""}
                            </div>
                        )}
                        {applyFailedIds.includes(selected.id) ? (
                            <div className="mx-4 mt-3 rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
                                Apply did not update this element
                            </div>
                        ) : null}
                        {autoLayout ? (
                            <Section title="Alignment">
                                <Segment>
                                    <ToggleBtn
                                        label="Align left"
                                        active={justify === "flex-start"}
                                        onClick={() => patch({ justifyContent: "flex-start" })}
                                    >
                                        <Icon icon={RiAlignLeft} />
                                    </ToggleBtn>
                                    <ToggleBtn
                                        label="Align center"
                                        active={justify === "center"}
                                        onClick={() => patch({ justifyContent: "center" })}
                                    >
                                        <Icon icon={RiAlignCenter} />
                                    </ToggleBtn>
                                    <ToggleBtn
                                        label="Align right"
                                        active={justify === "flex-end"}
                                        onClick={() => patch({ justifyContent: "flex-end" })}
                                    >
                                        <Icon icon={RiAlignRight} />
                                    </ToggleBtn>
                                    <ToggleBtn
                                        label="Align top"
                                        active={align === "flex-start"}
                                        onClick={() => patch({ alignItems: "flex-start" })}
                                    >
                                        <Icon icon={RiAlignTop} />
                                    </ToggleBtn>
                                    <ToggleBtn
                                        label="Align middle"
                                        active={align === "center"}
                                        onClick={() => patch({ alignItems: "center" })}
                                    >
                                        <Icon icon={RiAlignVertically} />
                                    </ToggleBtn>
                                    <ToggleBtn
                                        label="Align bottom"
                                        active={align === "flex-end"}
                                        onClick={() => patch({ alignItems: "flex-end" })}
                                    >
                                        <Icon icon={RiAlignBottom} />
                                    </ToggleBtn>
                                </Segment>
                            </Section>
                        ) : null}
                        <Section title="Position">
                            <DimGrid>
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
                            </DimGrid>
                            <DimGrid>
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
                            </DimGrid>
                            <div className="flex items-center gap-2">
                                <PxInput
                                    glyph={<Glyph>°</Glyph>}
                                    title="Rotation"
                                    value={0}
                                    min={-360}
                                    max={360}
                                    onCommit={() => {
                                        /* transform rotate not wired yet */
                                    }}
                                />
                                <IconBtn
                                    title="Constrain proportions"
                                    active={lockRatio}
                                    onClick={() => setLockRatio((v) => !v)}
                                >
                                    <Icon icon={RiLink} />
                                </IconBtn>
                            </div>
                            {!autoLayout ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-full"
                                    onClick={() => patch(stylesForFlow("row"))}
                                >
                                    Wrap in flex
                                </Button>
                            ) : null}
                        </Section>

                        {autoLayout ? (
                            <Section title="Auto layout">
                                <div className="flex items-center gap-3">
                                    <AlignMatrix
                                        justify={justify}
                                        align={align === "stretch" ? "center" : align}
                                        onChange={(j, a) => patch({ justifyContent: j, alignItems: a })}
                                    />
                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                        <div className="flex gap-1">
                                            <IconBtn
                                                title="Vertical"
                                                active={flow === "column"}
                                                onClick={() => patch(stylesForFlow("column"))}
                                            >
                                                <Icon icon={RiArrowDownLine} />
                                            </IconBtn>
                                            <IconBtn
                                                title="Horizontal"
                                                active={flow === "row"}
                                                onClick={() => patch(stylesForFlow("row"))}
                                            >
                                                <Icon icon={RiArrowRightLine} />
                                            </IconBtn>
                                            <IconBtn
                                                title="Wrap"
                                                active={(s.flexWrap || "nowrap") !== "nowrap"}
                                                onClick={() =>
                                                    patch({
                                                        flexWrap:
                                                            (s.flexWrap || "nowrap") === "nowrap"
                                                                ? "wrap"
                                                                : "nowrap",
                                                    })
                                                }
                                            >
                                                <Icon icon={RiTextWrap} />
                                            </IconBtn>
                                        </div>
                                        <PxInput
                                            glyph={<Glyph>G</Glyph>}
                                            title="Gap"
                                            value={parsePx(s.columnGap || s.gap) ?? parsePx(s.rowGap) ?? 0}
                                            onCommit={(n) =>
                                                patch({ gap: px(n), columnGap: px(n), rowGap: px(n) })
                                            }
                                        />
                                    </div>
                                </div>
                                <PadXY
                                    x={padX}
                                    y={padY}
                                    onChange={(axis, n) => {
                                        const v = px(n);
                                        if (axis === "x") {
                                            patch({ paddingLeft: v, paddingRight: v });
                                        } else {
                                            patch({ paddingTop: v, paddingBottom: v });
                                        }
                                    }}
                                    independent={padIndependent}
                                    onToggleIndependent={() => setPadIndependent((v) => !v)}
                                    values={{
                                        top: s.paddingTop,
                                        right: s.paddingRight,
                                        bottom: s.paddingBottom,
                                        left: s.paddingLeft,
                                    }}
                                    onSide={(side, n) =>
                                        patch({ [`padding${side}`]: px(n) } as Partial<DesignComputedStyles>)
                                    }
                                />
                                <CheckRow
                                    label="Clip content"
                                    title="Clip overflowing children"
                                    checked={overflow === "hidden"}
                                    onChange={(v) => patch({ overflow: v ? "hidden" : "visible" })}
                                />
                            </Section>
                        ) : null}

                        <Section
                            title="Radius"
                            action={
                                <IconBtn
                                    title="Independent corners"
                                    active={radiusIndependent}
                                    onClick={() => setRadiusIndependent((v) => !v)}
                                >
                                    <IndependentCornersGlyph />
                                </IconBtn>
                            }
                        >
                            {radiusIndependent ? (
                                <div className="grid grid-cols-2 gap-2">
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
                            ) : (
                                <PxInput
                                    glyph={<RadiusGlyph />}
                                    title="Radius"
                                    value={parsePx(s.borderRadius) ?? 0}
                                    onCommit={(n) => patch({ borderRadius: px(Math.max(0, n)) })}
                                />
                            )}
                        </Section>

                        <Section title="Blending">
                            <OpacityBlendRow
                                opacity={s.opacity}
                                blend={s.mixBlendMode || "normal"}
                                onOpacity={(v) => patch({ opacity: v })}
                                onBlend={(v) => patch({ mixBlendMode: v })}
                            />
                        </Section>

                        {showType ? (
                            <TypographySection
                                s={s}
                                text={selected.text}
                                tag={selected.tag}
                                onPatch={patch}
                            />
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
                                        <Icon icon={RiSubtractLine} />
                                    </IconBtn>
                                }
                            >
                                {fillTokenName && !fillDetach ? (
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span className="truncate rounded-md bg-panel-hover px-2 py-0.5 font-mono text-[11px] text-text-secondary">
                                            {fillTokenName}
                                        </span>
                                        <button
                                            type="button"
                                            className="rounded-md px-2 py-0.5 text-[11px] text-text-muted hover:bg-panel-hover hover:text-text-primary"
                                            onClick={() => setFillDetach(true)}
                                            title="Write a plain color on this element instead of editing the token"
                                        >
                                            Detach
                                        </button>
                                    </div>
                                ) : fillTokenName && fillDetach ? (
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span className="text-[11px] text-text-muted">Detached from token</span>
                                        <button
                                            type="button"
                                            className="rounded-md px-2 py-0.5 text-[11px] text-accent hover:bg-panel-hover"
                                            onClick={() => setFillDetach(false)}
                                            title="Edit the shared CSS variable instead"
                                        >
                                            Edit token
                                        </button>
                                    </div>
                                ) : null}
                                <ColorRow
                                    cssValue={
                                        fillKey === "color"
                                            ? s.color
                                            : /gradient\(/i.test(s.backgroundImage || "")
                                              ? s.backgroundImage
                                              : s.backgroundColor
                                    }
                                    snapToTokens={!(fillTokenName && !fillDetach)}
                                    onChange={(c) => {
                                        setFillHidden(false);
                                        if (fillTokenName && !fillDetach) {
                                            patch({}, undefined, false, { [fillTokenName]: c });
                                            return;
                                        }
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
                                    hidden={fillHidden}
                                    onToggleHidden={() => setFillHidden((v) => !v)}
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
                                title="Outline"
                                action={
                                    <IconBtn
                                        title="Remove outline"
                                        onClick={() => patch({ borderStyle: "none", borderWidth: "0px" })}
                                    >
                                        <Icon icon={RiSubtractLine} />
                                    </IconBtn>
                                }
                            >
                                <div className="flex gap-2">
                                    <PxInput
                                        glyph={<Glyph>S</Glyph>}
                                        title="Thickness"
                                        value={parsePx(s.borderWidth) ?? 0}
                                        onCommit={(n) =>
                                            patch({
                                                borderWidth: px(n),
                                                borderStyle:
                                                    n === 0
                                                        ? "none"
                                                        : s.borderStyle === "none"
                                                          ? "solid"
                                                          : s.borderStyle,
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
                                            patch({
                                                borderStyle: v,
                                                borderWidth: s.borderWidth === "0px" ? "1px" : s.borderWidth,
                                            })
                                        }
                                    />
                                </div>
                                <ColorRow
                                    cssValue={s.borderColor}
                                    onChange={(c) =>
                                        patch({
                                            borderColor: c,
                                            borderStyle: s.borderStyle === "none" ? "solid" : s.borderStyle,
                                        })
                                    }
                                    onRemove={() => patch({ borderStyle: "none", borderWidth: "0px" })}
                                />
                            </Section>
                        ) : (
                            <AddHeader
                                title="Outline"
                                onAdd={() =>
                                    patch({ borderStyle: "solid", borderWidth: "1px", borderColor: "#000000" })
                                }
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
                            colors={[
                                ...(hasFill
                                    ? [
                                          fillKey === "color"
                                              ? s.color
                                              : /gradient\(/i.test(s.backgroundImage || "")
                                                ? ""
                                                : s.backgroundColor,
                                      ].filter(Boolean)
                                    : []),
                                ...(hasStroke ? [s.borderColor] : []),
                                ...effects
                                    .filter((e) => e.color && !e.hidden)
                                    .map((e) => e.color!)
                                    .filter(Boolean),
                            ]}
                            onPick={(c) => {
                                setFillHidden(false);
                                if (fillKey === "color") patch({ color: c });
                                else patch({ backgroundColor: c, backgroundImage: "none" });
                            }}
                        />

                        <ExportSection />
                    </>
                )}
            </div>
            <div className="flex h-12 shrink-0 items-center gap-2 border-t border-border-subtle px-3">
                <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
                    {pending.length ? designPendingCountLabel(pending.length) : null}
                </span>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    title="Reset"
                    onClick={() => {
                        bridge?.reset();
                        clearDesignPending();
                        clearHistory();
                    }}
                >
                    Reset
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

"use client";

import {
    RiAlignCenter,
    RiAlignJustify,
    RiAlignLeft,
    RiAlignRight,
    RiAlignTop,
    RiAlignBottom,
    RiAlignVertically,
    RiArrowDownLine,
    RiArrowDownSLine,
    RiArrowGoBackLine,
    RiArrowGoForwardLine,
    RiArrowRightLine,
    RiArrowUpDownLine,
    RiCheckboxBlankLine,
    RiCheckboxLine,
    RiCodeLine,
    RiContrastDropLine,
    RiDeleteBinLine,
    RiExpandDiagonalLine,
    RiExpandHeightLine,
    RiExpandWidthLine,
    RiEyeLine,
    RiEyeOffLine,
    RiFocusLine,
    RiFontSize,
    RiLayoutRowLine,
    RiMoreLine,
    RiResetRightLine,
    RiShadowLine,
    RiSpace,
    RiSubtractLine,
    RiTextSpacing,
    RiTextWrap,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll";
import { cn } from "@/lib/utils";
import type { DesignElementSnapshot } from "../bridge";
import { DESIGN_DEVICES, type DesignDevice } from "../devices";
import {
    parseBoxShadow,
    parseCssFunctions,
    serializeBoxShadow,
    serializeCssFunctions,
    type CssFunction,
} from "../css";
import { UserAvatar } from "./avatar";
import { ColorField, FillControls } from "./color";
import { ExportBlock, FilterStack } from "./filters";
import {
    CONTROL,
    Field,
    IconButton,
    RangeField,
    Segment,
    SelectField,
} from "./field";
import { FontField, WeightField } from "./font";
import { FormatMenu } from "./format";
import { FlexAlignmentGrid } from "./layout";
import { DesignComponentOptions, type ComponentOptionPatch } from "./options";
import { PanelSection } from "./section";
import { css, type Styles, type ThemeToken } from "./types";

function FrameSizeMenu({
    device,
    onDeviceChange,
}: {
    device: DesignDevice;
    onDeviceChange: (device: DesignDevice) => void;
}) {
    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger>Frame size</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">
                {(["Phone", "Tablet", "Desktop"] as const).map((group) => (
                    <div key={group}>
                        <DropdownMenuLabel>{group}</DropdownMenuLabel>
                        {DESIGN_DEVICES.filter((item) => item.group === group).map((item) => (
                            <DropdownMenuItem key={item.id} onClick={() => onDeviceChange(item)}>
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                <span className="text-xs text-text-muted">
                                    {item.width === "fluid" ? "Fluid" : `${item.width}×${item.height}`}
                                </span>
                            </DropdownMenuItem>
                        ))}
                    </div>
                ))}
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    );
}

export function DesignStylePanel({
    element,
    source,
    previewUrl,
    zoom,
    onZoomChange,
    device,
    onDeviceChange,
    onUndo,
    onRedo,
    onPreview,
    onCommit,
    onOpenSource,
    onAlign,
    onDuplicate,
    onDelete,
    onExport,
    themeTokens = [],
    className,
    onComponentPatch,
    onCommitText: _onCommitText,
    onCommitAttr,
    onCreateToken,
    chrome = true,
}: {
    element: DesignElementSnapshot | null;
    source: { file: string; line: number } | null;
    previewUrl: string | null;
    zoom: number;
    onZoomChange: (zoom: number) => void;
    device: DesignDevice;
    onDeviceChange: (device: DesignDevice) => void;
    onUndo: () => void;
    onRedo: () => void;
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
    onOpenSource: () => void;
    onAlign: (alignment: "center" | "center-x" | "center-y") => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onExport: (scale: number, format: string) => Promise<void>;
    themeTokens?: ThemeToken[];
    className?: string;
    onComponentPatch?: (patch: ComponentOptionPatch) => void;
    onCommitText?: (text: string) => void;
    onCommitAttr?: (name: string, value: string) => void;
    onCreateToken?: (name: string, value: string) => void | Promise<void>;
    chrome?: boolean;
}) {
    const style = element?.styles ?? {};
    const setStyle = (property: string, value: string) => {
        onPreview({ [property]: value });
        onCommit({ [property]: value });
    };
    const textual = Boolean(
        element
        && (/^(a|button|h1|h2|h3|h4|h5|h6|label|li|p|span|strong|em)$/i.test(element.tag)
            || element.text.trim()),
    );
    const href = element?.attributes?.href || element?.attributes?.to || "";
    const filterFunctions = parseCssFunctions(css(style, "filter", "none"));
    const boxShadow = parseBoxShadow(css(style, "box-shadow", "none"));
    const hasShadow = boxShadow != null;
    const composeShadow = (part: "x" | "y" | "blur" | "color", value: string) =>
        serializeBoxShadow(
            boxShadow ?? { x: "0px", y: "2px", blur: "3px", spread: "0px", color: "#00000033", inset: false },
            part,
            value,
        );
    const writeFilters = (property: "filter" | "backdrop-filter", items: CssFunction[]) => {
        const next = serializeCssFunctions(items);
        onPreview({ [property]: next });
        onCommit({ [property]: next });
    };

    if (!element) {
        return (
            <aside className={cn("flex h-full min-w-0 flex-col bg-surface-3", className)}>
                <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-border px-2">
                    <IconButton label="Undo" icon={RiArrowGoBackLine} onClick={onUndo} />
                    <IconButton label="Redo" icon={RiArrowGoForwardLine} onClick={onRedo} />
                    <div className="ml-auto" />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="xs"
                                className="px-2 text-sm font-semibold tabular-nums"
                            >
                                {zoom}%
                                <Icon icon={RiArrowDownSLine} size={ICON_SIZE_SM} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-24">
                            {[50, 67, 75, 80, 90, 100, 125, 150].map((value) => (
                                <DropdownMenuItem key={value} onClick={() => onZoomChange(value)}>
                                    {value}%
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" icon={RiMoreLine} aria-label="Canvas menu" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <FrameSizeMenu device={device} onDeviceChange={onDeviceChange} />
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                    <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-surface-3 text-sm text-text-muted">
                        –
                    </div>
                    <p className="text-sm font-medium text-text-primary">Nothing selected</p>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">
                        Select an element on the page.
                    </p>
                </div>
            </aside>
        );
    }

    return (
        <aside className={cn("flex h-full min-w-0 flex-col bg-panel", className)}>
            {chrome ? (
            <div className="shrink-0 px-3 pb-2.5 pt-2.5">
                <div className="mb-1.5 flex h-6 items-center gap-0.5">
                    <IconButton label="Undo" icon={RiArrowGoBackLine} onClick={onUndo} />
                    <IconButton label="Redo" icon={RiArrowGoForwardLine} onClick={onRedo} />
                    <UserAvatar />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="xs"
                                className="ml-auto px-2 text-sm font-semibold tabular-nums"
                            >
                                {zoom}%
                                <Icon icon={RiArrowDownSLine} size={ICON_SIZE_SM} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-24">
                            {[50, 67, 75, 80, 90, 100, 125, 150].map((value) => (
                                <DropdownMenuItem key={value} onClick={() => onZoomChange(value)}>
                                    {value}%
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" icon={RiMoreLine} aria-label="Selection menu" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <FrameSizeMenu device={device} onDeviceChange={onDeviceChange} />
                            <DropdownMenuItem onClick={onDuplicate}>Duplicate element</DropdownMenuItem>
                            <DropdownMenuItem onClick={onOpenSource} disabled={!source}>Open source</DropdownMenuItem>
                            <DropdownMenuItem onClick={onDelete} className="text-error">
                                Delete element
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        if (previewUrl) void navigator.clipboard.writeText(previewUrl);
                    }}
                    className={cn(CONTROL, "w-full bg-panel-hover text-text-primary")}
                >
                    Copy link
                    <span className="ml-1.5 font-medium text-sm text-text-muted">Ctrl + L</span>
                </Button>
            </div>
            ) : null}

            <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                <div className="pb-40">
                    {onComponentPatch && element.component ? (
                        <DesignComponentOptions
                            element={element}
                            onPatch={onComponentPatch}
                            onOpenSource={onOpenSource}
                        />
                    ) : null}
                    {textual ? (
                        <PanelSection
                            title="Text"
                            action={
                                <FormatMenu
                                    style={style}
                                    setStyle={setStyle}
                                    onPreview={onPreview}
                                    onCommit={onCommit}
                                />
                            }
                        >
                            {element.tag === "a" && onCommitAttr ? (
                                <label className="flex min-h-8 items-center gap-2">
                                    <span className="w-18 shrink-0 text-xs text-text-muted">Link</span>
                                    <input
                                        className={cn(CONTROL, "min-w-0 flex-1 rounded-md border border-border bg-panel-hover px-2")}
                                        defaultValue={href}
                                        onBlur={(event) => {
                                            const next = event.target.value;
                                            if (next !== href) onCommitAttr("href", next);
                                        }}
                                    />
                                </label>
                            ) : null}
                            <div className="flex gap-1">
                                <FontField
                                    value={css(style, "font-family").split(",")[0]?.replace(/['"]/g, "") || "System Sans-Serif"}
                                    onChange={(value) => setStyle("font-family", value === "System Sans-Serif" ? "system-ui, sans-serif" : value)}
                                />
                            </div>
                            <WeightField
                                value={style["font-weight"]}
                                onChange={(value) => setStyle("font-weight", value)}
                            />
                            <div className="flex gap-2">
                                <Field icon={RiFontSize} value={style["font-size"]} property="font-size" onPreview={onPreview} onCommit={onCommit} />
                                <Field icon={RiArrowUpDownLine} value={style["line-height"]} property="line-height" onPreview={onPreview} onCommit={onCommit} />
                                <Field icon={RiTextSpacing} value={style["letter-spacing"]} property="letter-spacing" onPreview={onPreview} onCommit={onCommit} />
                            </div>
                            <div className="flex gap-1">
                                <Segment
                                    value={style["text-align"] || "left"}
                                    onChange={(value) => setStyle("text-align", value)}
                                    items={[
                                        { value: "left", icon: RiAlignLeft, title: "Align left" },
                                        { value: "center", icon: RiAlignCenter, title: "Align center" },
                                        { value: "right", icon: RiAlignRight, title: "Align right" },
                                    ]}
                                />
                                <Segment
                                    value={
                                        style["align-items"] === "flex-end" || style["vertical-align"] === "bottom"
                                            ? "bottom"
                                            : style["align-items"] === "center" || style["vertical-align"] === "middle"
                                              ? "middle"
                                              : "top"
                                    }
                                    onChange={(value) => {
                                        const align =
                                            value === "bottom"
                                                ? "flex-end"
                                                : value === "middle"
                                                  ? "center"
                                                  : "flex-start";
                                        const vertical =
                                            value === "bottom" ? "bottom" : value === "middle" ? "middle" : "top";
                                        onPreview({ "align-items": align, "vertical-align": vertical });
                                        onCommit({ "align-items": align, "vertical-align": vertical });
                                    }}
                                    items={[
                                        { value: "top", icon: RiAlignTop, title: "Align top" },
                                        { value: "middle", icon: RiAlignVertically, title: "Align middle" },
                                        { value: "bottom", icon: RiAlignBottom, title: "Align bottom" },
                                    ]}
                                />
                            </div>
                        </PanelSection>
                    ) : null}
                    <PanelSection
                        title="Layout"
                        action={
                            <IconButton label="Fit view" icon={RiExpandDiagonalLine} />
                        }
                    >
                        <div className="flex h-6 items-stretch gap-2 mb-4">
                            <Field label="X" value={`${Math.round(element.rect.x)}`} property="left" onPreview={onPreview} onCommit={onCommit} />
                            <Field label="Y" value={`${Math.round(element.rect.y)}`} property="top" onPreview={onPreview} onCommit={onCommit} />
                            <Field icon={RiResetRightLine} value="0deg" property="rotate" onPreview={onPreview} onCommit={onCommit} />
                        </div>
                        <div className="flex h-6 items-stretch gap-2">
                            <Field label="W" value={style.width} property="width" onPreview={onPreview} onCommit={onCommit} />
                            <Field label="H" value={style.height} property="height" onPreview={onPreview} onCommit={onCommit} />
                            <div
                                role="group"
                                className={cn(
                                    CONTROL,
                                    "flex min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-panel-hover",
                                )}
                            >
                                {(
                                    [
                                        ["center", RiFocusLine, "Center in parent"],
                                        ["center-x", RiAlignCenter, "Center horizontally"],
                                        ["center-y", RiAlignVertically, "Center vertically"],
                                    ] as const
                                ).map(([alignment, icon, title], index) => (
                                    <button
                                        key={alignment}
                                        type="button"
                                        title={title}
                                        aria-label={title}
                                        onClick={() => onAlign(alignment)}
                                        className={cn(
                                            "flex h-full min-w-0 flex-1 items-center justify-center text-text-secondary hover:bg-panel-active/60 hover:text-text-primary",
                                            index > 0 && "border-l border-border",
                                        )}
                                    >
                                        <Icon icon={icon} size={ICON_SIZE_SM} />
                                    </button>
                                ))}
                            </div>
                        </div>
                        {style.display !== "flex" ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStyle("display", "flex")}
                                className={cn(CONTROL, "w-full mt-4 bg-panel-hover text-text-primary")}
                            >
                                Wrap in flex
                                <span className="ml-1.5 font-medium text-sm text-text-muted">Shift + A</span>
                            </Button>
                        ) : (
                            <>
                                <div className="flex h-8 items-center mt-4">
                                    <span className="text-xs font-medium text-text-primary">Flex</span>
                                    <span className="ml-auto">
                                        <IconButton
                                            label="Remove flex"
                                            icon={RiSubtractLine}
                                            onClick={() => setStyle("display", "block")}
                                        />
                                    </span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <FlexAlignmentGrid
                                        justify={style["justify-content"]}
                                        align={style["align-items"]}
                                        direction={style["flex-direction"]}
                                        onChange={(justify, align) => {
                                            onPreview({
                                                "justify-content": justify,
                                                "align-items": align,
                                            });
                                            onCommit({
                                                "justify-content": justify,
                                                "align-items": align,
                                            });
                                        }}
                                    />
                                    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_28px] items-center gap-1">
                                        <Segment
                                            value={
                                                style["flex-direction"] === "column"
                                                    ? "column"
                                                    : "row"
                                            }
                                            onChange={(value) => setStyle("flex-direction", value)}
                                            items={[
                                                { value: "column", icon: RiArrowDownLine, title: "Column" },
                                                { value: "row", icon: RiArrowRightLine, title: "Row" },
                                            ]}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            icon={RiTextWrap}
                                            aria-label="Wrap"
                                            selected={style["flex-wrap"] !== "nowrap"}
                                            onClick={() =>
                                                setStyle(
                                                    "flex-wrap",
                                                    style["flex-wrap"] === "nowrap" ? "wrap" : "nowrap",
                                                )
                                            }
                                        />
                                        <Field
                                            icon={RiSpace}
                                            value={style.gap}
                                            property="gap"
                                            onPreview={onPreview}
                                            onCommit={onCommit}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            icon={RiAlignJustify}
                                            aria-label="Space between"
                                            selected={style["justify-content"] === "space-between"}
                                            onClick={() =>
                                                setStyle(
                                                    "justify-content",
                                                    style["justify-content"] === "space-between"
                                                        ? "flex-start"
                                                        : "space-between",
                                                )
                                            }
                                        />
                                    </div>
                                </div>
                                <div className="flex h-6 items-stretch gap-1">
                                    <Field
                                        icon={RiExpandWidthLine}
                                        value={style["padding-left"] || style["padding-right"] || "0px"}
                                        property="padding-left"
                                        mapValue={(value) => value}
                                        onPreview={(styles) => {
                                            onPreview({
                                                "padding-left": styles["padding-left"] ?? "0px",
                                                "padding-right": styles["padding-left"] ?? "0px",
                                            });
                                        }}
                                        onCommit={(styles) => {
                                            onCommit({
                                                "padding-left": styles["padding-left"] ?? "0px",
                                                "padding-right": styles["padding-left"] ?? "0px",
                                            });
                                        }}
                                    />
                                    <Field
                                        icon={RiExpandHeightLine}
                                        value={style["padding-top"] || style["padding-bottom"] || "0px"}
                                        property="padding-top"
                                        onPreview={(styles) => {
                                            onPreview({
                                                "padding-top": styles["padding-top"] ?? "0px",
                                                "padding-bottom": styles["padding-top"] ?? "0px",
                                            });
                                        }}
                                        onCommit={(styles) => {
                                            onCommit({
                                                "padding-top": styles["padding-top"] ?? "0px",
                                                "padding-bottom": styles["padding-top"] ?? "0px",
                                            });
                                        }}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        icon={RiExpandDiagonalLine}
                                        aria-label="Equal padding"
                                        onClick={() => {
                                            const next = style["padding-left"] || "0px";
                                            onPreview({
                                                "padding-top": next,
                                                "padding-right": next,
                                                "padding-bottom": next,
                                                "padding-left": next,
                                            });
                                            onCommit({
                                                "padding-top": next,
                                                "padding-right": next,
                                                "padding-bottom": next,
                                                "padding-left": next,
                                            });
                                        }}
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    icon={style.overflow === "hidden" ? RiCheckboxLine : RiCheckboxBlankLine}
                                    onClick={() =>
                                        setStyle(
                                            "overflow",
                                            style.overflow === "hidden" ? "visible" : "hidden",
                                        )
                                    }
                                    selected={style.overflow === "hidden"}
                                    className="h-8 hover:bg-transparent active:bg-transparent justify-start px-0 text-xs mt-2 w-full"
                                >
                                    Clip content
                                    <span className="ml-auto font-normal text-text-muted">Alt + C</span>
                                </Button>
                            </>
                        )}
                    </PanelSection>

                    <PanelSection title="Radius">
                        <RangeField value={style["border-radius"]} property="border-radius" onPreview={onPreview} onCommit={onCommit} max={100} />
                    </PanelSection>

                    <PanelSection
                        title="Blending"
                        action={
                            <IconButton
                                label="Toggle visibility"
                                icon={Number.parseFloat(style.opacity) === 0 ? RiEyeOffLine : RiEyeLine}
                                active={Number.parseFloat(style.opacity || "1") > 0}
                                onClick={() => {
                                    const current = Number.parseFloat(style.opacity);
                                    const hidden = Number.isFinite(current) && current === 0;
                                    setStyle("opacity", hidden ? "1" : "0");
                                }}
                            />
                        }
                    >
                        <div className="flex items-stretch gap-1">
                            <Field
                                icon={RiContrastDropLine}
                                value={`${Math.round((Number.parseFloat(style.opacity) || 1) * 100)}`}
                                property="opacity"
                                suffix="%"
                                mapValue={(value) => {
                                    const next = Number.parseFloat(value);
                                    if (!Number.isFinite(next)) return style.opacity || "1";
                                    return String(Math.max(0, Math.min(100, next)) / 100);
                                }}
                                onPreview={onPreview}
                                onCommit={onCommit}
                            />
                            <SelectField
                                icon={RiContrastDropLine}
                                value={style["mix-blend-mode"] || "normal"}
                                options={[
                                    ["normal", "Normal"],
                                    ["multiply", "Multiply"],
                                    ["screen", "Screen"],
                                    ["overlay", "Overlay"],
                                    ["darken", "Darken"],
                                    ["lighten", "Lighten"],
                                    ["difference", "Difference"],
                                ]}
                                onChange={(value) => setStyle("mix-blend-mode", value)}
                            />
                        </div>
                    </PanelSection>

                    <PanelSection title="Fill" add>
                        <FillControls
                            style={style}
                            setStyle={setStyle}
                            themeTokens={themeTokens}
                            paint={
                                /^(a|h1|h2|h3|h4|h5|h6|label|li|p|span|strong|em)$/i.test(element.tag)
                                    ? "color"
                                    : "background"
                            }
                            onCreateToken={onCreateToken}
                            onPreview={onPreview}
                            onCommit={onCommit}
                        />
                    </PanelSection>

                    {textual ? (
                        <PanelSection
                            title="Underline"
                            add
                            open={style["text-decoration-line"] === "underline"}
                            onAdd={() => setStyle("text-decoration-line", "underline")}
                        >
                            {style["text-decoration-line"] === "underline" ? (
                                <>
                                    <div className="flex gap-2">
                                        <Field icon={RiSubtractLine} value="1px" property="text-decoration-thickness" onPreview={onPreview} onCommit={onCommit} />
                                        <Field icon={RiArrowDownLine} value="auto" property="text-underline-offset" onPreview={onPreview} onCommit={onCommit} />
                                    </div>
                                    <ColorField
                                        value={style["text-decoration-color"] || style.color}
                                        property="text-decoration-color"
                                        themeTokens={themeTokens}
                                        onCreateToken={onCreateToken}
                                        onPreview={onPreview}
                                        onCommit={onCommit}
                                    />
                                </>
                            ) : null}
                        </PanelSection>
                    ) : null}

                    <PanelSection title="Stroke" add>
                        <div className="flex gap-2">
                            <Field icon={RiSubtractLine} value={style["border-top-width"]} property="border-width" onPreview={onPreview} onCommit={onCommit} />
                            <SelectField icon={RiLayoutRowLine} value={style["border-style"]} options={["none", "solid", "dashed", "dotted", "double"]} onChange={(value) => setStyle("border-style", value)} />
                        </div>
                        <ColorField
                            value={style["border-color"]}
                            property="border-color"
                            themeTokens={themeTokens}
                            onCreateToken={onCreateToken}
                            onPreview={onPreview}
                            onCommit={onCommit}
                        />
                    </PanelSection>

                    <PanelSection
                        title="Shadow"
                        add
                        open={hasShadow}
                        onAdd={() => {
                            if (!hasShadow) setStyle("box-shadow", "0px 2px 3px 0px #00000033");
                        }}
                    >
                        {hasShadow ? (
                            <>
                                <div className="flex h-8 items-stretch gap-1">
                                    <Field label="X" value={boxShadow?.x} property="box-shadow" mapValue={(value) => composeShadow("x", value)} onPreview={onPreview} onCommit={onCommit} />
                                    <Field label="Y" value={boxShadow?.y} property="box-shadow" mapValue={(value) => composeShadow("y", value)} onPreview={onPreview} onCommit={onCommit} />
                                    <Field icon={RiShadowLine} value={boxShadow?.blur} property="box-shadow" mapValue={(value) => composeShadow("blur", value)} onPreview={onPreview} onCommit={onCommit} />
                                    <IconButton
                                        label="Remove shadow"
                                        icon={RiSubtractLine}
                                        onClick={() => setStyle("box-shadow", "none")}
                                    />
                                </div>
                                <ColorField
                                    value={boxShadow?.color}
                                    property="box-shadow"
                                    themeTokens={themeTokens}
                                    onCreateToken={onCreateToken}
                                    mapValue={(value) => composeShadow("color", value)}
                                    onPreview={onPreview}
                                    onCommit={onCommit}
                                />
                            </>
                        ) : null}
                    </PanelSection>

                    <PanelSection
                        title="Filters"
                        add
                        open={filterFunctions.length > 0}
                        onAdd={() =>
                            writeFilters("filter", [
                                ...filterFunctions,
                                { type: "blur", amount: "4px" },
                            ])
                        }
                    >
                        {filterFunctions.length ? (
                            <FilterStack
                                property="filter"
                                items={filterFunctions}
                                onPreview={onPreview}
                                onCommit={onCommit}
                            />
                        ) : null}
                    </PanelSection>

                    <ExportBlock onExport={onExport} />

                    <PanelSection title="Element" defaultOpen={false}>
                        <div className="grid grid-cols-[58px_minmax(0,1fr)] gap-y-2 text-xs">
                            <span className="text-text-muted">Tag</span>
                            <span className="truncate text-text-primary">{element.tag}</span>
                            <span className="text-text-muted">ID</span>
                            <span className="truncate text-text-primary">{element.id || "None"}</span>
                            <span className="text-text-muted">Class</span>
                            <span className="truncate text-text-primary">{element.classes.join(" ") || "None"}</span>
                            <span className="text-text-muted">Source</span>
                            <span className="truncate text-text-primary">
                                {source ? `${source.file}:${source.line}` : "Preview only"}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" size="xs" icon={RiCodeLine} className={cn(CONTROL, "flex-1")} onClick={onOpenSource} disabled={!source}>
                                Open source
                            </Button>
                            <Button variant="ghost" size="icon" icon={RiDeleteBinLine} aria-label="Delete element" onClick={onDelete} />
                        </div>
                    </PanelSection>
                </div>
            </ScrollArea>
        </aside>
    );
}

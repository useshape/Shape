"use client";

import {
    RiArrowDownSLine,
    RiCodeLine,
    RiCursorLine,
    RiDeleteBinLine,
    RiInformationLine,
    RiMoreLine,
} from "@remixicon/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { DesignElementSnapshot } from "./bridge";

type Styles = Record<string, string>;

function CompactSelect({
    value,
    options,
    onChange,
}: {
    value: string;
    options: string[];
    onChange: (value: string) => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="secondary"
                    size="xs"
                    className="h-7 min-w-0 flex-1 justify-between bg-input-bg px-2 font-normal"
                >
                    <span className="truncate">{value || "—"}</span>
                    <Icon icon={RiArrowDownSLine} size={12} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-36">
                {options.map((option) => (
                    <DropdownMenuItem key={option} onClick={() => onChange(option)}>
                        {option}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function StyleRow({
    label,
    children,
    changed,
}: {
    label: string;
    children: React.ReactNode;
    changed?: boolean;
}) {
    return (
        <div className="grid min-h-8 grid-cols-[78px_minmax(0,1fr)] items-center gap-2 px-3 py-0.5">
            <span className={cn("truncate text-xs text-text-muted", changed && "text-accent")}>{label}</span>
            <div className="flex min-w-0 items-center gap-1">{children}</div>
        </div>
    );
}

function ValueInput({
    value,
    property,
    onPreview,
    onCommit,
    placeholder = "Auto",
    type = "text",
}: {
    value: string;
    property: string;
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
    placeholder?: string;
    type?: "text" | "color";
}) {
    const [draft, setDraft] = useState(value);
    if (type === "color") {
        const color = /^#[0-9a-f]{6}$/i.test(draft) ? draft : "#000000";
        return (
            <div className="flex h-7 min-w-0 flex-1 items-center rounded-md bg-input-bg px-1.5">
                <input
                    type="color"
                    value={color}
                    onChange={(event) => {
                        setDraft(event.target.value);
                        onPreview({ [property]: event.target.value });
                    }}
                    onBlur={() => onCommit({ [property]: draft })}
                    className="size-4 cursor-pointer border-0 bg-transparent p-0"
                    aria-label={property}
                />
                <input
                    value={draft}
                    onChange={(event) => {
                        setDraft(event.target.value);
                        onPreview({ [property]: event.target.value });
                    }}
                    onBlur={() => onCommit({ [property]: draft })}
                    className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-xs text-text-primary outline-none"
                    spellCheck={false}
                />
            </div>
        );
    }
    return (
        <input
            value={draft}
            onChange={(event) => {
                setDraft(event.target.value);
                onPreview({ [property]: event.target.value });
            }}
            onBlur={() => draft !== value && onCommit({ [property]: draft })}
            onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
            }}
            placeholder={placeholder}
            spellCheck={false}
            className="h-7 min-w-0 flex-1 rounded-md bg-input-bg px-2 text-xs text-text-primary outline-none placeholder:text-text-muted focus:ring-1 focus:ring-border-focus"
        />
    );
}

function Segmented({
    value,
    values,
    property,
    onPreview,
    onCommit,
}: {
    value: string;
    values: Array<{ value: string; label: string }>;
    property: string;
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
}) {
    return (
        <div className="flex min-w-0 flex-1 rounded-md bg-input-bg p-0.5">
            {values.map((item) => (
                <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                        onPreview({ [property]: item.value });
                        onCommit({ [property]: item.value });
                    }}
                    className={cn(
                        "h-6 min-w-0 flex-1 rounded px-1 text-2xs text-text-muted hover:text-text-primary",
                        value === item.value && "bg-panel-active text-text-primary",
                    )}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}

export function DesignStylePanel({
    element,
    source,
    onPreview,
    onCommit,
    onOpenSource,
    onDuplicate,
    onDelete,
}: {
    element: DesignElementSnapshot | null;
    source: { file: string; line: number } | null;
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
    onOpenSource: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}) {
    const style = element?.styles ?? {};
    const disabled = !element;
    const choose = (property: string, options: string[]) => (
        <CompactSelect
            value={style[property] ?? ""}
            options={options}
            onChange={(value) => {
                onPreview({ [property]: value });
                onCommit({ [property]: value });
            }}
        />
    );

    return (
        <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-panel">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
                <div className="flex size-5 items-center justify-center rounded bg-accent text-2xs font-semibold text-accent-fg">
                    {element?.tag.slice(0, 1).toUpperCase() ?? "–"}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-text-primary">
                        {element ? `${element.tag}${element.id ? `#${element.id}` : ""}` : "No selection"}
                    </div>
                    <button
                        type="button"
                        onClick={onOpenSource}
                        className="block max-w-full truncate text-left text-2xs text-text-muted hover:text-text-primary"
                    >
                        {source ? `${source.file}:${source.line}` : "Select an element on the canvas"}
                    </button>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Selection menu">
                            <Icon icon={RiMoreLine} size={ICON_SIZE_SM} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={onDuplicate}>Duplicate element</DropdownMenuItem>
                        <DropdownMenuItem onClick={onOpenSource}>Open source</DropdownMenuItem>
                        <DropdownMenuItem onClick={onDelete} className="text-error">
                            Delete element
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <Tabs defaultValue="style" className="relative flex min-h-0 flex-1 flex-col">
                {disabled ? (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-panel px-8 text-center">
                        <div className="mb-3 flex size-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-text-muted">
                            <Icon icon={RiCursorLine} />
                        </div>
                        <p className="text-xs font-medium text-text-primary">Nothing selected</p>
                        <p className="mt-1 text-xs leading-relaxed text-text-muted">
                            Select an element on the canvas or in Layers to inspect and edit it.
                        </p>
                    </div>
                ) : null}
                <TabsList className="mx-2 mt-1.5 grid h-7 shrink-0 grid-cols-3">
                    <TabsTrigger value="style" className="text-xs">Style</TabsTrigger>
                    <TabsTrigger value="settings" className="text-xs">Settings</TabsTrigger>
                    <TabsTrigger value="interactions" className="text-xs">Motion</TabsTrigger>
                </TabsList>

                <TabsContent value="style" className="mt-1 min-h-0 flex-1">
                    <ScrollArea className={cn("h-full", disabled && "pointer-events-none opacity-45")} fadeFrom="from-panel">
                        <CollapsibleSection title="Layout" defaultOpen>
                            <div className="pb-2">
                                <StyleRow label="Display">
                                    <Segmented
                                        value={style.display}
                                        property="display"
                                        values={[
                                            { value: "block", label: "Block" },
                                            { value: "flex", label: "Flex" },
                                            { value: "grid", label: "Grid" },
                                            { value: "none", label: "None" },
                                        ]}
                                        onPreview={onPreview}
                                        onCommit={onCommit}
                                    />
                                </StyleRow>
                                {style.display === "flex" ? (
                                    <>
                                        <StyleRow label="Direction">{choose("flex-direction", ["row", "column", "row-reverse", "column-reverse"])}</StyleRow>
                                        <StyleRow label="Wrap">{choose("flex-wrap", ["nowrap", "wrap", "wrap-reverse"])}</StyleRow>
                                        <StyleRow label="Justify">{choose("justify-content", ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"])}</StyleRow>
                                        <StyleRow label="Align">{choose("align-items", ["stretch", "flex-start", "center", "flex-end", "baseline"])}</StyleRow>
                                    </>
                                ) : null}
                                {style.display === "grid" ? (
                                    <>
                                        <StyleRow label="Columns"><ValueInput property="grid-template-columns" value={style["grid-template-columns"]} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                        <StyleRow label="Rows"><ValueInput property="grid-template-rows" value={style["grid-template-rows"]} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                    </>
                                ) : null}
                                <StyleRow label="Gap"><ValueInput property="gap" value={style.gap} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                <StyleRow label="Overflow">{choose("overflow", ["visible", "hidden", "clip", "auto", "scroll"])}</StyleRow>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Spacing" defaultOpen>
                            <div className="px-3 pb-3 pt-1">
                                <div className="rounded-lg border border-border bg-surface-2 p-2">
                                    <div className="mb-1 text-center text-2xs text-text-muted">Margin</div>
                                    <div className="grid grid-cols-4 gap-1">
                                        {["top", "right", "bottom", "left"].map((side) => (
                                            <ValueInput
                                                key={side}
                                                property={`margin-${side}`}
                                                value={style[`margin-${side}`]}
                                                placeholder={side.slice(0, 1).toUpperCase()}
                                                onPreview={onPreview}
                                                onCommit={onCommit}
                                            />
                                        ))}
                                    </div>
                                    <div className="my-2 rounded-md border border-border-subtle bg-panel p-2">
                                        <div className="mb-1 text-center text-2xs text-text-muted">Padding</div>
                                        <div className="grid grid-cols-4 gap-1">
                                            {["top", "right", "bottom", "left"].map((side) => (
                                                <ValueInput
                                                    key={side}
                                                    property={`padding-${side}`}
                                                    value={style[`padding-${side}`]}
                                                    placeholder={side.slice(0, 1).toUpperCase()}
                                                    onPreview={onPreview}
                                                    onCommit={onCommit}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Size" defaultOpen>
                            <div className="pb-2">
                                {[
                                    ["Width", "width"], ["Height", "height"],
                                    ["Min W", "min-width"], ["Min H", "min-height"],
                                    ["Max W", "max-width"], ["Max H", "max-height"],
                                ].map(([label, property]) => (
                                    <StyleRow key={property} label={label}>
                                        <ValueInput property={property} value={style[property]} onPreview={onPreview} onCommit={onCommit} />
                                    </StyleRow>
                                ))}
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Position">
                            <div className="pb-2">
                                <StyleRow label="Type">{choose("position", ["static", "relative", "absolute", "fixed", "sticky"])}</StyleRow>
                                {["top", "right", "bottom", "left", "z-index"].map((property) => (
                                    <StyleRow key={property} label={property}>
                                        <ValueInput property={property} value={style[property]} onPreview={onPreview} onCommit={onCommit} />
                                    </StyleRow>
                                ))}
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Typography" defaultOpen>
                            <div className="pb-2">
                                <StyleRow label="Font"><ValueInput property="font-family" value={style["font-family"]} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                <StyleRow label="Weight">{choose("font-weight", ["100", "200", "300", "400", "500", "600", "700", "800", "900"])}</StyleRow>
                                <StyleRow label="Size"><ValueInput property="font-size" value={style["font-size"]} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                <StyleRow label="Line height"><ValueInput property="line-height" value={style["line-height"]} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                <StyleRow label="Tracking"><ValueInput property="letter-spacing" value={style["letter-spacing"]} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                <StyleRow label="Align">{choose("text-align", ["left", "center", "right", "justify"])}</StyleRow>
                                <StyleRow label="Transform">{choose("text-transform", ["none", "uppercase", "lowercase", "capitalize"])}</StyleRow>
                                <StyleRow label="Color"><ValueInput type="color" property="color" value={style.color} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Fill">
                            <div className="pb-2">
                                <StyleRow label="Color"><ValueInput type="color" property="background-color" value={style["background-color"]} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                <StyleRow label="Image"><ValueInput property="background-image" value={style["background-image"]} onPreview={onPreview} onCommit={onCommit} placeholder="none" /></StyleRow>
                                <StyleRow label="Size">{choose("background-size", ["auto", "cover", "contain"])}</StyleRow>
                                <StyleRow label="Position">{choose("background-position", ["center", "top", "right", "bottom", "left"])}</StyleRow>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Border">
                            <div className="pb-2">
                                <StyleRow label="Width"><ValueInput property="border-width" value={style["border-top-width"]} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                <StyleRow label="Style">{choose("border-style", ["none", "solid", "dashed", "dotted", "double"])}</StyleRow>
                                <StyleRow label="Color"><ValueInput type="color" property="border-color" value={style["border-color"]} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                <StyleRow label="Radius"><ValueInput property="border-radius" value={style["border-radius"]} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Effects">
                            <div className="pb-2">
                                <StyleRow label="Opacity"><ValueInput property="opacity" value={style.opacity} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                <StyleRow label="Shadow"><ValueInput property="box-shadow" value={style["box-shadow"]} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                <StyleRow label="Filter"><ValueInput property="filter" value={style.filter} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                <StyleRow label="Backdrop"><ValueInput property="backdrop-filter" value={style["backdrop-filter"]} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                                <StyleRow label="Blend">{choose("mix-blend-mode", ["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference"])}</StyleRow>
                                <StyleRow label="Transform"><ValueInput property="transform" value={style.transform} onPreview={onPreview} onCommit={onCommit} /></StyleRow>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Advanced">
                            <div className="pb-2">
                                <StyleRow label="Cursor">{choose("cursor", ["auto", "default", "pointer", "grab", "text", "move", "not-allowed"])}</StyleRow>
                                <StyleRow label="Events">{choose("pointer-events", ["auto", "none"])}</StyleRow>
                                <StyleRow label="Visibility">{choose("visibility", ["visible", "hidden", "collapse"])}</StyleRow>
                            </div>
                        </CollapsibleSection>
                    </ScrollArea>
                </TabsContent>

                <TabsContent value="settings" className="mt-1 min-h-0 flex-1">
                    <ScrollArea className="h-full" fadeFrom="from-panel">
                        <CollapsibleSection title="Element" defaultOpen>
                            <div className="py-2">
                                <StyleRow label="Tag"><span className="text-xs text-text-primary">{element?.tag ?? "—"}</span></StyleRow>
                                <StyleRow label="ID"><span className="truncate text-xs text-text-primary">{element?.id ?? "None"}</span></StyleRow>
                                <StyleRow label="Classes"><span className="truncate text-xs text-text-primary">{element?.classes.join(" ") || "None"}</span></StyleRow>
                            </div>
                        </CollapsibleSection>
                        <CollapsibleSection title="Attributes">
                            <div className="py-2">
                                {Object.entries(element?.attributes ?? {}).slice(0, 20).map(([name, value]) => (
                                    <StyleRow key={name} label={name}>
                                        <span className="truncate text-xs text-text-primary">{value || "true"}</span>
                                    </StyleRow>
                                ))}
                            </div>
                        </CollapsibleSection>
                        <CollapsibleSection title="Accessibility" defaultOpen>
                            <div className="px-3 py-3 text-xs leading-relaxed text-text-muted">
                                <div className="mb-2 flex items-center gap-1.5 text-text-primary">
                                    <Icon icon={RiInformationLine} size={ICON_SIZE_SM} />
                                    Semantic source is preserved
                                </div>
                                Alt text, ARIA labels, roles, tab order, and focus behavior are edited as source attributes.
                            </div>
                        </CollapsibleSection>
                    </ScrollArea>
                </TabsContent>

                <TabsContent value="interactions" className="mt-1 min-h-0 flex-1">
                    <ScrollArea className="h-full" fadeFrom="from-panel">
                        <CollapsibleSection title="Transitions" defaultOpen>
                            <div className="pb-2">
                                <StyleRow label="Property"><ValueInput property="transition-property" value={style["transition-property"]} onPreview={onPreview} onCommit={onCommit} placeholder="all" /></StyleRow>
                                <StyleRow label="Duration"><ValueInput property="transition-duration" value={style["transition-duration"]} onPreview={onPreview} onCommit={onCommit} placeholder="200ms" /></StyleRow>
                                <StyleRow label="Easing">{choose("transition-timing-function", ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "cubic-bezier(.16,1,.3,1)"])}</StyleRow>
                            </div>
                        </CollapsibleSection>
                        <CollapsibleSection title="Transforms" defaultOpen>
                            <div className="pb-2">
                                <StyleRow label="Transform"><ValueInput property="transform" value={style.transform} onPreview={onPreview} onCommit={onCommit} placeholder="translate, scale, rotate" /></StyleRow>
                                <StyleRow label="Origin"><ValueInput property="transform-origin" value={style["transform-origin"]} onPreview={onPreview} onCommit={onCommit} placeholder="center" /></StyleRow>
                            </div>
                        </CollapsibleSection>
                        <div className="p-3">
                            <p className="text-xs leading-relaxed text-text-muted">
                                Transition and transform changes are written directly to the selected source element.
                            </p>
                        </div>
                    </ScrollArea>
                </TabsContent>
            </Tabs>

            <div className={cn("flex h-9 shrink-0 items-center gap-1 border-t border-border px-2", disabled && "invisible")}>
                <Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start text-xs" onClick={onOpenSource}>
                    <Icon icon={RiCodeLine} size={ICON_SIZE_SM} />
                    Open source
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete element"
                    className="text-text-muted hover:text-error"
                    onClick={onDelete}
                >
                    <Icon icon={RiDeleteBinLine} size={ICON_SIZE_SM} />
                </Button>
            </div>
        </aside>
    );
}

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import {
    type CssVariable,
    type CssVariableSection,
    CSS_VARIABLE_SECTION_LABELS,
    CSS_VARIABLE_SECTION_ORDER,
    formatVariableDisplayName,
    getCachedGlobalsCssContent,
    isGlobalCssFile,
    normalizeVariableName,
    parseCssVariables,
    resolveCssVariableColor,
} from "@/lib/css-variables";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { ColorPickerPortal, type PickerAnchor } from "../../color-picker/portal";

function VariableRow({
    variable,
    onEditColor,
    onEditValue,
    onRename,
}: {
    variable: CssVariable;
    onEditColor: (v: CssVariable, anchor: PickerAnchor) => void;
    onEditValue: (v: CssVariable, value: string) => void;
    onRename: (v: CssVariable, newName: string) => void;
}) {
    const [valueDraft, setValueDraft] = useState(variable.value);
    const [nameDraft, setNameDraft] = useState(formatVariableDisplayName(variable.name));
    const isColor = variable.kind === "color";
    const swatch = isColor ? resolveCssVariableColor(variable.name) || variable.value : null;

    const commitName = () => {
        const next = normalizeVariableName(nameDraft);
        if (!next || next === variable.name) {
            setNameDraft(formatVariableDisplayName(variable.name));
            return;
        }
        onRename(variable, next);
    };

    return (
        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto] items-center gap-2 px-2 py-1.5">
            <Input
                value={nameDraft}
                className="h-7 text-sm bg-transparent border border-border"
                onChange={(e) => setNameDraft(e.target.value.replace(/^--/, ""))}
                onBlur={commitName}
                onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                        setNameDraft(formatVariableDisplayName(variable.name));
                        (e.target as HTMLInputElement).blur();
                    }
                }}
            />
            {isColor ? (
                <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg bg-transparent border border-border px-2 py-1 text-left text-sm hover:bg-panel-hover min-w-0"
                    onClick={(e) => onEditColor(variable, { x: e.clientX, y: e.clientY })}
                >
                    <span
                        className="h-4 w-4 shrink-0 rounded border border-border"
                        style={{ backgroundColor: swatch ?? "transparent" }}
                    />
                    <span className="truncate text-text-primary">{variable.value}</span>
                </button>
            ) : (
                <Input
                    value={valueDraft}
                    className="h-7 text-sm bg-transparent border border-border"
                    onChange={(e) => setValueDraft(e.target.value)}
                    onBlur={() => {
                        if (valueDraft !== variable.value) onEditValue(variable, valueDraft);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                />
            )}
            <Tooltip content={`Line ${variable.line} · this file only`}>
                <span className="text-2xs text-text-muted tabular-nums">{variable.line}</span>
            </Tooltip>
        </div>
    );
}

export function TokensMenu({ activePath }: { activePath: string | null }) {
    const [content, setContent] = useState("");
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [colorEdit, setColorEdit] = useState<{ variable: CssVariable; anchor: PickerAnchor } | null>(null);

    const enabled = isGlobalCssFile(activePath);

    useEffect(() => {
        if (!enabled || !activePath) return;
        const cached = getCachedGlobalsCssContent();
        if (cached) setContent(cached);
        const handleBuffer = (e: Event) => {
            const detail = (e as CustomEvent<{ path: string; content: string }>).detail;
            if (detail?.path === activePath) setContent(detail.content ?? "");
        };
        window.addEventListener("shape-editor-buffer", handleBuffer as EventListener);
        return () => window.removeEventListener("shape-editor-buffer", handleBuffer as EventListener);
    }, [activePath, enabled]);

    const variables = useMemo(() => (enabled ? parseCssVariables(content) : []), [content, enabled]);

    const filtered = useMemo(() => {
        if (!query.trim()) return variables;
        const q = query.toLowerCase();
        return variables.filter((v) => {
            const display = formatVariableDisplayName(v.name).toLowerCase();
            return display.includes(q) || v.name.toLowerCase().includes(q) || v.value.toLowerCase().includes(q);
        });
    }, [variables, query]);

    const grouped = useMemo(() => {
        const map = new Map<CssVariableSection, CssVariable[]>();
        for (const section of CSS_VARIABLE_SECTION_ORDER) map.set(section, []);
        for (const v of filtered) map.get(v.section)?.push(v);
        return map;
    }, [filtered]);

    const applyVariable = useCallback(
        (name: string, value: string) => {
            if (!activePath) return;
            window.dispatchEvent(
                new CustomEvent("shape-css-variable-update", { detail: { path: activePath, name, value } }),
            );
        },
        [activePath],
    );

    const renameVariable = useCallback(
        (variable: CssVariable, newName: string) => {
            if (!activePath || newName === variable.name) return;
            window.dispatchEvent(
                new CustomEvent("shape-css-variable-rename", { detail: { path: activePath, oldName: variable.name, newName } }),
            );
            if (colorEdit?.variable.name === variable.name) {
                setColorEdit({ ...colorEdit, variable: { ...colorEdit.variable, name: newName } });
            }
        },
        [activePath, colorEdit],
    );

    if (!enabled) return null;

    return (
        <>
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <Tooltip content="Design tokens">
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-text-muted">
                            <Icon name="palette" size={16} />
                        </Button>
                    </DropdownMenuTrigger>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-[440px] p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
                    <div className="flex flex-col max-h-[min(70vh,520px)]">
                        <div className="p-2 space-y-1">
                            <div className="text-xs text-text-muted">Edits apply to this file only</div>
                            <Input
                                value={query}
                                placeholder="Filter variables…"
                                className="h-8 text-sm bg-transparent border-border border"
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                        <div className="overflow-y-auto custom-scrollbar flex-1 py-1">
                            {variables.length === 0 ? (
                                <div className="px-3 py-6 text-sm text-text-muted">No CSS variables found.</div>
                            ) : (
                                CSS_VARIABLE_SECTION_ORDER.map((section) => {
                                    const items = grouped.get(section) ?? [];
                                    if (items.length === 0) return null;
                                    return (
                                        <div key={section} className="mb-2 last:mb-0">
                                            <div className="px-2 py-1 text-xs font-regular text-text-muted">
                                                {CSS_VARIABLE_SECTION_LABELS[section]}
                                            </div>
                                            {items.map((v) => (
                                                <VariableRow
                                                    key={v.name}
                                                    variable={v}
                                                    onEditColor={(variable, anchor) => setColorEdit({ variable, anchor })}
                                                    onEditValue={(variable, value) => applyVariable(variable.name, value)}
                                                    onRename={renameVariable}
                                                />
                                            ))}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>

            {colorEdit && (
                <ColorPickerPortal
                    anchor={colorEdit.anchor}
                    color={resolveCssVariableColor(colorEdit.variable.name) || colorEdit.variable.value}
                    onChange={(next) => applyVariable(colorEdit.variable.name, next)}
                    onClose={() => setColorEdit(null)}
                />
            )}
        </>
    );
}

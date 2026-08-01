"use client";

import React, { useMemo } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { CollapsibleSection } from "@/components/ui/collapsible";
import type { CssVariable } from "@/lib/css-variables";
import {
    CSS_VARIABLE_SECTION_LABELS,
    CSS_VARIABLE_SECTION_ORDER,
    resolveCssVariableColor,
    type CssVariableSection,
} from "@/lib/css-variables";

interface VariablesPaletteProps {
    variables: CssVariable[];
    selectedName?: string | null;
    onSelect: (variable: CssVariable, resolvedColor: string) => void;
}

function resolveSwatchColor(name: string, value: string): string {
    return resolveCssVariableColor(name) || value;
}

function VariableSwatch({
    variable,
    active,
    onSelect,
}: {
    variable: CssVariable;
    active: boolean;
    onSelect: (variable: CssVariable, resolved: string) => void;
}) {
    const swatch = resolveSwatchColor(variable.name, variable.value);
    const label = `${variable.name}: ${variable.value}`;

    return (
        <Tooltip content={label} side="top" delayDuration={150}>
            <button
                type="button"
                className={`h-7 min-w-[2rem] flex-1 rounded-md border border-border-subtle transition-all cursor-pointer ${
                    active
                        ? "ring-2 ring-accent ring-offset-1 ring-offset-surface-3 z-10 scale-105"
                        : "hover:scale-105 hover:z-10 hover:ring-1 hover:ring-border-subtle"
                }`}
                style={{ backgroundColor: swatch }}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect(variable, swatch);
                }}
            />
        </Tooltip>
    );
}

function groupBySection(variables: CssVariable[]): Map<CssVariableSection, CssVariable[]> {
    const groups = new Map<CssVariableSection, CssVariable[]>();
    for (const variable of variables) {
        const section = variable.section ?? "other";
        const list = groups.get(section) ?? [];
        list.push(variable);
        groups.set(section, list);
    }
    for (const [, list] of groups) {
        list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return groups;
}

export function VariablesPalette({ variables, selectedName, onSelect }: VariablesPaletteProps) {
    const colors = useMemo(() => variables.filter((v) => v.kind === "color"), [variables]);
    const groups = useMemo(() => groupBySection(colors), [colors]);

    const orderedSections = useMemo(
        () => CSS_VARIABLE_SECTION_ORDER.filter((section) => (groups.get(section)?.length ?? 0) > 0),
        [groups],
    );

    if (colors.length === 0) {
        return (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-panel-hover px-3 text-xs text-text-muted">
                No color variables found in this project.
            </div>
        );
    }

    return (
        <div className="w-full max-h-[220px] overflow-y-auto custom-scrollbar rounded-lg">
            {orderedSections.map((section, idx) => {
                const items = groups.get(section) ?? [];
                return (
                    <CollapsibleSection
                        key={section}
                        title={CSS_VARIABLE_SECTION_LABELS[section]}
                        defaultOpen={idx < 4}
                        storageKey={`color-var-section-${section}`}
                    >
                        <div className="px-1 pb-2 flex flex-wrap gap-1.5">
                            {items.map((variable) => (
                                <VariableSwatch
                                    key={variable.name}
                                    variable={variable}
                                    active={selectedName === variable.name}
                                    onSelect={onSelect}
                                />
                            ))}
                        </div>
                    </CollapsibleSection>
                );
            })}
        </div>
    );
}

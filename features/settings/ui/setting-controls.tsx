"use client";

import React, { useRef } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/ui/icon";
import { loadCustomEditorFont } from "@/lib/editor/custom-fonts";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";

export function SettingSection({
    id,
    title,
    description,
    children,
}: {
    id?: string;
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <div id={id} className="mb-8 last:mb-0 scroll-mt-3">
            <div className="mb-3">
                <h2 className="text-lg font-medium text-text-primary">{title}</h2>
                {description && <p className="text-sm text-text-muted mt-1">{description}</p>}
            </div>
            <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-panel divide-y divide-border">
                {children}
            </div>
        </div>
    );
}

export function SettingRow({
    title,
    description,
    children,
    stack,
}: {
    title: string;
    description?: string;
    children: React.ReactNode;
    stack?: boolean;
}) {
    if (stack) {
        return (
            <div className="px-3.5 py-3 space-y-2.5">
                <div>
                    <div className="text-sm font-medium text-text-primary">{title}</div>
                    {description && <div className="text-sm text-text-muted mt-1">{description}</div>}
                </div>
                {children}
            </div>
        );
    }

    return (
        <div className="px-3.5 py-3 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text-primary">{title}</div>
                {description && <div className="text-sm text-text-muted mt-1 leading-normal">{description}</div>}
            </div>
            <div className="flex items-center shrink-0">{children}</div>
        </div>
    );
}

export function SettingSelect<T extends string>({
    value,
    options,
    onChange,
    className,
}: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
    className?: string;
}) {
    const label = options.find((o) => o.value === value)?.label ?? value;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="secondary"
                    size="sm"
                    className={cn("min-w-[180px] justify-between gap-2 font-normal", className)}
                >
                    <span className="truncate">{label}</span>
                    <Icon name="expand_more" className="size-icon-sm shrink-0 opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[180px] max-h-[280px] overflow-y-auto custom-scrollbar">
                {options.map((opt) => (
                    <DropdownMenuCheckboxItem
                        key={opt.value}
                        checked={value === opt.value}
                        onCheckedChange={() => onChange(opt.value)}
                    >
                        {opt.label}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function SettingSwitch({
    checked,
    onChange,
    disabled,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) {
    return <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />;
}

export function SettingNumberSelect({
    value,
    options,
    onChange,
    formatLabel,
}: {
    value: number;
    options: number[];
    onChange: (v: number) => void;
    formatLabel?: (n: number) => string;
}) {
    const fmt = formatLabel ?? ((n: number) => String(n));
    const allValues = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
    const selectOptions = allValues.map((n) => ({ value: String(n), label: fmt(n) }));

    return (
        <SettingSelect
            value={String(value)}
            options={selectOptions}
            onChange={(v) => onChange(Number(v))}
        />
    );
}

export const EDITOR_FONT_PRESETS = [
    { value: "'IBM Plex Mono', 'Cascadia Code', Consolas, monospace", label: "IBM Plex Mono" },
    { value: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace", label: "Cascadia Code" },
    { value: "'JetBrains Mono', Consolas, monospace", label: "JetBrains Mono" },
    { value: "'Fira Code', Consolas, monospace", label: "Fira Code" },
    { value: "Consolas, 'Courier New', monospace", label: "Consolas" },
    { value: "'Source Code Pro', Consolas, monospace", label: "Source Code Pro" },
] as const;

export const TERMINAL_FONT_PRESETS = [
    { value: "'IBM Plex Mono', Consolas, monospace", label: "IBM Plex Mono" },
    { value: "'Cascadia Mono', Consolas, monospace", label: "Cascadia Mono" },
    { value: "'JetBrains Mono', Consolas, monospace", label: "JetBrains Mono" },
    { value: "Consolas, 'Courier New', monospace", label: "Consolas" },
] as const;

export const FONT_SIZE_PRESETS = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24];
export const TAB_SIZE_PRESETS = [2, 4, 8];
export const SCROLLBACK_PRESETS = [1000, 3000, 5000, 10000, 25000, 50000];
export const AUTO_SAVE_DELAY_PRESETS = [500, 1000, 2000, 3000, 5000, 10000];
export const AUTO_FETCH_INTERVAL_PRESETS = [60, 180, 300, 600, 1800, 3600];
export const MAX_CONTEXT_PRESETS = [100, 200, 500, 1000, 1500, 2000];

export const COMMON_EXCLUDE_PATTERNS = [
    { pattern: "**/node_modules", label: "node_modules" },
    { pattern: "**/.git", label: ".git" },
    { pattern: "**/dist", label: "dist" },
    { pattern: "**/build", label: "build" },
    { pattern: "**/.next", label: ".next" },
    { pattern: "**/target", label: "target" },
    { pattern: "**/.vscode", label: ".vscode" },
    { pattern: "**/coverage", label: "coverage" },
] as const;

const CUSTOM_FONT_VALUE = "__custom__";

export function FontFamilySelect({
    value,
    presets,
    onChange,
}: {
    value: string;
    presets: readonly { value: string; label: string }[];
    onChange: (v: string) => void;
}) {
    const presetValues = presets.map((p) => p.value);
    const isCustom = !presetValues.includes(value);
    const selectValue = isCustom ? CUSTOM_FONT_VALUE : value;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const options = [
        ...presets.map((p) => ({ value: p.value, label: p.label })),
        { value: CUSTOM_FONT_VALUE, label: "Upload Font…" },
    ];

    const handleFontFile = async (file: File | undefined) => {
        if (!file) return;
        try {
            const family = await loadCustomEditorFont(file);
            onChange(family);
        } catch (err) {
            console.error("Failed to load custom font:", err);
        }
    };

    return (
        <div className="flex flex-col items-start gap-2">
            <SettingSelect
                value={selectValue}
                options={options}
                onChange={(v) => {
                    if (v === CUSTOM_FONT_VALUE) {
                        fileInputRef.current?.click();
                    } else {
                        onChange(v);
                    }
                }}
            />
            <input
                ref={fileInputRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                className="hidden"
                onChange={(e) => {
                    void handleFontFile(e.target.files?.[0]);
                    e.target.value = "";
                }}
            />
            {isCustom && (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted truncate max-w-[180px]">{value}</span>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-7"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        Change
                    </Button>
                </div>
            )}
        </div>
    );
}

export function SettingMultiSelect({
    value,
    options,
    onChange,
    placeholder = "None selected",
    className,
}: {
    value: string[];
    options: { value: string; label: string }[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    className?: string;
}) {
    const active = new Set(value);
    const selectedLabels = options.filter((o) => active.has(o.value)).map((o) => o.label);
    const summary =
        selectedLabels.length === 0
            ? placeholder
            : selectedLabels.length <= 2
              ? selectedLabels.join(", ")
              : `${selectedLabels.length} selected`;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="secondary"
                    size="sm"
                    className={cn("min-w-[200px] max-w-[280px] justify-between gap-2 font-normal", className)}
                >
                    <span className="truncate">{summary}</span>
                    <Icon name="expand_more" className="size-icon-sm shrink-0 opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px] max-h-[280px] overflow-y-auto custom-scrollbar">
                {options.map((opt) => (
                    <DropdownMenuCheckboxItem
                        key={opt.value}
                        checked={active.has(opt.value)}
                        onCheckedChange={(checked) => {
                            const next = new Set(active);
                            if (checked) next.add(opt.value);
                            else next.delete(opt.value);
                            onChange([...next]);
                        }}
                    >
                        {opt.label}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function ExcludePatternsSelect({
    value,
    onChange,
}: {
    value: string;
    onChange: (v: string) => void;
}) {
    const known = new Set<string>(COMMON_EXCLUDE_PATTERNS.map((c) => c.pattern));
    const active = value
        .split(",")
        .map((s) => s.trim())
        .filter((p) => p && known.has(p));

    return (
        <SettingMultiSelect
            value={active}
            placeholder="None excluded"
            options={COMMON_EXCLUDE_PATTERNS.map((c) => ({ value: c.pattern, label: c.label }))}
            onChange={(next) => onChange(next.join(","))}
        />
    );
}

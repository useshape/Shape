"use client";

import type { RemixiconComponentType } from "@remixicon/react";
import { useMemo, useState } from "react";
import { Button, type ButtonCategory, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { SearchInput } from "@/components/ui/search";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
    value: string | number;
    text: string;
    disabled?: boolean;
};

export type ComboboxGroup = {
    text: string;
    options: ComboboxOption[];
};

export type ComboboxItem = ComboboxOption;

function isGroup(item: ComboboxOption | ComboboxGroup): item is ComboboxGroup {
    return Array.isArray((item as ComboboxGroup).options);
}

export function Combobox({
    items,
    value,
    onValueChange,
    multiple = false,
    toggleText,
    headerText,
    icon,
    noCaret = true,
    category = "primary",
    variant = "outline",
    size = "sm",
    disabled,
    loading,
    searchable = false,
    searchPlaceholder = "Search",
    noResultsText = "No results found",
    textSrOnly,
    align = "start",
}: {
    items: Array<ComboboxOption | ComboboxGroup>;
    value?: string | number | Array<string | number>;
    onValueChange?: (value: string | number | Array<string | number>) => void;
    multiple?: boolean;
    toggleText?: string;
    headerText?: string;
    icon?: RemixiconComponentType;
    noCaret?: boolean;
    category?: ButtonCategory;
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    loading?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
    noResultsText?: string;
    textSrOnly?: boolean;
    align?: "start" | "center" | "end";
}) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const grouped = items.length > 0 && items.every(isGroup);
    const groups: ComboboxGroup[] = useMemo(() => {
        const src = grouped ? (items as ComboboxGroup[]) : [{ text: "", options: items as ComboboxOption[] }];
        if (!query.trim()) return src;
        const q = query.toLowerCase();
        return src
            .map((g) => ({
                ...g,
                options: g.options.filter((o) => o.text.toLowerCase().includes(q)),
            }))
            .filter((g) => g.options.length > 0);
    }, [grouped, items, query]);

    const selectedValues = Array.isArray(value) ? value : value == null ? [] : [value];
    const flat = grouped
        ? (items as ComboboxGroup[]).flatMap((g) => g.options)
        : (items as ComboboxOption[]);
    const selectedLabel = flat.find((o) => o.value === selectedValues[0])?.text;
    const label =
        toggleText ??
        (multiple
            ? selectedValues.length
                ? `${selectedValues.length} selected`
                : "Select"
            : (selectedLabel ?? "Select"));

    const singleValue = selectedValues[0] != null ? String(selectedValues[0]) : "";

    return (
        <DropdownMenu
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setQuery("");
            }}
        >
            <DropdownMenuTrigger asChild>
                <Button
                    variant={variant}
                    category={category}
                    size={icon && (textSrOnly || !label) ? "icon" : size}
                    icon={icon}
                    disabled={disabled}
                    loading={loading}
                    className={cn("justify-between font-normal", !noCaret && "pr-2")}
                >
                    {textSrOnly ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} className="min-w-44">
                {headerText ? <DropdownMenuLabel>{headerText}</DropdownMenuLabel> : null}
                {searchable ? (
                    <div
                        className="px-1 pb-1"
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    >
                        <SearchInput
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={searchPlaceholder}
                            aria-label={searchPlaceholder}
                        />
                    </div>
                ) : null}
                {groups.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-text-muted">{noResultsText}</div>
                ) : multiple ? (
                    groups.map((group, gi) => (
                        <div key={group.text || gi}>
                            {gi > 0 ? <DropdownMenuSeparator /> : null}
                            {group.text ? <DropdownMenuLabel>{group.text}</DropdownMenuLabel> : null}
                            {group.options.map((opt) => (
                                <DropdownMenuCheckboxItem
                                    key={String(opt.value)}
                                    checked={selectedValues.includes(opt.value)}
                                    disabled={opt.disabled}
                                    onCheckedChange={(checked) => {
                                        const next = checked
                                            ? [...selectedValues, opt.value]
                                            : selectedValues.filter((v) => v !== opt.value);
                                        onValueChange?.(next);
                                    }}
                                >
                                    {opt.text}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </div>
                    ))
                ) : (
                    <DropdownMenuRadioGroup
                        value={singleValue}
                        onValueChange={(v) => {
                            onValueChange?.(v);
                            setOpen(false);
                        }}
                    >
                        {groups.map((group, gi) => (
                            <div key={group.text || gi}>
                                {gi > 0 ? <DropdownMenuSeparator /> : null}
                                {group.text ? <DropdownMenuLabel>{group.text}</DropdownMenuLabel> : null}
                                {group.options.map((opt) => (
                                    <DropdownMenuRadioItem
                                        key={String(opt.value)}
                                        value={String(opt.value)}
                                        disabled={opt.disabled}
                                    >
                                        {opt.text}
                                    </DropdownMenuRadioItem>
                                ))}
                            </div>
                        ))}
                    </DropdownMenuRadioGroup>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

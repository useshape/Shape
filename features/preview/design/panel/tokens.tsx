"use client";

import { createContext, useContext, useState } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { SearchInput } from "@/components/ui/search";
import { cn } from "@/lib/utils";
import { formatVariableDisplayName } from "@/lib/ui/css-variables";
import type { ThemeToken } from "./types";

const TOKEN_MENU = "!p-0 z-9999 w-64 overflow-hidden bg-surface-4/70 backdrop-blur-sm";

export const DesignThemeContext = createContext<{
    tokens: ThemeToken[];
    onPick: (property: string, cssValue: string) => void;
} | null>(null);

export function useDesignTheme() {
    return useContext(DesignThemeContext);
}

/** Position/rotation/opacity/shadow offsets are not token properties. */
export function isTokenProperty(property: string) {
    const key = property.toLowerCase();
    if (
        /^(left|right|top|bottom|rotate|opacity|transform|z-index|filter|box-shadow|text-decoration-thickness|text-underline-offset)$/.test(
            key,
        )
    ) {
        return false;
    }
    return (
        /^(font-size|font-family|font-weight|line-height|letter-spacing|border-radius|border-width|gap|column-gap|row-gap|width|height)$/.test(
            key,
        )
        || key.includes("padding")
        || key.includes("margin")
        || key.includes("color")
        || key.includes("background")
        || key.includes("fill")
        || key.includes("radius")
    );
}

function tokensForProperty(tokens: ThemeToken[], property: string) {
    const key = property.toLowerCase();
    return tokens.filter((token) => {
        const n = token.name.toLowerCase();
        const v = token.value.trim();
        if (key.includes("font-size") || key === "line-height" || key.includes("letter")) {
            return n.includes("font-size") || n.includes("text") || n.includes("leading") || n.includes("tracking") || n.includes("size") || n.includes("space");
        }
        if (key.includes("radius")) return n.includes("radius") || n.includes("rounded");
        if (key.includes("gap") || key.includes("padding") || key.includes("margin") || key === "width" || key === "height" || key.includes("border-width")) {
            return n.includes("space") || n.includes("gap") || n.includes("size") || n.includes("padding") || n.includes("spacing") || n.includes("width") || n.includes("height");
        }
        if (key.includes("color") || key.includes("background") || key.includes("fill") || key.includes("border")) {
            return (
                v.startsWith("#")
                || /^(rgb|hsl|oklch|oklab|lab|color|hwb)/i.test(v)
                || /color|background|foreground|accent|fill|stroke|border/i.test(n)
            );
        }
        if (key.includes("font-family") || key.includes("font-weight")) return n.includes("font");
        return false;
    });
}

export function TokenMenu({
    property,
    children,
    className,
    onCustom,
    tokens: tokensProp,
    onPick,
}: {
    property: string;
    children: React.ReactElement;
    className?: string;
    onCustom?: () => void;
    tokens?: ThemeToken[];
    onPick?: (cssValue: string) => void;
}) {
    const ctx = useDesignTheme();
    const tokens = tokensProp ?? ctx?.tokens ?? [];
    const pick = (cssValue: string) => {
        if (onPick) onPick(cssValue);
        else ctx?.onPick(property, cssValue);
    };
    const [query, setQuery] = useState("");
    const visible = tokensForProperty(tokens, property).filter((token) =>
        formatVariableDisplayName(token.name).toLowerCase().includes(query.trim().toLowerCase()),
    );
    if (!tokens.length && !onCustom) return children;
    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                {children}
            </DropdownMenuTrigger>
            <DropdownMenuContent
                side="left"
                align="start"
                sideOffset={8}
                className={cn(TOKEN_MENU, className)}
            >
                <div className="border-b border-border">
                    <SearchInput
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        placeholder="Search tokens"
                        borderless
                        className="h-8"
                    />
                </div>
                <div className="max-h-72 overflow-y-auto p-1">
                    {onCustom ? (
                        <DropdownMenuItem onClick={onCustom}>Custom</DropdownMenuItem>
                    ) : null}
                    {visible.map((token) => (
                        <DropdownMenuItem
                            key={token.name}
                            onClick={() => pick(`var(${token.name})`)}
                            className="gap-2"
                        >
                            <span
                                className="size-3.5 shrink-0 rounded-[3px] border border-border"
                                style={{ background: token.value }}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm">
                                {formatVariableDisplayName(token.name)}
                            </span>
                            <span className="max-w-20 truncate text-xs text-text-muted">{token.value}</span>
                        </DropdownMenuItem>
                    ))}
                    {visible.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs text-text-muted">No tokens</p>
                    ) : null}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

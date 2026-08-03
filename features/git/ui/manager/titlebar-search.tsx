"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useFilter } from "./filter-context";

/** Titlebar filter — placeholder follows the active manager section. */
export function TitlebarSearch() {
    const { query, setQuery, placeholder, searchEnabled } = useFilter();
    const [focused, setFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!searchEnabled) setFocused(false);
    }, [searchEnabled]);

    if (!searchEnabled) return null;

    return (
        <div
            data-git-titlebar-search
            className={cn(
                "flex h-7 w-[min(280px,36vw)] items-center gap-1 rounded-md border border-border/60 bg-editor px-2 transition-colors",
                focused && "border-border bg-panel-hover/40",
            )}
        >
            <Icon name="search" size={14} className="shrink-0 text-text-muted" />
            <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={placeholder}
                className="h-auto! min-w-0 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                aria-label={placeholder}
            />
            {query ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 text-text-muted hover:text-text-primary"
                    onClick={() => {
                        setQuery("");
                        inputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                >
                    <Icon name="close" size={14} />
                </Button>
            ) : null}
        </div>
    );
}

"use client";

import { RiCloseLine, RiSearchLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useFilter } from "./filter-context";
import { titlebarIconButtonClass } from "@/features/workbench/titlebar/ui/layout-controls";

/** Titlebar filter — icon that expands into a field for the active manager section. */
export function TitlebarSearch() {
    const { query, setQuery, placeholder, searchEnabled } = useFilter();
    const [expanded, setExpanded] = useState(false);
    const [focused, setFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!searchEnabled) {
            setExpanded(false);
            setFocused(false);
        }
    }, [searchEnabled]);

    useEffect(() => {
        if (expanded) {
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [expanded]);

    useEffect(() => {
        if (!expanded) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!wrapRef.current?.contains(e.target as Node) && !query) {
                setExpanded(false);
            }
        };
        window.addEventListener("pointerdown", onPointerDown);
        return () => window.removeEventListener("pointerdown", onPointerDown);
    }, [expanded, query]);

    if (!searchEnabled) return null;

    if (!expanded && !query) {
        return (
            <button
                type="button"
                data-git-titlebar-search
                className={titlebarIconButtonClass}
                aria-label={placeholder}
                onClick={() => setExpanded(true)}
            >
                <Icon icon={RiSearchLine} size={ICON_SIZE_SM} className="text-input-placeholder" />
            </button>
        );
    }

    return (
        <div
            ref={wrapRef}
            data-git-titlebar-search
            className={cn(
                "flex h-7 w-[min(220px,32vw)] items-center gap-1.5 rounded-md border border-border-subtle bg-input-bg px-2",
                focused && "border-border-focus",
            )}
        >
            <Icon
                icon={RiSearchLine}
                size={ICON_SIZE_SM}
                className="pointer-events-none text-input-placeholder"
            />
            <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        if (query) setQuery("");
                        else setExpanded(false);
                    }
                }}
                placeholder={placeholder}
                className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-sm shadow-none"
                aria-label={placeholder}
            />
            {query ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 text-input-placeholder hover:text-text-primary"
                    onClick={() => {
                        setQuery("");
                        inputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                >
                    <Icon icon={RiCloseLine} size={ICON_SIZE_SM} />
                </Button>
            ) : null}
        </div>
    );
}

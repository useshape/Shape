"use client";

import { RiSearchLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { SearchInput } from "@/components/ui/search";
import { useFilter } from "./filter-context";
import { titlebarIconButtonClass } from "@/features/workbench/titlebar/ui/layout-controls";

/** Titlebar filter — icon that expands into a field for the active manager section. */
export function TitlebarSearch() {
    const { query, setQuery, placeholder, searchEnabled } = useFilter();
    const [expanded, setExpanded] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!searchEnabled) {
            setExpanded(false);
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
        <div ref={wrapRef} data-git-titlebar-search className="w-[min(220px,32vw)]">
            <SearchInput
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        if (query) setQuery("");
                        else setExpanded(false);
                    }
                }}
                placeholder={placeholder}
                aria-label={placeholder}
            />
        </div>
    );
}

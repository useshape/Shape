"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type EditorSearchMatch = {
    range: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
    };
    content: string;
};

function highlightMatch(line: string, query: string) {
    if (!query) return line;
    const lowerLine = line.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerLine.indexOf(lowerQuery);
    if (idx === -1) return line;
    return (
        <>
            {line.slice(0, idx)}
            <mark className="bg-accent/25 text-text-primary rounded-none px-0">
                {line.slice(idx, idx + query.length)}
            </mark>
            {line.slice(idx + query.length)}
        </>
    );
}

export function CommandCenterSearch({
    label,
    activeFile,
}: {
    label: string;
    activeFile: string | null;
}) {
    const [focused, setFocused] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<EditorSearchMatch[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const showDropdown = focused && Boolean(query) && Boolean(activeFile);

    useEffect(() => {
        const handleOpen = () => {
            inputRef.current?.focus();
            inputRef.current?.select();
        };
        window.addEventListener("open-in-file-search", handleOpen);
        return () => window.removeEventListener("open-in-file-search", handleOpen);
    }, []);

    useEffect(() => {
        if (!showDropdown) {
            setResults([]);
            setSelectedIndex(0);
            return;
        }

        const onResults = (e: Event) => {
            const custom = e as CustomEvent<EditorSearchMatch[]>;
            setResults(custom.detail ?? []);
            setSelectedIndex(0);
        };

        window.addEventListener("shape-editor-search-results", onResults);

        const handle = window.setTimeout(() => {
            window.dispatchEvent(
                new CustomEvent("shape-editor-search-request", {
                    detail: {
                        query,
                        caseSensitive: false,
                        wholeWord: false,
                        isRegex: false,
                    },
                }),
            );
        }, 80);

        return () => {
            window.clearTimeout(handle);
            window.removeEventListener("shape-editor-search-results", onResults);
        };
    }, [query, showDropdown]);

    useEffect(() => {
        if (!focused) return;
        const onPointerDown = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) {
                setFocused(false);
            }
        };
        window.addEventListener("mousedown", onPointerDown);
        return () => window.removeEventListener("mousedown", onPointerDown);
    }, [focused]);

    const jumpToMatch = useCallback(
        (match: EditorSearchMatch | null) => {
            if (!match || !activeFile) return;
            window.dispatchEvent(
                new CustomEvent("shape-editor-jump", {
                    detail: {
                        path: activeFile,
                        line: match.range.startLineNumber,
                        column: match.range.startColumn,
                        endLine: match.range.endLineNumber,
                        endColumn: match.range.endColumn,
                    },
                }),
            );
            setFocused(false);
            inputRef.current?.blur();
        },
        [activeFile],
    );

    const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            setQuery("");
            setFocused(false);
            inputRef.current?.blur();
            return;
        }
        if (!results.length) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((idx) => Math.min(idx + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((idx) => Math.max(idx - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            jumpToMatch(results[selectedIndex] ?? null);
        }
    };

    return (
        <div ref={containerRef} className="relative w-[min(420px,36vw)] max-w-full">
            <div className="relative">
                <div
                    className={cn(
                        "command-center flex items-center w-full h-[26px] px-2 rounded-lg border transition-colors gap-2",
                        focused ? "border-border bg-panel" : "border-border bg-transparent hover:bg-panel-hover",
                        showDropdown && "border-b-0 rounded-b-none bg-surface-3",
                    )}
                >
                    <Icon name="search" size={14} className="text-text-muted shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setFocused(true)}
                        onKeyDown={onInputKeyDown}
                        placeholder={activeFile ? `Search in ${label.split(" - ").pop() ?? "file"}...` : label}
                        disabled={!activeFile}
                        className={cn(
                            "flex-1 min-w-0 bg-transparent text-xs text-text-primary placeholder:text-text-secondary outline-none border-none h-full",
                            !activeFile && "cursor-not-allowed opacity-60",
                        )}
                    />
                    {!focused && !query ? (
                        <span className="flex items-center gap-0.5 shrink-0 text-text-muted pointer-events-none">
                        </span>
                    ) : null}
                </div>

                {showDropdown ? (
                    <div className="absolute left-0 right-0 top-full z-50 overflow-hidden rounded-b-2xl border border-t-0 border-border bg-surface-3 shadow-md">
                        <div className="max-h-[320px] overflow-auto custom-scrollbar py-1">
                            {results.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-text-muted">No matches in this file.</div>
                            ) : (
                                results.map((match, idx) => (
                                    <button
                                        key={`${match.range.startLineNumber}:${match.range.startColumn}:${idx}`}
                                        type="button"
                                        className={cn(
                                            "w-full text-left px-2 py-1 flex items-start gap-2 cursor-pointer transition-colors",
                                            idx === selectedIndex ? "bg-panel-hover" : "hover:bg-panel-hover",
                                        )}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                        onClick={() => jumpToMatch(match)}
                                    >
                                        <span className="shrink-0 w-8 text-sm text-text-muted tabular-nums pt-px">
                                            {match.range.startLineNumber}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                                            {highlightMatch(match.content.trim(), query)}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

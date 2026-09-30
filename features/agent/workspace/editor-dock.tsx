"use client";

import { ArrowUp20Regular } from "@fluentui/react-icons/headless/svg/arrow-up";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { ChevronUp20Regular } from "@fluentui/react-icons/headless/svg/chevron-up";
import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { useEffect, useState } from "react";
import { FileIcon } from "@/components/ui/file-icon";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { commands } from "@/lib/backend";
import { getShapeAccessToken } from "@/lib/cloud/store";
import { notify } from "@/features/notifications";
import { cn } from "@/lib/utils";

export function EditorDock({ path }: { path: string }) {
    const [mode, setMode] = useState<"agent" | "find">("agent");
    const [prompt, setPrompt] = useState("");
    const [query, setQuery] = useState("");
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [regexp, setRegexp] = useState(false);
    const [count, setCount] = useState(0);
    const [busy, setBusy] = useState(false);
    const name = path.split(/[\\/]/).pop() || path;

    useEffect(() => {
        const onFind = (event: Event) => {
            const detail = (event as CustomEvent<{ path?: string }>).detail;
            if (detail?.path && detail.path !== path) return;
            setMode("find");
        };
        const onCount = (event: Event) => {
            const detail = (event as CustomEvent<{ path?: string; count?: number }>).detail;
            if (detail?.path !== path) return;
            setCount(detail.count ?? 0);
        };
        const onEdited = () => setBusy(false);
        window.addEventListener("shape-editor-find", onFind as EventListener);
        window.addEventListener("shape-editor-search-count", onCount as EventListener);
        window.addEventListener("shape-file-agent-done", onEdited);
        window.addEventListener("shape-file-agent-settled", onEdited);
        return () => {
            window.removeEventListener("shape-editor-find", onFind as EventListener);
            window.removeEventListener("shape-editor-search-count", onCount as EventListener);
            window.removeEventListener("shape-file-agent-done", onEdited);
            window.removeEventListener("shape-file-agent-settled", onEdited);
        };
    }, [path]);

    const publishSearch = (next: string, nav?: "next" | "prev") => {
        window.dispatchEvent(
            new CustomEvent("shape-editor-search", {
                detail: { path, query: next, caseSensitive, regexp, nav },
            }),
        );
    };

    const send = () => {
        const text = prompt.trim();
        if (!text || busy) return;
        const token = getShapeAccessToken();
        if (!token) {
            notify.error("Edit", "Sign in to Shape to edit this file.");
            return;
        }
        setBusy(true);
        setPrompt("");
        void (async () => {
            let original = "";
            try {
                original = await commands.readFile(path);
                const next = await commands.rewriteOpenFile(token, path, text);
                window.dispatchEvent(
                    new CustomEvent("shape-editor-preview-diff", {
                        detail: { path, original, replacement: next },
                    }),
                );
            } catch (err) {
                notify.error("Edit", err instanceof Error ? err.message : String(err));
            } finally {
                setBusy(false);
            }
        })();
    };

    return (
        <div className="shrink-0 max-w-130 min-w-120 mx-auto my-3 border border-border-subtle/50 rounded-full bg-surface-4 px-3 py-1.5">
            <div className="relative h-9 overflow-hidden">
                <div
                    className={cn(
                        "absolute inset-0 flex items-center gap-2 transition-all duration-300 ease-[var(--ease-out)]",
                        mode === "agent" ? "z-10 translate-y-0 opacity-100" : "pointer-events-none -z-10 -translate-y-2 opacity-0",
                    )}
                >
                    <FileIcon name={name} className="size-4 shrink-0" />
                    <input
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                send();
                            }
                        }}
                        placeholder={`Edit ${name}`}
                        aria-label={`Edit ${name}`}
                        className="h-8 min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                    />
                    <Tooltip content="Send edit">
                        <button
                            type="button"
                            onClick={send}
                            disabled={!prompt.trim() || busy}
                            aria-label="Send edit"
                            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg disabled:opacity-40"
                        >
                            <Icon icon={ArrowUp20Regular} className="icon-sm" />
                        </button>
                    </Tooltip>
                    <Tooltip content="Find">
                        <button
                            type="button"
                            aria-label="Find"
                            onClick={() => setMode("find")}
                            className="flex size-7 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-panel-hover hover:text-text-primary"
                        >
                            <Icon icon={Search20Regular} className="icon-sm" />
                        </button>
                    </Tooltip>
                </div>
                <div
                    className={cn(
                        "absolute inset-0 flex items-center gap-1.5 transition-all duration-300 ease-[var(--ease-out)]",
                        mode === "find" ? "z-10 translate-y-0 opacity-100" : "pointer-events-none -z-10 translate-y-2 opacity-0",
                    )}
                >
                    <Icon icon={Search20Regular} className="icon-sm shrink-0 text-text-muted" />
                    <input
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            publishSearch(event.target.value);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                publishSearch(query, event.shiftKey ? "prev" : "next");
                            }
                            if (event.key === "Escape") setMode("agent");
                        }}
                        placeholder="Find"
                        aria-label="Find in file"
                        className="h-8 min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                    />
                    <span className="shrink-0 text-xs tabular-nums text-text-muted">{query ? count : ""}</span>
                    <button
                        type="button"
                        aria-pressed={caseSensitive}
                        aria-label="Match case"
                        onClick={() => {
                            const next = !caseSensitive;
                            setCaseSensitive(next);
                            window.dispatchEvent(
                                new CustomEvent("shape-editor-search", {
                                    detail: { path, query, caseSensitive: next, regexp },
                                }),
                            );
                        }}
                        className={cn(
                            "flex h-6 items-center rounded-full px-2 text-xs",
                            caseSensitive ? "bg-panel-active text-text-primary" : "text-text-muted hover:bg-panel-hover",
                        )}
                    >
                        Aa
                    </button>
                    <button
                        type="button"
                        aria-pressed={regexp}
                        aria-label="Use regular expression"
                        onClick={() => {
                            const next = !regexp;
                            setRegexp(next);
                            window.dispatchEvent(
                                new CustomEvent("shape-editor-search", {
                                    detail: { path, query, caseSensitive, regexp: next },
                                }),
                            );
                        }}
                        className={cn(
                            "flex h-6 items-center rounded-full px-2 text-xs",
                            regexp ? "bg-panel-active text-text-primary" : "text-text-muted hover:bg-panel-hover",
                        )}
                    >
                        .*
                    </button>
                    <button
                        type="button"
                        aria-label="Previous match"
                        onClick={() => publishSearch(query, "prev")}
                        className="flex size-6 items-center justify-center rounded-full text-text-muted hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon icon={ChevronUp20Regular} className="icon-sm" />
                    </button>
                    <button
                        type="button"
                        aria-label="Next match"
                        onClick={() => publishSearch(query, "next")}
                        className="flex size-6 items-center justify-center rounded-full text-text-muted hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon icon={ChevronDown20Regular} className="icon-sm" />
                    </button>
                    <button
                        type="button"
                        aria-label="Close find"
                        onClick={() => {
                            setMode("agent");
                            window.dispatchEvent(
                                new CustomEvent("shape-editor-search", {
                                    detail: { path, query: "" },
                                }),
                            );
                        }}
                        className="flex size-6 items-center justify-center rounded-full text-text-muted hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon icon={Dismiss20Regular} className="icon-sm" />
                    </button>
                </div>
            </div>
        </div>
    );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { OutlineResponse, OutlineSymbol, commands, useProjectState } from "@/lib/backend";
import { getSymbolIconPath } from "@/lib/ui/icons/symbols";

const OUTLINE_ROW_HEIGHT = 24;

type OutlineRow = {
    symbol: OutlineSymbol;
    depth: number;
    hasChildren: boolean;
    isOpen: boolean;
};

function flattenVisibleSymbols(
    nodes: OutlineSymbol[],
    expanded: Set<string>,
    depth = 0,
    out: OutlineRow[] = []
): OutlineRow[] {
    for (const node of nodes) {
        const hasChildren = node.children.length > 0;
        const isOpen = expanded.has(node.id);
        out.push({ symbol: node, depth, hasChildren, isOpen });
        if (hasChildren && isOpen) {
            flattenVisibleSymbols(node.children, expanded, depth + 1, out);
        }
    }
    return out;
}

function collectExpandableIds(nodes: OutlineSymbol[], out: Set<string>) {
    for (const node of nodes) {
        if (node.children.length > 0) {
            out.add(node.id);
            collectExpandableIds(node.children, out);
        }
    }
}

function getDefaultExpanded(nodes: OutlineSymbol[]): Set<string> {
    const ids = new Set<string>();
    collectExpandableIds(nodes, ids);
    return ids;
}

export default function OutlinePanel() {
    const { active_file } = useProjectState();
    
    const [outlineResponse, setOutlineResponse] = useState<OutlineResponse>({
        symbols: [],
        total_symbols: 0,
        truncated: false,
        version: 0,
    });
    const [activeBuffer, setActiveBuffer] = useState<{
        path: string;
        content: string;
        extension: string;
        version: number;
    } | null>(null);

    const outlineRequestVersionRef = useRef(0);
    const outlineResponseVersionRef = useRef(0);
    const activeFileRef = useRef<string | null>(active_file);

    useEffect(() => {
        activeFileRef.current = active_file;
    }, [active_file]);

    useEffect(() => {
        const handleBuffer = (event: Event) => {
            const custom = event as CustomEvent<{
                path: string;
                content: string;
                extension: string;
                version: number;
            }>;
            const detail = custom.detail;
            if (!detail || !detail.path) return;
            if (detail.path !== activeFileRef.current) return;
            setActiveBuffer(detail);
        };

        window.addEventListener("shape-editor-buffer", handleBuffer as EventListener);
        return () => window.removeEventListener("shape-editor-buffer", handleBuffer as EventListener);
    }, []);

    useEffect(() => {
        if (!activeBuffer || !active_file || activeBuffer.path !== active_file) return;

        const requestVersion = ++outlineRequestVersionRef.current;
        const timer = window.setTimeout(() => {
            commands
                .getOutline(
                    activeBuffer.path,
                    activeBuffer.content,
                    activeBuffer.extension,
                    activeBuffer.version
                )
                .then((response) => {
                    if (requestVersion < outlineRequestVersionRef.current) return;
                    if (response.version < outlineResponseVersionRef.current) return;
                    if (response.version !== activeBuffer.version) return;
                    outlineResponseVersionRef.current = response.version;
                    setOutlineResponse(response);
                })
                .catch(() => {
                    if (requestVersion < outlineRequestVersionRef.current) return;
                    setOutlineResponse({
                        symbols: [],
                        total_symbols: 0,
                        truncated: false,
                        version: activeBuffer.version,
                    });
                });
        }, 260);

        return () => window.clearTimeout(timer);
    }, [activeBuffer, active_file]);

    const filePath = active_file;
    const symbols = active_file ? outlineResponse.symbols : [];

    const [expanded, setExpanded] = useState<Set<string>>(() => getDefaultExpanded(symbols));
    const [viewportHeight, setViewportHeight] = useState(280);
    const [scrollTop, setScrollTop] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    const prevSymbolIdsRef = useRef<string>("");

    useEffect(() => {
        const ids = symbols.map((s) => s.id).join(",");
        if (ids === prevSymbolIdsRef.current) return;
        prevSymbolIdsRef.current = ids;
        setExpanded(getDefaultExpanded(symbols));
    }, [symbols]);

    useEffect(() => {
        if (!active_file) {
            setOutlineResponse({
                symbols: [],
                total_symbols: 0,
                truncated: false,
                version: 0,
            });
            setActiveBuffer(null);
            return;
        }

        let cancelled = false;
        void (async () => {
            try {
                const content = await commands.readFile(active_file);
                if (cancelled) return;
                const ext = active_file.split(".").pop()?.toLowerCase() || "";
                const version = ++outlineRequestVersionRef.current;
                setActiveBuffer({
                    path: active_file,
                    content,
                    extension: ext,
                    version,
                });
            } catch {
                if (!cancelled) {
                    setOutlineResponse({
                        symbols: [],
                        total_symbols: 0,
                        truncated: false,
                        version: 0,
                    });
                    setActiveBuffer(null);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [active_file]);

    useEffect(() => {
        const target = scrollRef.current;
        if (!target) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            setViewportHeight(entry.contentRect.height);
        });
        observer.observe(target);
        return () => observer.disconnect();
    }, []);

    const rows = useMemo(() => flattenVisibleSymbols(symbols, expanded), [symbols, expanded]);
    const totalHeight = rows.length * OUTLINE_ROW_HEIGHT;
    const overscan = 10;
    const start = Math.max(0, Math.floor(scrollTop / OUTLINE_ROW_HEIGHT) - overscan);
    const end = Math.min(
        rows.length,
        Math.ceil((scrollTop + viewportHeight) / OUTLINE_ROW_HEIGHT) + overscan
    );
    const visibleRows = rows.slice(start, end);

    const toggleNode = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleJump = (symbol: OutlineSymbol) => {
        if (!filePath) return;
        window.dispatchEvent(
            new CustomEvent("shape-editor-jump", {
                detail: {
                    path: filePath,
                    line: symbol.start_line,
                    column: symbol.start_col,
                },
            })
        );
    };

    if (!filePath) {
        return <div className="px-3 py-2 text-xs text-text-disabled">Open a file to show outline.</div>;
    }

    return (
        <div className="flex w-full h-full min-h-0 flex-col">
            <div className="h-9 flex items-center justify-between px-3 shrink-0">
                <span>Outline</span>
            </div>
            <div
                ref={scrollRef}
                className="py-1 flex-1 flex flex-col overflow-y-auto custom-scrollbar"
                onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            >
                {rows.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-text-disabled">No symbols found for this file.</div>
                ) : (
                    <div style={{ position: "relative", height: `${totalHeight}px` }}>
                        {visibleRows.map((row, index) => {
                            const absoluteIndex = start + index;
                            return (
                                <div
                                    key={row.symbol.id}
                                    className="absolute left-0 right-0 flex items-center gap-1.5 px-2 hover:bg-panel-hover cursor-pointer text-text-secondary hover:text-text-primary rounded-sm transition-colors"
                                    style={{
                                        top: `${absoluteIndex * OUTLINE_ROW_HEIGHT}px`,
                                        height: `${OUTLINE_ROW_HEIGHT}px`,
                                        paddingLeft: `${8 + row.depth * 14}px`,
                                    }}
                                    onClick={() => handleJump(row.symbol)}
                                >
                                    <div
                                        className="w-4 flex items-center justify-center shrink-0"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            if (row.hasChildren) toggleNode(row.symbol.id);
                                        }}
                                    >
                                        {row.hasChildren ? (
                                            <Icon
                                                name="chevron_right"
                                                size={11}
                                                className={cn(
                                                    "transition-transform duration-150 text-text-muted",
                                                    row.isOpen && "rotate-90"
                                                )}
                                            />
                                        ) : (
                                            <span className="w-[11px]" />
                                        )}
                                    </div>
                                    <img
                                        src={getSymbolIconPath(row.symbol.kind)}
                                        alt=""
                                        className="w-3.5 h-3.5 shrink-0"
                                    />
                                    <span className="text-sm truncate flex-1">{row.symbol.name}</span>
                                    <span className="text-xs text-text-disabled shrink-0">
                                        {row.symbol.start_line}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

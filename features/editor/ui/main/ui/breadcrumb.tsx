"use client";

import React, { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";
import { cn } from "@/lib/utils";
import {
    Menubar,
    MenubarMenu,
    MenubarTrigger,
    MenubarContent,
    MenubarItem,
    MenubarNested,
    MenubarNestedTrigger,
    MenubarNestedContent,
} from "@/components/ui/dropdown";
import { commands, FileEntry, OutlineResponse, OutlineSymbol } from "@/lib/backend";
import { getSymbolIconPath } from "@/lib/ui/icons/symbols";

function useBreadcrumbOutline(path: string, enabled = true) {
    const [state, setState] = useState<{
        path: string;
        outlineResponse: OutlineResponse | null;
        cursorPos: { line: number; col: number };
    }>({ path, outlineResponse: null, cursorPos: { line: 1, col: 1 } });

    const requestVersionRef = useRef(0);
    const outlineResponseVersionRef = useRef(0);
    const currentPathRef = useRef(path);

    useEffect(() => {
        if (!enabled) return;
        currentPathRef.current = path;
        requestVersionRef.current++;
        outlineResponseVersionRef.current = 0;
        // eslint-disable-next-line
        setState((prev) => prev.path === path ? prev : { path, outlineResponse: null, cursorPos: { line: 1, col: 1 } });
    }, [path, enabled]);

    // Initial load fallback
    useEffect(() => {
        if (!enabled || !path) return;
        let isCancelled = false;

        commands.readFile(path).then(content => {
            if (isCancelled || !content) return;
            const ext = path.split('.').pop() || '';
            commands.getOutline(path, content, ext, 0).then(response => {
                if (isCancelled) return;
                setState(prev => prev.outlineResponse ? prev : { ...prev, outlineResponse: response });
            }).catch(() => { });
        }).catch(() => { });

        return () => { isCancelled = true; };
    }, [path, enabled]);

    useEffect(() => {
        if (!enabled) return;
        const handleBuffer = (event: Event) => {
            const custom = event as CustomEvent;
            const detail = custom.detail;
            if (!detail || detail.path !== currentPathRef.current) return;

            const reqVer = ++requestVersionRef.current;
            window.setTimeout(() => {
                commands.getOutline(detail.path, detail.content, detail.extension, detail.version)
                    .then(response => {
                        if (reqVer < requestVersionRef.current) return;
                        if (response.version < outlineResponseVersionRef.current) return;
                        if (response.version !== detail.version) return;
                        outlineResponseVersionRef.current = response.version;
                        setState(prev => ({ ...prev, outlineResponse: response }));
                    })
                    .catch(() => { });
            }, 300);
        };

        const handleStatus = (event: Event) => {
            const custom = event as CustomEvent;
            if (custom.detail) {
                setState(prev => ({ ...prev, cursorPos: { line: custom.detail.line, col: custom.detail.column } }));
            }
        };

        window.addEventListener("shape-editor-buffer", handleBuffer);
        window.addEventListener("shape-editor-status", handleStatus);

        return () => {
            window.removeEventListener("shape-editor-buffer", handleBuffer);
            window.removeEventListener("shape-editor-status", handleStatus);
        };
    }, [enabled]);

    const effectiveOutline = state.path === path ? state.outlineResponse : null;
    const effectiveCursor = state.path === path ? state.cursorPos : { line: 1, col: 1 };

    return { outlineResponse: effectiveOutline, cursorPos: effectiveCursor };
}

function findSymbolChain(symbols: OutlineSymbol[], line: number, col: number): OutlineSymbol[] {
    const chain: OutlineSymbol[] = [];
    let currentSymbols = symbols;

    while (currentSymbols.length > 0) {
        let foundChild: OutlineSymbol | null = null;
        for (const sym of currentSymbols) {
            const afterStart = line > sym.start_line || (line === sym.start_line && col >= sym.start_col);
            const beforeEnd = line < sym.end_line || (line === sym.end_line && col <= sym.end_col);
            if (afterStart && beforeEnd) {
                foundChild = sym;
                break;
            }
        }

        if (foundChild) {
            chain.push(foundChild);
            currentSymbols = foundChild.children;
        } else {
            break;
        }
    }
    return chain;
}

function FolderSubMenu({ name, folderPath, isSelected, gitStatuses, gitModifiedDirs }: { name: string, folderPath: string, isSelected?: boolean, gitStatuses: Map<string, string>, gitModifiedDirs: Map<string, string> }) {
    const [children, setChildren] = useState<FileEntry[]>([]);
    const [open, setOpen] = useState(false);

    const onOpenChange = async (isOpen: boolean) => {
        setOpen(isOpen);
        if (isOpen && children.length === 0) {
            try {
                const results = await commands.lsDir(folderPath);
                results.sort((a, b) => {
                    if (a.is_dir === b.is_dir) return a.name.localeCompare(b.name);
                    return a.is_dir ? -1 : 1;
                });
                setChildren(results);
            } catch (err) {
                console.error(err);
            }
        }
    };

    const normalizedPath = folderPath.replace(/\\/g, '/');
    const status = gitModifiedDirs.get(normalizedPath);

    return (
        <MenubarNested open={open} onOpenChange={onOpenChange}>
            <MenubarNestedTrigger className={cn(
                "flex items-center gap-2 px-2 py-1 text-xs cursor-default rounded-md outline-none",
                isSelected ? "bg-panel-active text-text-primary font-medium" : "text-text-muted hover:text-text-primary focus:bg-panel-hover focus:text-text-primary"
            )}>
                <FileIcon name={name} isDir={true} className="w-3.5 h-3.5 shrink-0 opacity-80" />
                <span className="truncate flex-1">{name}</span>
                {status && (
                    <div
                        className="w-1.5 h-1.5 rounded-full shrink-0 ml-1"
                        style={{
                            backgroundColor: status === "M" ? "var(--git-modified)" :
                                status === "A" || status === "U" ? "var(--git-added)" :
                                    status === "D" ? "var(--git-deleted)" : "var(--git-added)"
                        }}
                    />
                )}
            </MenubarNestedTrigger>
            <MenubarNestedContent isOpened={open}>
                {children.length === 0 && <div className="px-4 py-1 text-sm text-text-muted">Loading...</div>}
                {children.map(child => {
                    if (child.is_dir) {
                        const separator = folderPath.includes("\\") ? "\\" : "/";
                        return <FolderSubMenu key={child.name} name={child.name} folderPath={`${folderPath}${separator}${child.name}`} gitStatuses={gitStatuses} gitModifiedDirs={gitModifiedDirs} />;
                    } else {
                        const childNormalized = child.path.replace(/\\/g, '/');
                        const childStatus = gitStatuses.get(childNormalized);
                        return (
                            <MenubarItem
                                key={child.name}
                                className="flex items-center gap-2 px-2 py-1 text-xs cursor-default rounded-md text-text-muted hover:text-text-primary focus:bg-panel-hover focus:text-text-primary outline-none"
                                onClick={() => {
                                    commands.openFile(child.path, child.name);
                                }}
                            >
                                <FileIcon name={child.name} isDir={false} className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate flex-1">{child.name}</span>
                                {childStatus && (
                                    <span
                                        className="text-2xs font-bold w-4 text-center shrink-0 ml-1 leading-none self-center pt-0.5"
                                        style={{
                                            color: childStatus === "M" ? "var(--git-modified)" :
                                                childStatus === "A" || childStatus === "U" ? "var(--git-added)" :
                                                    childStatus === "D" ? "var(--git-deleted)" : "var(--git-added)"
                                        }}
                                    >
                                        {childStatus}
                                    </span>
                                )}
                            </MenubarItem>
                        );
                    }
                })}
            </MenubarNestedContent>
        </MenubarNested>
    );
}

function handleJump(path: string, symbol: OutlineSymbol) {
    window.dispatchEvent(
        new CustomEvent("shape-editor-jump", {
            detail: {
                path,
                line: symbol.start_line,
                column: symbol.start_col,
            },
        })
    );
}

function SymbolSubMenu({ symbol, filePath, isSelected }: { symbol: OutlineSymbol, filePath: string, isSelected?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <MenubarNested open={open} onOpenChange={setOpen}>
            <MenubarNestedTrigger className={cn(
                "flex items-center gap-2 px-2 py-1 text-xs cursor-default rounded-md outline-none",
                isSelected ? "bg-panel-active text-text-primary font-medium" : "text-text-muted hover:text-text-primary focus:bg-panel-hover focus:text-text-primary"
            )}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={getSymbolIconPath(symbol.kind)} className="w-3.5 h-3.5 shrink-0 invert-0 dark:invert" alt="" />
                <span className="truncate flex-1">{symbol.name}</span>
            </MenubarNestedTrigger>
            <MenubarNestedContent isOpened={open}>
                {symbol.children.map(sym => (
                    sym.children.length === 0 ? (
                        <MenubarItem
                            key={sym.id}
                            className="flex items-center gap-2 px-2 py-1 text-xs cursor-default rounded-md outline-none text-text-muted hover:text-text-primary focus:bg-panel-hover focus:text-text-primary"
                            onClick={() => handleJump(filePath, sym)}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={getSymbolIconPath(sym.kind)} className="w-3.5 h-3.5 shrink-0 invert-0 dark:invert" alt="" />
                            <span className="truncate flex-1">{sym.name}</span>
                        </MenubarItem>
                    ) : (
                        <SymbolSubMenu key={sym.id} symbol={sym} filePath={filePath} />
                    )
                ))}
            </MenubarNestedContent>
        </MenubarNested>
    );
}

function joinProjectFolder(projectPath: string, parts: string[], upToIndex: number): string | null {
    const separator = projectPath.includes("\\") ? "\\" : "/";
    const root = projectPath.replace(/[\\/]+$/, "");
    if (!root) return null;
    const segments = parts.slice(0, upToIndex + 1).filter((p) => p && p !== "." && p !== "..");
    if (segments.length === 0) return root;
    // Reject Windows-illegal path characters that cause ERROR_INVALID_NAME (123).
    if (segments.some((p) => /[<>:"|?*\x00-\x1f]/.test(p))) return null;
    return [root, ...segments].join(separator);
}

function BreadcrumbFolderItem({ part, folderPath, nextPartName, gitStatuses, gitModifiedDirs }: { part: string, folderPath: string, nextPartName?: string, gitStatuses: Map<string, string>, gitModifiedDirs: Map<string, string> }) {
    const [children, setChildren] = useState<FileEntry[]>([]);
    const loadedRef = useRef(false);

    const onTriggerClick = async () => {
        if (!loadedRef.current && children.length === 0) {
            loadedRef.current = true;
            try {
                const results = await commands.lsDir(folderPath);
                results.sort((a, b) => {
                    if (a.is_dir === b.is_dir) return a.name.localeCompare(b.name);
                    return a.is_dir ? -1 : 1;
                });
                setChildren(results);
            } catch (err) {
                loadedRef.current = false;
                console.error("Breadcrumb folder list failed:", folderPath, err);
            }
        }
    };

    return (
        <MenubarMenu>
            <MenubarTrigger
                className="flex items-center gap-1 h-5 hover:text-text-primary px-1.5 py-0.5 rounded-[5px] cursor-pointer transition-colors outline-none hover:bg-panel-hover data-[state=open]:bg-panel-hover data-[state=open]:text-text-primary max-w-[250px]"
                onClick={onTriggerClick}
            >
                <span className="truncate">{part}</span>
            </MenubarTrigger>
            <MenubarContent align="start" className="max-h-[400px] overflow-y-auto min-w-[220px] p-1 shadow-md custom-scrollbar z-modal bg-panel-secondary rounded-lg border-border">
                {children.map(child => {
                    const isSelected = child.name === nextPartName;
                    if (child.is_dir) {
                        const separator = folderPath.includes("\\") ? "\\" : "/";
                        return <FolderSubMenu key={child.name} name={child.name} folderPath={`${folderPath}${separator}${child.name}`} isSelected={isSelected} gitStatuses={gitStatuses} gitModifiedDirs={gitModifiedDirs} />;
                    }
                    const childNormalized = child.path.replace(/\\/g, '/');
                    const childStatus = gitStatuses.get(childNormalized);
                    return (
                            <MenubarItem
                                key={child.name}
                                className={cn(
                                    "flex items-center gap-2 px-2 py-1 text-xs cursor-default rounded-md outline-none",
                                    isSelected ? "bg-panel-active text-text-primary font-medium" : "text-text-muted hover:text-text-primary focus:bg-panel-hover focus:text-text-primary"
                                )}
                                onClick={() => {
                                commands.openFile(child.path, child.name);
                            }}
                        >
                            <FileIcon name={child.name} isDir={false} className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate flex-1">{child.name}</span>
                            {childStatus && (
                                <span
                                    className="text-xs font-bold w-4 text-center shrink-0 ml-1 leading-none self-center pt-0.5"
                                    style={{
                                        color: childStatus === "M" ? "var(--git-modified)" :
                                            childStatus === "A" || childStatus === "U" ? "var(--git-added)" :
                                                childStatus === "D" ? "var(--git-deleted)" : "var(--git-added)"
                                    }}
                                >
                                    {childStatus}
                                </span>
                            )}
                        </MenubarItem>
                    );
                })}
            </MenubarContent>
        </MenubarMenu>
    );
}

function BreadcrumbOutlineItem({
    part,
    kind,
    symbols,
    activeSymbolId,
    filePath
}: { part: string, kind: string | null, symbols: OutlineSymbol[], activeSymbolId: string | null, filePath: string }) {
    return (
        <MenubarMenu>
            <MenubarTrigger className="flex items-center gap-1 h-5 hover:text-text-primary px-1.5 py-0.5 rounded-[5px] cursor-pointer transition-colors outline-none hover:bg-panel-hover data-[state=open]:bg-panel-hover data-[state=open]:text-text-primary max-w-[250px]">
                {kind === null ? (
                    <FileIcon name={part} className="w-3.5 h-3.5 shrink-0" />
                ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={getSymbolIconPath(kind)} className="w-3.5 h-3.5 shrink-0 invert-0 dark:invert opacity" alt="" />
                )}
                <span className="truncate">{part}</span>
            </MenubarTrigger>
            <MenubarContent align="start" className="max-h-[400px] overflow-y-auto min-w-[220px] p-1 shadow-md custom-scrollbar z-modal bg-panel-secondary rounded-lg border-border">
                {symbols.length === 0 && <div className="px-1 py-1 text-xs text-text-muted">No symbols found in this file</div>}
                {symbols.map(sym => {
                    const isSelected = activeSymbolId === sym.id;
                    if (sym.children.length > 0) {
                        return <SymbolSubMenu key={sym.id} symbol={sym} filePath={filePath} isSelected={isSelected} />;
                    }
                    return (
                        <MenubarItem
                            key={sym.id}
                            className={cn(
                                "flex items-center gap-2 px-2 py-1 text-xs cursor-default rounded-md outline-none",
                                isSelected ? "bg-panel-active text-text-primary font-medium" : "text-text-muted hover:text-text-primary focus:bg-panel-hover focus:text-text-primary"
                            )}
                            onClick={() => handleJump(filePath, sym)}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={getSymbolIconPath(sym.kind)} className="w-3.5 h-3.5 shrink-0 invert-0 dark:invert opacity-80" alt="" />
                            <span className="truncate flex-1">{sym.name}</span>
                        </MenubarItem>
                    );
                })}
            </MenubarContent>
        </MenubarMenu>
    );
}

interface BreadcrumbProps {
    path: string;
    projectPath: string | null;
    isDiff?: boolean;
    isImage?: boolean;
    className?: string;
}

export function Breadcrumbs({ path, projectPath, isDiff, isImage, className }: BreadcrumbProps) {
    const { outlineResponse, cursorPos } = useBreadcrumbOutline(path, !isImage);
    const [gitStatuses, setGitStatuses] = useState<Map<string, string>>(new Map());
    const [gitModifiedDirs, setGitModifiedDirs] = useState<Map<string, string>>(new Map());

    useEffect(() => {
        if (!projectPath) return;
        let isCancelled = false;

        const loadGitStatus = async () => {
            try {
                const status = await commands.gitStatus(projectPath);
                if (isCancelled) return;
                const map = new Map<string, string>();
                const dirMap = new Map<string, string>();
                const statusPriority: Record<string, number> = { 'D': 4, 'A': 3, 'M': 2, 'U': 1 };
                const projectPrefix = projectPath.replace(/\\/g, '/').replace(/\/$/, '') + '/';
                status.forEach(s => {
                    const relPath = s.path.replace(/\\/g, '/');
                    const absPath = projectPrefix + relPath;
                    map.set(absPath, s.status);

                    let current = absPath;
                    while (true) {
                        const lastSlash = current.lastIndexOf('/');
                        if (lastSlash <= 0) break;
                        current = current.substring(0, lastSlash);
                        if (current.length < projectPrefix.length - 1) break;
                        const existing = dirMap.get(current);
                        const newPrio = statusPriority[s.status] || 0;
                        const existingPrio = existing ? (statusPriority[existing] || 0) : -1;
                        if (newPrio > existingPrio) {
                            dirMap.set(current, s.status);
                        }
                    }
                });
                setGitStatuses(map);
                setGitModifiedDirs(dirMap);
            } catch { }
        };

        loadGitStatus();
        return () => { isCancelled = true; };
    }, [projectPath]);

    if (!path) return null;

    let realPath = path;
    if (isDiff) {
        realPath = realPath.replace(/^diff:(staged|unstaged|commit:[^:]+):/, '');
    }
    let parts: string[] = [];

    if (projectPath && realPath.startsWith(projectPath)) {
        realPath = realPath.substring(projectPath.length).replace(/^[\\/]+/, "");
        parts = realPath.split(/[\\/]/).filter(Boolean);
    } else {
        parts = realPath.split(/[\\/]/).filter(Boolean);
    }

    const symbolChain = !isImage && outlineResponse ? findSymbolChain(outlineResponse.symbols, cursorPos.line, cursorPos.col) : [];

    return (
        <Menubar className={cn(
            "flex items-center pt-2 h-[28px] text-text-muted text-sm shrink-0 select-none w-full border-none shadow-none font-sans outline-none overflow-visible",
            isImage && "bg-editor",
            className
        )}>
            {parts.slice(0, -1).map((part, index) => {
                const folderPath = projectPath ? joinProjectFolder(projectPath, parts, index) : null;
                const nextPartName = parts[index + 1];

                return (
                    <React.Fragment key={`dir-${index}`}>
                        <div className="flex items-center">
                            {folderPath ? (
                                <BreadcrumbFolderItem part={part} folderPath={folderPath} nextPartName={nextPartName} gitStatuses={gitStatuses} gitModifiedDirs={gitModifiedDirs} />
                            ) : (
                                <span className="truncate max-w-[250px] px-1.5">{part}</span>
                            )}
                        </div>
                        <Icon name="chevron_right" size={16} className="text-text-muted shrink-0" />
                    </React.Fragment>
                );
            })}

            {parts.length > 0 && (() => {
                const fileName = parts[parts.length - 1];
                if (isImage) {
                    return (
                        <div className="flex items-center gap-1.5 px-1.5 text-text-primary">
                            <FileIcon name={fileName} className="w-3.5 h-3.5 shrink-0 opacity-80" />
                            <span className="truncate max-w-[250px]">{fileName}</span>
                        </div>
                    );
                }
                return (
                    <BreadcrumbOutlineItem
                        part={fileName}
                        kind={null}
                        symbols={outlineResponse ? outlineResponse.symbols : []}
                        activeSymbolId={symbolChain.length > 0 ? symbolChain[0].id : null}
                        filePath={path}
                    />
                );
            })()}

            {symbolChain.map((sym, index) => (
                <React.Fragment key={`sy-wrap-${sym.id}`}>
                    <Icon name="chevron_right" size={16} className="text-text-muted shrink-0" />
                    <BreadcrumbOutlineItem
                        part={sym.name}
                        kind={sym.kind}
                        symbols={sym.children}
                        activeSymbolId={index < symbolChain.length - 1 ? symbolChain[index + 1].id : null}
                        filePath={path}
                    />
                </React.Fragment>
            ))}
        </Menubar>
    );
}



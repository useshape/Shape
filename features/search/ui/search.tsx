"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { getFileExcludePatterns } from "@/lib/settings";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileIcon } from "@/components/ui/file-icon";
import { commands, useProjectState, ContentSearchResult, ContentMatch } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { useLoading } from "@/features/loading/context";
import { LoadingBar } from "@/components/ui/loading";
import { Tooltip } from "@/components/ui/tooltip";
import { confirm } from "@tauri-apps/plugin-dialog";
import {
    SidebarPanelHeader,
    SidebarPanelActionButton,
} from "@/features/panels/ui/sidebar-panel-header";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuSeparator,
    DropdownMenuLabel,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from "@/components/ui/dropdown";

const LANGUAGES = [
    { label: "TypeScript", pattern: "*.ts", ext: "ts" },
    { label: "TSX", pattern: "*.tsx", ext: "tsx" },
    { label: "JavaScript", pattern: "*.js", ext: "js" },
    { label: "JSX", pattern: "*.jsx", ext: "jsx" },
    { label: "Rust", pattern: "*.rs", ext: "rs" },
    { label: "Python", pattern: "*.py", ext: "py" },
    { label: "C", pattern: "*.c", ext: "c" },
    { label: "C++", pattern: "*.cpp", ext: "cpp" },
    { label: "Go", pattern: "*.go", ext: "go" },
    { label: "Java", pattern: "*.java", ext: "java" },
    { label: "PHP", pattern: "*.php", ext: "php" },
    { label: "Swift", pattern: "*.swift", ext: "swift" },
    { label: "Kotlin", pattern: "*.kt", ext: "kt" },
    { label: "Ruby", pattern: "*.rb", ext: "rb" },
    { label: "SQL", pattern: "*.sql", ext: "sql" },
    { label: "CSS", pattern: "*.css", ext: "css" },
    { label: "SCSS", pattern: "*.scss", ext: "scss" },
    { label: "HTML", pattern: "*.html", ext: "html" },
    { label: "Markdown", pattern: "*.md", ext: "md" },
    { label: "JSON", pattern: "*.json", ext: "json" },
    { label: "YAML", pattern: "*.yaml", ext: "yaml" },
    { label: "TOML", pattern: "*.toml", ext: "toml" },
    { label: "Shell", pattern: "*.sh", ext: "sh" },
    { label: "Svelte", pattern: "*.svelte", ext: "svelte" },
    { label: "Vue", pattern: "*.vue", ext: "vue" },
    { label: "Zig", pattern: "*.zig", ext: "zig" },
    { label: "Lua", pattern: "*.lua", ext: "lua" },
];

const AI_STYLE = `
@property --deg-start {
    syntax: '<angle>';
    initial-value: 180deg;
    inherits: false;
}
@property --stop-2 {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
}
@property --stop-3 {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
}
@property --stop-4 {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
}
@property --stop-5 {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
}
@property --stop-6 {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
}
@property --stop-7 {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
}

@keyframes ai-border-in {
    0% {
        --deg-start: 180deg;
        --stop-2: 0deg;
        --stop-3: 0deg;
        --stop-4: 0deg;
        --stop-5: 0deg;
        --stop-6: 0deg;
        --stop-7: 0deg;
        opacity: 0;
    }
    10% {
        opacity: 1;
    }
    100% {
        --deg-start: 0deg;
        --stop-2: 55deg;
        --stop-3: 120deg;
        --stop-4: 180deg;
        --stop-5: 240deg;
        --stop-6: 290deg;
        --stop-7: 324deg;
        opacity: 1;
    }
}

@keyframes ai-border-out {
    0% {
        --deg-start: 0deg;
        --stop-2: 55deg;
        --stop-3: 120deg;
        --stop-4: 180deg;
        --stop-5: 240deg;
        --stop-6: 290deg;
        --stop-7: 324deg;
        opacity: 1;
    }
    100% {
        --deg-start: 180deg;
        --stop-2: 55deg;
        --stop-3: 120deg;
        --stop-4: 180deg;
        --stop-5: 240deg;
        --stop-6: 290deg;
        --stop-7: 324deg;
        opacity: 0;
    }
}

.ai-border-animate-in {
    animation: ai-border-in 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    transition: opacity 0.5s ease;
}

.ai-border-animate-out {
    animation: ai-border-out 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    transition: opacity 0.5s ease;
}

.ai-border-static {
    --deg-start: 0deg;
    --stop-2: 55deg;
    --stop-3: 120deg;
    --stop-4: 180deg;
    --stop-5: 240deg;
    --stop-6: 290deg;
    --stop-7: 324deg;
    opacity: 1;
}

.ai-conic-bg {
    background: conic-gradient(
        from var(--deg-start) at 50% 50%,
        #005bf6 0deg,
        #b0c6e9 var(--stop-2),
        #feca00 var(--stop-3),
        #ff1c11 var(--stop-4),
        #ff00ea var(--stop-5),
        #ffa2fbcc var(--stop-6),
        transparent var(--stop-7),
        #95c1ffa1 349deg,
        #005bf6 360deg
    );
}

@property --ai-text-deg {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
}

@keyframes ai-text-spin {
    0%   { --ai-text-deg: 0deg; }
    100% { --ai-text-deg: 360deg; }
}

.ai-text-animate {
    background: conic-gradient(
        from var(--ai-text-deg) at 50% 50%,
        #005bf6 0deg,
        #b0c6e9 55deg,
        #feca00 120deg,
        #ff1c11 180deg,
        #ff00ea 240deg,
        #ffa2fbcc 290deg,
        transparent 324deg,
        #95c1ffa1 349deg,
        #005bf6 360deg
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: ai-text-spin 3s linear infinite;
}

.ai-inner-glow {
    -webkit-mask:
        linear-gradient(to right,  black, transparent 10px),
        linear-gradient(to left,   black, transparent 10px),
        linear-gradient(to bottom, black, transparent 10px),
        linear-gradient(to top,    black, transparent 10px);
    -webkit-mask-composite: screen;
    mask:
        linear-gradient(to right,  black, transparent 30px),
        linear-gradient(to left,   black, transparent 30px),
        linear-gradient(to bottom, black, transparent 30px),
        linear-gradient(to top,    black, transparent 30px);
    mask-composite: screen;
}
`;

export default function NavigatorSearch() {
    const { project_path } = useProjectState();
    const { startLoading, stopLoading } = useLoading();
    const [query, setQuery] = useState("");
    const [replaceQuery, setReplaceQuery] = useState("");
    const [mode, setMode] = useState<"search" | "replace">("search");
    const [results, setResults] = useState<ContentSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isReplacing, setIsReplacing] = useState(false);
    const [selectedMatch, setSelectedMatch] = useState<{ file: ContentSearchResult; match: ContentMatch } | null>(null);

    // Filter states
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [isRegex, setIsRegex] = useState(false);
    const [respectGitignore, setRespectGitignore] = useState(true);
    const [includeHidden, setIncludeHidden] = useState(false);
    const [followSymlinks, setFollowSymlinks] = useState(false);
    const [searchFilename, setSearchFilename] = useState(true);
    const [searchContent, setSearchContent] = useState(true);

    const [excludeTests, setExcludeTests] = useState(false);
    const [excludeDocs, setExcludeDocs] = useState(false);
    const [excludeBuild, setExcludeBuild] = useState(true);
    const [excludeAssets, setExcludeAssets] = useState(true);
    const [onlySource, setOnlySource] = useState(false);
    const [activeExtensions, setActiveExtensions] = useState<string[]>([]);

    useEffect(() => {
        const onMode = (e: Event) => {
            const detail = (e as CustomEvent<{ mode?: "search" | "replace" }>).detail;
            if (detail?.mode === "replace") setMode("replace");
            else if (detail?.mode === "search") setMode("search");
        };
        window.addEventListener("shape-search-mode", onMode);
        return () => window.removeEventListener("shape-search-mode", onMode);
    }, []);

    const buildSearchOptions = useCallback(() => {
        const effectiveInclude = activeExtensions.length > 0 ? activeExtensions.join(",") : undefined;
        return {
            case_sensitive: caseSensitive,
            whole_word: wholeWord,
            is_regex: isRegex,
            include_pattern: effectiveInclude,
            exclude_pattern: getFileExcludePatterns() || undefined,
            respect_gitignore: respectGitignore,
            include_hidden: includeHidden,
            follow_symlinks: followSymlinks,
            exclude_tests: excludeTests,
            exclude_docs: excludeDocs,
            exclude_build: excludeBuild,
            exclude_assets: excludeAssets,
            only_source: onlySource,
        };
    }, [
        activeExtensions, caseSensitive, wholeWord, isRegex,
        respectGitignore, includeHidden, followSymlinks,
        excludeTests, excludeDocs, excludeBuild, excludeAssets, onlySource,
    ]);

    const handleSearch = useCallback(async () => {
        if (!project_path || !query.trim()) {
            setResults([]);
            return;
        }
        if (!searchContent && !searchFilename) {
            notify.error("Search", "Enable 'Search file names' or 'Search file contents' to run a search.");
            setResults([]);
            return;
        }
        setIsLoading(true);
        startLoading();
        try {
            if (!searchContent && searchFilename) {
                // File Name search only
                const raw = await commands.searchProjectFiles(query, 1500);
                const q = query.trim();
                const qLower = q.toLowerCase();

                const matchesFilename = (name: string, path: string): boolean => {
                    const target = isRegex ? name : (caseSensitive ? name : name.toLowerCase());
                    const needle = isRegex ? q : (caseSensitive ? q : qLower);
                    if (isRegex) {
                        try {
                            const re = new RegExp(needle, caseSensitive ? "" : "i");
                            return re.test(name) || re.test(path);
                        } catch {
                            return name.includes(q) || path.includes(q);
                        }
                    }
                    if (wholeWord) {
                        const wordRe = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, caseSensitive ? "" : "i");
                        return wordRe.test(name) || wordRe.test(path);
                    }
                    return target.includes(needle);
                };

                // apply local filtering so checkboxes actually work for file searches
                const filtered = raw.filter((r: { path: string; relative_path: string; name?: string }) => {
                    const fileName = r.name ?? r.relative_path.split(/[\\/]/).pop() ?? r.relative_path;
                    if (!matchesFilename(fileName, r.relative_path)) return false;
                    const lPath = r.relative_path.toLowerCase();
                    if (onlySource && !(lPath.endsWith(".ts") || lPath.endsWith(".tsx") || lPath.endsWith(".rs") || lPath.endsWith(".js") || lPath.endsWith(".jsx") || lPath.endsWith(".py") || lPath.endsWith(".go") || lPath.endsWith(".c") || lPath.endsWith(".cpp"))) return false;
                    if (excludeBuild && (lPath.includes("node_modules/") || lPath.includes("target/") || lPath.includes("dist/") || lPath.includes("build/"))) return false;
                    if (excludeAssets && (lPath.endsWith(".png") || lPath.endsWith(".jpg") || lPath.endsWith(".jpeg") || lPath.endsWith(".svg") || lPath.endsWith(".gif") || lPath.endsWith(".mp4") || lPath.endsWith(".ico"))) return false;
                    if (excludeDocs && (lPath.endsWith(".md") || lPath.endsWith(".txt") || lPath.includes("docs/"))) return false;
                    if (excludeTests && (lPath.includes(".test.") || lPath.includes(".spec.") || lPath.includes("tests/"))) return false;
                    if (activeExtensions.length > 0) {
                        const hasExt = activeExtensions.some((ext: string) => {
                            const extSuffix = ext.replace("*", "");
                            return lPath.endsWith(extSuffix);
                        });
                        if (!hasExt) return false;
                    }
                    return true;
                });

                // Map SearchResult to ContentSearchResult
                const mapped: ContentSearchResult[] = filtered.slice(0, 100).map((r: { path: string; relative_path: string }) => ({
                    path: r.path,
                    relative_path: r.relative_path,
                    matches: []
                }));
                setResults(mapped);
            } else if (searchContent) {
                const data = await commands.searchContent(query, buildSearchOptions());
                setResults(data);
            } else {
                setResults([]);
            }
        } catch (err) {
            console.error("Search failed:", err);
            setResults([]);
            notify.error("Search", String(err), { code: 4300 });
        } finally {
            setIsLoading(false);
            stopLoading();
        }
    }, [
        project_path, query, caseSensitive, wholeWord, isRegex,
        respectGitignore,
        includeHidden,
        followSymlinks,
        excludeTests,
        excludeDocs,
        excludeBuild,
        excludeAssets,
        onlySource,
        activeExtensions, startLoading, stopLoading,
        searchContent, searchFilename, buildSearchOptions
    ]);

    const handleReplace = useCallback(async (replaceAll: boolean) => {
        if (!project_path || !query.trim() || !searchContent) {
            notify.error("Replace", "Enter a search query with file content search enabled.");
            return;
        }

        const totalMatches = results.reduce((acc, r) => acc + r.matches.length, 0);
        if (totalMatches === 0) {
            notify.error("Replace", "No matches to replace. Run a search first.");
            return;
        }

        if (replaceAll) {
            const ok = await confirm(
                `Replace all ${totalMatches} occurrence${totalMatches === 1 ? "" : "s"} in ${results.length} file${results.length === 1 ? "" : "s"}?`,
                { title: "Replace All", kind: "warning" },
            );
            if (!ok) return;
        } else if (!selectedMatch) {
            notify.error("Replace", "Select a match to replace.");
            return;
        }

        setIsReplacing(true);
        startLoading();
        try {
            const result = await commands.replaceContent(
                query,
                replaceQuery,
                buildSearchOptions(),
                replaceAll ? null : selectedMatch!.match,
                replaceAll ? null : selectedMatch!.file.path,
            );
            if (result.errors.length > 0) {
                notify.error("Replace", result.errors[0], { code: 4300 });
            } else {
                notify.success(
                    "Replace",
                    `Replaced ${result.replacements_count} occurrence${result.replacements_count === 1 ? "" : "s"} in ${result.files_modified} file${result.files_modified === 1 ? "" : "s"}.`,
                );
            }
            setSelectedMatch(null);
            await handleSearch();
        } catch (err) {
            console.error("Replace failed:", err);
            notify.error("Replace", String(err), { code: 4300 });
        } finally {
            setIsReplacing(false);
            stopLoading();
        }
    }, [
        project_path, query, replaceQuery, searchContent, results,
        selectedMatch, buildSearchOptions, handleSearch, startLoading, stopLoading,
    ]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.length >= 2) {
                handleSearch();
            } else if (query.length === 0) {
                setResults([]);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [query, handleSearch]);

    const toggleExtension = (pattern: string) => {
        setActiveExtensions(prev =>
            prev.includes(pattern) ? prev.filter(p => p !== pattern) : [...prev, pattern]
        );
    };

    const headerActions = (
        <div className="flex items-center gap-0.5">
            <Tooltip content={mode === "search" ? "Switch to Replace" : "Switch to Search"}>
                <SidebarPanelActionButton
                    onClick={() => setMode(mode === "search" ? "replace" : "search")}
                >
                    <Icon name={mode === "search" ? "find_replace" : "search"} size={14} />
                </SidebarPanelActionButton>
            </Tooltip>
            <Tooltip content="Refresh">
                <SidebarPanelActionButton onClick={handleSearch}>
                    <Icon name="refresh" size={14} />
                </SidebarPanelActionButton>
            </Tooltip>
            <Tooltip content="Clear">
                <SidebarPanelActionButton
                    onClick={() => {
                        setQuery("");
                        setResults([]);
                    }}
                >
                    <Icon name="close" size={14} />
                </SidebarPanelActionButton>
            </Tooltip>
        </div>
    );

    return (
        <div className="w-full h-full flex flex-col select-none overflow-hidden font-sans">
            <style>{AI_STYLE}</style>
            <SidebarPanelHeader
                title={mode === "search" ? "Search" : "Replace"}
                side="left"
                panelId="search"
                actions={headerActions}
            />
            <LoadingBar />

            <div className="flex-1 overflow-hidden flex flex-col px-2 py-1 gap-3">
                <div className="flex flex-col gap-2">
                    <div className="relative group/input flex items-center bg-editor-secondary/60 rounded-lg border border-white/10 focus-within:border-white/20 transition-all">
                        <div className="pl-2 px-0.5 text-text-muted">
                            <Icon name="search" size={16} />
                        </div>
                        <Input
                            placeholder="Search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            className="bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-7 text-xs px-1 flex-1 shadow-none"
                        />
                        <div className="flex items-center">
                            {mode === "replace" && (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        className="h-7 px-2 text-xs hover:bg-panel-hover"
                                        disabled={isReplacing || isLoading}
                                        onClick={() => handleReplace(false)}
                                    >
                                        Replace
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        className="h-7 px-2 text-xs hover:bg-panel-hover"
                                        disabled={isReplacing || isLoading}
                                        onClick={() => handleReplace(true)}
                                    >
                                        Replace All
                                    </Button>
                                </>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="xs" className="w-7 h-7 p-0 hover:bg-panel-hover text-text-muted transition-colors rounded">
                                        <Icon name="more_horiz" size={16} />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuLabel>Search In</DropdownMenuLabel>
                                    <DropdownMenuCheckboxItem checked={searchContent} onCheckedChange={setSearchContent}>
                                        <Icon name="description" size={14} className="opacity-70" />
                                        File Content
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem checked={searchFilename} onCheckedChange={setSearchFilename}>
                                        <Icon name="file_copy" size={14} className="opacity-70" />
                                        File Names
                                    </DropdownMenuCheckboxItem>

                                    <DropdownMenuSeparator />

                                    <DropdownMenuLabel>Filters</DropdownMenuLabel>
                                    <DropdownMenuCheckboxItem checked={caseSensitive} onCheckedChange={setCaseSensitive}>Match Case</DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem checked={wholeWord} onCheckedChange={setWholeWord}>Match Whole Word</DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem checked={isRegex} onCheckedChange={setIsRegex}>Regular Expression</DropdownMenuCheckboxItem>

                                    <DropdownMenuSeparator />

                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                            <Icon name="list" size={14} className="opacity-70" />
                                            Language Filters
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent className="w-56 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                            {LANGUAGES.map(lang => (
                                                <DropdownMenuCheckboxItem
                                                    key={lang.pattern}
                                                    checked={activeExtensions.includes(lang.pattern)}
                                                    onCheckedChange={() => toggleExtension(lang.pattern)}
                                                >
                                                    <FileIcon name={`file.${lang.ext}`} className="size-3.5 shrink-0" />
                                                    {lang.label}
                                                </DropdownMenuCheckboxItem>
                                            ))}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>

                                    <DropdownMenuSeparator />

                                    <DropdownMenuLabel>Advanced</DropdownMenuLabel>
                                    <DropdownMenuCheckboxItem checked={respectGitignore} onCheckedChange={setRespectGitignore}>Respect .gitignore</DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem checked={includeHidden} onCheckedChange={setIncludeHidden}>Shadow Files (Hidden)</DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem checked={followSymlinks} onCheckedChange={setFollowSymlinks} disabled>Follow Symlinks</DropdownMenuCheckboxItem>

                                    <DropdownMenuSeparator />

                                    <DropdownMenuLabel>Exclusions</DropdownMenuLabel>
                                    <DropdownMenuCheckboxItem checked={excludeBuild} onCheckedChange={setExcludeBuild}>Exclude Build / Dist</DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem checked={excludeAssets} onCheckedChange={setExcludeAssets}>Exclude Media Assets</DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem checked={excludeDocs} onCheckedChange={setExcludeDocs}>Exclude Documentation</DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem checked={excludeTests} onCheckedChange={setExcludeTests}>Exclude Tests</DropdownMenuCheckboxItem>

                                    <DropdownMenuSeparator />
                                    <DropdownMenuCheckboxItem checked={onlySource} onCheckedChange={setOnlySource}>Only Source Code Files</DropdownMenuCheckboxItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                    {mode === "replace" && (
                        <div className="relative group/input flex items-center bg-editor-secondary/60 rounded-lg border border-white/10 focus-within:border-white/20 transition-all">
                            <div className="pl-2 px-0.5 text-text-muted">
                                <Icon name="find_replace" size={16} />
                            </div>
                            <Input
                                placeholder="Replace"
                                value={replaceQuery}
                                onChange={(e) => setReplaceQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleReplace(false);
                                }}
                                className="bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-7 text-xs px-1 flex-1 shadow-none"
                            />
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-3 animate-pulse">
                        </div>
                    ) : results.length > 0 ? (
                        <div className="flex flex-col gap-1">
                            <div className="text-xs text-text-muted mb-2 font-medium">
                                {!searchContent && searchFilename
                                    ? `${results.length} files found`
                                    : `${results.reduce((acc, r) => acc + r.matches.length, 0)} results in ${results.length} files`
                                }
                            </div>
                            {results.map((file) => (
                                <FileResult
                                    key={file.path}
                                    file={file}
                                    isFilenameOnly={!searchContent && searchFilename}
                                    mode={mode}
                                    selectedMatch={selectedMatch}
                                    onSelectMatch={(match) => setSelectedMatch({ file, match })}
                                />
                            ))}
                        </div>
                    ) : query.length > 0 && !isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-2">
                            <Icon name="search" size={20} className="opacity-40" />
                            <span className="text-xs font-medium">No results found</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-2 opacity-50">
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function FileResult({
    file,
    isFilenameOnly,
    mode,
    selectedMatch,
    onSelectMatch,
}: {
    file: ContentSearchResult;
    isFilenameOnly?: boolean;
    mode: "search" | "replace";
    selectedMatch: { file: ContentSearchResult; match: ContentMatch } | null;
    onSelectMatch: (match: ContentMatch) => void;
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleContainerClick = () => {
        if (isFilenameOnly || file.matches.length === 0) {
            commands.openFile(file.path, file.relative_path.split(/[\\/]/).pop() || "");
        } else {
            setIsCollapsed(!isCollapsed);
        }
    };

    return (
        <div className="flex flex-col">
            <div
                onClick={handleContainerClick}
                className="flex items-center gap-2 px-0.5 py-1 hover:bg-panel-hover rounded-lg cursor-pointer group transition-colors"
            >
                {!isFilenameOnly && file.matches.length > 0 ? (
                    <Icon name="expand_more" size={16} className={cn("text-text-muted transition-transform duration-200", isCollapsed && "-rotate-90")} />
                ) : (
                    <div className="w-3" /> // spacer
                )}
                <div className="shrink-0">
                    <FileIcon name={file.relative_path.split(/[\\/]/).pop() || ""} />
                </div>
                <div className="flex flex-row items-center min-w-0 flex-1 gap-2">
                    <span className="text-sm font-medium text-text-primary truncate shrink-0">
                        {file.relative_path.split(/[\\/]/).pop()}
                    </span>
                    <span className="text-sm text-text-muted truncate">
                        {file.relative_path.split(/[\\/]/).slice(0, -1).join("/") || "."}
                    </span>
                </div>
                {!isFilenameOnly && file.matches.length > 0 && (
                    <span className="text-text-primary text-xs font-semibold min-w-[20px] text-center">
                        {file.matches.length}
                    </span>
                )}
            </div>

            {!isCollapsed && !isFilenameOnly && file.matches.length > 0 && (
                <div className="flex flex-col pl-7 mt-0.5 mb-2 gap-0.5">
                    {file.matches.map((match, idx) => (
                        <MatchRow
                            key={`${file.path}-${match.line_number}-${match.column_start}-${idx}`}
                            match={match}
                            path={file.path}
                            isSelected={
                                mode === "replace"
                                && selectedMatch?.file.path === file.path
                                && selectedMatch.match.line_number === match.line_number
                                && selectedMatch.match.column_start === match.column_start
                            }
                            onSelect={() => onSelectMatch(match)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function MatchRow({
    match,
    path,
    isSelected,
    onSelect,
}: {
    match: ContentMatch;
    path: string;
    isSelected?: boolean;
    onSelect?: () => void;
}) {
    const handleOpen = () => {
        onSelect?.();
        commands.openFile(path, path.split(/[\\/]/).pop() || "");
        window.dispatchEvent(new CustomEvent("shape-editor-jump", {
            detail: {
                path,
                line: match.line_number,
                column: match.column_start
            }
        }));
    };

    const beforeMatch = match.line_text.slice(0, match.column_start);
    const matchText = match.line_text.slice(match.column_start, match.column_end);
    const afterMatch = match.line_text.slice(match.column_end);

    return (
        <div
            onClick={handleOpen}
            className={cn(
                "flex items-center gap-3 px-2 py-1 hover:bg-panel-hover rounded-lg cursor-pointer group text-xs transition-all",
                isSelected && "bg-accent/20 ring-1 ring-accent/40",
            )}
        >
            <span className="text-text-muted shrink-0 w-7 text-right font-mono text-xs">{match.line_number}</span>
            <div className="text-text-secondary group-hover:text-text-primary transition-colors truncate font-sans whitespace-pre">
                <span>{beforeMatch}</span>
                <span className="bg-accent text-text-primary font-bold rounded-lg px-0.5">{matchText}</span>
                <span>{afterMatch}</span>
            </div>
        </div>
    );
}

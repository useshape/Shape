"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Checkmark } from "@/components/ui/checkmark";
import { Icon } from "@/components/ui/icon";
import { SearchInput } from "@/components/ui/search";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll";
import { openProjectFile } from "@/lib/open-project-file";
import { getProjectPath } from "@/lib/backend";
import { resolveSourcePath } from "../design-mode/apply-to-source";
import { isResolvedSource } from "../design-mode/source-identity";
import { getDesignBridge, upsertDesignPending, useDesignModeStore } from "../design-mode/store";
import type { DesignInspect, DesignPropertyInspect, DesignSelectedElement } from "../design-mode/types";

const PSEUDO_STATES = ["hover", "focus", "focus-visible", "active", "focus-within", "target"] as const;

function fileLabel(path: string) {
    return path.split(/[/\\]/).pop() || path;
}

function sourceLine(el: DesignSelectedElement) {
    if (!isResolvedSource(el.source) || !el.source) return null;
    return `${fileLabel(el.source.fileName)} · ${el.source.lineNumber}:${el.source.columnNumber ?? 1}`;
}

async function openSelectedSource(el: DesignSelectedElement) {
    if (!isResolvedSource(el.source) || !el.source) return;
    const project = getProjectPath();
    if (!project) return;
    const paths = resolveSourcePath(project, el.source);
    for (const p of paths) {
        if (await openProjectFile(p)) return;
    }
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-2 py-0.5 text-sm">
            <span className="text-text-muted">{label}</span>
            <span className="min-w-0 truncate text-right text-text-primary">{value}</span>
        </div>
    );
}

function BoxDiagram({ box }: { box: DesignInspect["box"] }) {
    const m = (v: string) => v.replace(/px$/, "");
    return (
        <div className="mx-auto w-full max-w-[220px] text-xs text-text-muted">
            <div className="rounded-md border border-border-subtle p-1">
                <div className="text-center">{m(box.marginTop)}</div>
                <div className="flex items-center gap-1">
                    <span className="w-6 text-center">{m(box.marginLeft)}</span>
                    <div className="min-w-0 flex-1 rounded-md border border-border-subtle p-1">
                        <div className="text-center">{m(box.paddingTop)}</div>
                        <div className="flex items-center gap-1">
                            <span className="w-6 text-center">{m(box.paddingLeft)}</span>
                            <div className="min-w-0 flex-1 rounded-md bg-accent-text-bg px-1 py-2 text-center text-accent-text">
                                {Math.round(box.width)}×{Math.round(box.height)}
                            </div>
                            <span className="w-6 text-center">{m(box.paddingRight)}</span>
                        </div>
                        <div className="text-center">{m(box.paddingBottom)}</div>
                    </div>
                    <span className="w-6 text-center">{m(box.marginRight)}</span>
                </div>
                <div className="text-center">{m(box.marginBottom)}</div>
            </div>
        </div>
    );
}

function matchesFilter(q: string, ...parts: Array<string | undefined | null>) {
    if (!q) return true;
    const n = q.toLowerCase();
    return parts.some((p) => p && p.toLowerCase().includes(n));
}

function originKind(origin: DesignPropertyInspect) {
    if (origin.inherited) return "inherited";
    if (origin.source.kind === "variable") return "variable";
    if (origin.source.media) return "responsive";
    if (origin.source.className?.includes(":")) return "state";
    return origin.source.kind;
}

function InspectToolbar({
    styleFilter,
    onStyleFilter,
    paused,
    onPaused,
    pseudo,
    onPseudo,
    emulateFocus,
    onEmulateFocus,
    classes,
    toggleClass,
}: {
    styleFilter: string;
    onStyleFilter: (v: string) => void;
    paused: boolean;
    onPaused: (v: boolean) => void;
    pseudo: Record<string, boolean>;
    onPseudo: (name: string) => void;
    emulateFocus: boolean;
    onEmulateFocus: (v: boolean) => void;
    classes: Array<{ name: string; enabled: boolean; kind: string }>;
    toggleClass: (name: string, enabled: boolean) => void;
}) {
    return (
        <div className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-sm py-1">
            <SearchInput icon="filter" value={styleFilter} onChange={(e) => onStyleFilter(e.target.value)} placeholder="Filter" />
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="xs" title="Force element state">
                        :hov
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>States</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {PSEUDO_STATES.map((name) => (
                        <DropdownMenuCheckboxItem key={name} checked={!!pseudo[name]} onCheckedChange={() => onPseudo(name)}>
                            :{name}
                        </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem checked={emulateFocus} onCheckedChange={(v) => onEmulateFocus(!!v)}>
                        Keep preview focused
                    </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="xs" title="Element classes">
                        .cls
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{classes.length ? `${classes.length} classes` : "No classes"}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {classes.length ? (
                        classes.map((cls) => (
                            <DropdownMenuCheckboxItem key={cls.name} checked={cls.enabled} onCheckedChange={(v) => toggleClass(cls.name, !!v)}>
                                .{cls.name}
                            </DropdownMenuCheckboxItem>
                        ))
                    ) : (
                        <p className="px-sm py-1 text-sm text-text-muted">No classes on this element.</p>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant={paused ? "secondary" : "ghost"} size="icon" title={paused ? "Resume preview" : "Pause preview"} onClick={() => onPaused(!paused)}>
                <Icon name={paused ? "play_arrow" : "pause"} size={14} />
            </Button>
        </div>
    );
}

export function DesignInspectPanel({
    styleFilter,
    onStyleFilter,
    paused,
    onPaused,
    resumeAfterEdit,
    onResumeAfterEdit,
    pseudo,
    onPseudo,
    watching,
    onWatch,
    emulateFocus,
    onEmulateFocus,
}: {
    styleFilter: string;
    onStyleFilter: (v: string) => void;
    paused: boolean;
    onPaused: (v: boolean) => void;
    resumeAfterEdit: boolean;
    onResumeAfterEdit: (v: boolean) => void;
    pseudo: Record<string, boolean>;
    onPseudo: (name: string) => void;
    watching: boolean;
    onWatch: (v: boolean) => void;
    emulateFocus: boolean;
    onEmulateFocus: (v: boolean) => void;
}) {
    const { selected } = useDesignModeStore();
    const inspect = selected?.inspect;
    const bridge = getDesignBridge();
    const q = styleFilter.trim().toLowerCase();

    const classes = inspect?.classes ?? (selected?.className ? selected.className.split(/\s+/).filter(Boolean).map((name) => ({ name, enabled: true, kind: "class" as const })) : []);

    const toggleClass = (name: string, enabled: boolean) => {
        if (!selected) return;
        bridge?.classToggle?.(selected.id, name, enabled, selected.selector);
        if (!isResolvedSource(selected.source) && !(selected.className || selected.locateText)) return;
        upsertDesignPending({
            id: selected.id,
            tag: selected.tag,
            selector: selected.selector,
            className: selected.className,
            locateText: selected.locateText,
            source: selected.source,
            label: selected.label,
            styles: {},
            inspect,
            classToggles: { [name]: enabled },
        });
    };

    if (!selected) {
        return <p className="px-sm py-3 text-sm text-text-muted">Select an element in the preview.</p>;
    }

    const origins = Object.entries(inspect?.origins ?? {}).filter(([, o]) => {
        if (!o.computed || o.computed === "none" || o.computed === "normal" || o.computed === "auto") return false;
        return matchesFilter(q, o.property, o.computed, o.authored, o.source.label, o.source.selector, o.source.href, originKind(o));
    });

    const issues = (inspect?.issues ?? []).filter((issue) => matchesFilter(q, issue.title, issue.detail, issue.id));

    return (
        <Tabs defaultValue="styles" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <TabsList variant="line">
                <TabsTrigger value="styles">Styles</TabsTrigger>
                <TabsTrigger value="computed">Computed</TabsTrigger>
                <TabsTrigger value="layout">Layout</TabsTrigger>
                <TabsTrigger value="a11y">A11y</TabsTrigger>
                <TabsTrigger value="issues">Issues</TabsTrigger>
            </TabsList>
            <InspectToolbar
                styleFilter={styleFilter}
                onStyleFilter={onStyleFilter}
                paused={paused}
                onPaused={onPaused}
                pseudo={pseudo}
                onPseudo={onPseudo}
                emulateFocus={emulateFocus}
                onEmulateFocus={onEmulateFocus}
                classes={classes}
                toggleClass={toggleClass}
            />
            {paused ? (
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-panel-hover px-sm py-1 text-sm text-text-secondary">
                    Preview paused
                    <label className="flex items-center gap-2">
                        <Checkmark checked={resumeAfterEdit} onCheckedChange={(v) => onResumeAfterEdit(v === true)} />
                        Resume after edit
                    </label>
                </div>
            ) : null}
            <TabsContent value="styles" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                    <div className="px-sm py-2">
                        <Fact label="Element" value={selected.tag} />
                        <Button type="button" variant="ghost" size="xs" className="w-full justify-start" onClick={() => void openSelectedSource(selected)}>
                            {sourceLine(selected) || "No source identity"}
                        </Button>
                        <Button type="button" variant={watching ? "secondary" : "ghost"} size="xs" onClick={() => onWatch(!watching)}>
                            {watching ? "Watching" : "Watch element"}
                        </Button>
                    </div>
                    {origins.length === 0 ? (
                        <p className="px-sm py-2 text-sm text-text-muted">No authored styles match this filter.</p>
                    ) : (
                        origins.map(([key, origin]) => (
                            <div key={key} className={cn("px-sm py-1 text-sm", origin.inactive && "opacity-50")}>
                                <div className="flex items-start gap-1">
                                    <span className="text-text-secondary">{origin.property}</span>
                                    <span className="min-w-0 break-all text-text-primary">{origin.authored}</span>
                                </div>
                                <div className="flex flex-wrap gap-x-2 text-xs text-text-muted">
                                    <span>{originKind(origin)}</span>
                                    <span>{origin.source.label}</span>
                                    {origin.overridden ? <span>overridden</span> : null}
                                    {origin.inactive ? <span>inactive</span> : null}
                                </div>
                            </div>
                        ))
                    )}
                </ScrollArea>
            </TabsContent>
            <TabsContent value="computed" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                    <div className="px-sm py-2">
                        {origins.map(([key, origin]) => (
                            <Fact key={key} label={origin.property} value={origin.computed} />
                        ))}
                    </div>
                </ScrollArea>
            </TabsContent>
            <TabsContent value="layout" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                    {inspect ? (
                        <CollapsibleSection title="Box model" defaultOpen>
                            <div className="px-sm pb-sm">
                                <BoxDiagram box={inspect.box} />
                            </div>
                        </CollapsibleSection>
                    ) : null}
                    <CollapsibleSection title="Layout" defaultOpen={!!inspect?.layout.isFlex || !!inspect?.layout.isGrid}>
                        <div className="px-sm pb-sm">
                            <Fact label="Display" value={inspect?.layout.display || selected.styles.display} />
                            <Fact label="Position" value={inspect?.layout.position} />
                            {inspect?.layout.isFlex ? (
                                <>
                                    <Fact label="Direction" value={inspect.layout.flexDirection} />
                                    <Fact label="Wrap" value={inspect.layout.flexWrap} />
                                    <Fact label="Justify" value={inspect.layout.justifyContent} />
                                    <Fact label="Align" value={inspect.layout.alignItems} />
                                    <Fact label="Gap" value={inspect.layout.gap} />
                                </>
                            ) : null}
                            {inspect?.layout.isGrid ? (
                                <>
                                    <Fact label="Columns" value={inspect.layout.gridTemplateColumns} />
                                    <Fact label="Rows" value={inspect.layout.gridTemplateRows} />
                                    <Fact label="Gap" value={inspect.layout.gap} />
                                </>
                            ) : null}
                            <Fact
                                label="Size"
                                value={
                                    inspect
                                        ? `${Math.round(inspect.box.width)}×${Math.round(inspect.box.height)}`
                                        : `${selected.styles.width} × ${selected.styles.height}`
                                }
                            />
                            <Fact
                                label="Viewport"
                                value={inspect ? `${inspect.responsive.breakpoint} · ${inspect.responsive.width}×${inspect.responsive.height}` : "—"}
                            />
                        </div>
                    </CollapsibleSection>
                </ScrollArea>
            </TabsContent>
            <TabsContent value="a11y" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                    <div className="px-sm py-2">
                        <Fact label="Name" value={inspect?.accessibility.name} />
                        <Fact label="Role" value={inspect?.accessibility.role} />
                        <Fact label="Focusable" value={inspect?.accessibility.focusable ? "yes" : "no"} />
                        {inspect?.accessibility.alt != null ? <Fact label="Alt" value={inspect.accessibility.alt || "(empty)"} /> : null}
                        <Fact
                            label="Contrast"
                            value={inspect?.accessibility.contrast != null ? `${inspect.accessibility.contrast.toFixed(2)}:1` : "—"}
                        />
                        <Fact
                            label="Forced"
                            value={
                                Object.entries(pseudo)
                                    .filter(([, on]) => on)
                                    .map(([n]) => `:${n}`)
                                    .join(" ") || "none"
                            }
                        />
                    </div>
                </ScrollArea>
            </TabsContent>
            <TabsContent value="issues" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                    <div className="px-sm py-2">
                        {issues.length === 0 ? (
                            <p className="text-sm text-text-muted">No issues detected.</p>
                        ) : (
                            issues.map((issue) => (
                                <div key={issue.id} className="py-1 text-sm">
                                    <div className={issue.severity === "warn" ? "text-text-primary" : "text-text-secondary"}>{issue.title}</div>
                                    {issue.detail ? <div className="text-xs text-text-muted">{issue.detail}</div> : null}
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </TabsContent>
        </Tabs>
    );
}

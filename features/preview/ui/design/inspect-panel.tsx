"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { openProjectFile } from "@/lib/open-project-file";
import { getProjectPath } from "@/lib/backend";
import { resolveSourcePath } from "../../design-mode/apply/source-files";
import { enrichSourceIdentity, isResolvedSource } from "../../design-mode/identity";
import { getDesignBridge, upsertDesignPending, useDesignModeStore } from "../../design-mode/store";
import type { DesignInspect, DesignPropertyInspect, DesignSelectedElement } from "../../design-mode/types";

const PSEUDO_STATES = ["hover", "focus", "focus-visible", "active", "focus-within", "target"] as const;

function fileLabel(path: string) {
    return path.split(/[/\\]/).pop() || path;
}

function sourceLine(el: DesignSelectedElement) {
    const src = enrichSourceIdentity(el.source);
    if (!src?.fileName) return el.label;
    const name = fileLabel(src.fileName);
    if (src.mapped === false) return name;
    return `${name} · ${src.lineNumber}:${src.columnNumber ?? 1}`;
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

function Section({
    title,
    children,
    defaultOpen = true,
}: {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = React.useState(defaultOpen);
    return (
        <div className="border-b border-border-subtle">
            <button
                type="button"
                className="flex h-7 w-full items-center justify-between px-2 text-left text-xs font-medium text-text-primary"
                onClick={() => setOpen((v) => !v)}
            >
                {title}
                <Icon name="chevron_right" size={12} className={cn("text-text-muted transition-transform", open && "rotate-90")} />
            </button>
            {open ? <div className="px-2 pb-2">{children}</div> : null}
        </div>
    );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-2 py-0.5 text-xs">
            <span className="text-text-muted">{label}</span>
            <span className="min-w-0 truncate text-right text-text-primary">{value}</span>
        </div>
    );
}

function BoxDiagram({ box }: { box: DesignInspect["box"] }) {
    const m = (v: string) => v.replace(/px$/, "");
    return (
        <div className="mx-auto w-full max-w-[220px] text-[10px] text-text-muted">
            <div className="rounded-sm border border-border-subtle p-1">
                <div className="text-center">{m(box.marginTop)}</div>
                <div className="flex items-center gap-1">
                    <span className="w-6 text-center">{m(box.marginLeft)}</span>
                    <div className="min-w-0 flex-1 rounded-sm border border-border-subtle p-1">
                        <div className="text-center">{m(box.paddingTop)}</div>
                        <div className="flex items-center gap-1">
                            <span className="w-6 text-center">{m(box.paddingLeft)}</span>
                            <div className="min-w-0 flex-1 rounded-sm bg-accent-text-bg px-1 py-2 text-center text-accent-text">
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
        if (!isResolvedSource(selected.source)) return;
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
        return <p className="px-2 py-3 text-xs text-text-muted">Select an element in the preview.</p>;
    }

    const origins = Object.entries(inspect?.origins ?? {}).filter(([, o]) => {
        if (!o.computed || o.computed === "none" || o.computed === "normal" || o.computed === "auto") return false;
        return matchesFilter(q, o.property, o.computed, o.authored, o.source.label, o.source.selector, o.source.href, originKind(o));
    });

    const issues = (inspect?.issues ?? []).filter((issue) => {
        if (issue.id === "no-source") return false;
        if (/source identity|preview only/i.test(`${issue.title} ${issue.detail || ""}`)) return false;
        return matchesFilter(q, issue.title, issue.detail, issue.id);
    });

    return (
        <Tabs defaultValue="styles" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center px-2 py-1">
                <TabsList>
                    <TabsTrigger value="styles">Styles</TabsTrigger>
                    <TabsTrigger value="computed">Computed</TabsTrigger>
                    <TabsTrigger value="layout">Layout</TabsTrigger>
                    <TabsTrigger value="a11y">A11y</TabsTrigger>
                    <TabsTrigger value="issues">Issues</TabsTrigger>
                </TabsList>
            </div>
            <div className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-2 py-1.5">
                <Input value={styleFilter} onChange={(e) => onStyleFilter(e.target.value)} placeholder="Filter properties, sources, issues" className="h-7 min-w-0 flex-1 text-xs" />
                <Button type="button" variant="ghost" size="icon" title={paused ? "Resume preview" : "Pause preview"} className={cn(paused && "bg-panel-active text-text-primary")} onClick={() => onPaused(!paused)}>
                    <Icon name={paused ? "play_arrow" : "pause"} size={14} />
                </Button>
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="xs" title="Force element state">
                            :hov
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[200px]">
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
                    <DropdownMenuContent align="end" className="min-w-[240px]">
                        <DropdownMenuLabel>{classes.length ? `${classes.length} classes` : "No classes"}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {classes.length ? (
                            classes.map((cls) => (
                                <DropdownMenuCheckboxItem key={cls.name} checked={cls.enabled} onCheckedChange={(v) => toggleClass(cls.name, !!v)}>
                                    <span className="flex min-w-0 flex-col">
                                        <span className="truncate">.{cls.name}</span>
                                        <span className="text-[10px] text-text-muted">{cls.kind}</span>
                                    </span>
                                </DropdownMenuCheckboxItem>
                            ))
                        ) : (
                            <p className="px-2 py-1 text-xs text-text-muted">No classes on this element.</p>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {paused ? (
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-panel-hover px-2 py-1 text-xs text-text-secondary">
                    Preview paused
                    <label className="flex items-center gap-1">
                        <input type="checkbox" checked={resumeAfterEdit} onChange={(e) => onResumeAfterEdit(e.target.checked)} />
                        Resume after edit
                    </label>
                </div>
            ) : null}
            <TabsContent value="styles" className="min-h-0 flex-1 overflow-y-auto custom-scrollbar data-[state=inactive]:hidden">
                <Section title="Overview">
                    <Fact label="Element" value={selected.tag} />
                    <Fact label="Layout" value={inspect?.layout.display || selected.styles.display} />
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
                        value={
                            inspect
                                ? `${inspect.responsive.breakpoint} · ${inspect.responsive.width}×${inspect.responsive.height}`
                                : "—"
                        }
                    />
                    <button
                        type="button"
                        className="mt-1 w-full truncate text-left text-xs text-accent-text hover:underline"
                        onClick={() => void openSelectedSource(selected)}
                    >
                        {sourceLine(selected) || selected.label}
                    </button>
                    <div className="mt-2 flex gap-1">
                        <Button type="button" variant="ghost" size="xs" className={cn(watching && "bg-panel-active")} onClick={() => onWatch(!watching)}>
                            {watching ? "Watching" : "Watch element"}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                                const selector = selected.selector || selected.tag;
                                const decls = Object.entries(selected.styles)
                                    .filter(([, v]) => v != null && String(v).trim() !== "")
                                    .map(([k, v]) => {
                                        const prop = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
                                        return `  ${prop}: ${v};`;
                                    })
                                    .join("\n");
                                void navigator.clipboard.writeText(`${selector} {\n${decls}\n}`);
                            }}
                        >
                            Copy CSS
                        </Button>
                    </div>
                </Section>
                <Section title="Styles">
                    {origins.length === 0 ? (
                        <p className="text-xs text-text-muted">No authored styles match this filter.</p>
                    ) : (
                        origins.map(([key, origin]) => (
                            <div key={key} className={cn("py-1 text-xs", origin.inactive && "opacity-50")}>
                                <div className="flex items-start gap-1">
                                    <span className="text-text-secondary">{origin.property}</span>
                                    <span className="min-w-0 break-all text-text-primary">{origin.authored}</span>
                                </div>
                                <div className="flex flex-wrap gap-x-2 text-[10px] text-text-muted">
                                    <span>{originKind(origin)}</span>
                                    <span>{origin.source.label}</span>
                                    {origin.overridden ? <span>overridden</span> : null}
                                    {origin.inactive ? <span>inactive</span> : null}
                                </div>
                            </div>
                        ))
                    )}
                </Section>
            </TabsContent>
            <TabsContent value="computed" className="min-h-0 flex-1 overflow-y-auto custom-scrollbar data-[state=inactive]:hidden">
                <Section title="Computed">
                    {origins.map(([key, origin]) => (
                        <Fact key={key} label={origin.property} value={origin.computed} />
                    ))}
                </Section>
            </TabsContent>
            <TabsContent value="layout" className="min-h-0 flex-1 overflow-y-auto custom-scrollbar data-[state=inactive]:hidden">
                {inspect ? (
                    <Section title="Box model">
                        <BoxDiagram box={inspect.box} />
                    </Section>
                ) : null}
                {inspect ? (
                    <Section title="Layout" defaultOpen={inspect.layout.isFlex || inspect.layout.isGrid}>
                        <Fact label="Display" value={inspect.layout.display} />
                        <Fact label="Position" value={inspect.layout.position} />
                        {inspect.layout.isFlex ? (
                            <>
                                <Fact label="Direction" value={inspect.layout.flexDirection} />
                                <Fact label="Wrap" value={inspect.layout.flexWrap} />
                                <Fact label="Justify" value={inspect.layout.justifyContent} />
                                <Fact label="Align" value={inspect.layout.alignItems} />
                                <Fact label="Gap" value={inspect.layout.gap} />
                            </>
                        ) : null}
                        {inspect.layout.isGrid ? (
                            <>
                                <Fact label="Columns" value={inspect.layout.gridTemplateColumns} />
                                <Fact label="Rows" value={inspect.layout.gridTemplateRows} />
                                <Fact label="Gap" value={inspect.layout.gap} />
                            </>
                        ) : null}
                    </Section>
                ) : null}
            </TabsContent>
            <TabsContent value="a11y" className="min-h-0 flex-1 overflow-y-auto custom-scrollbar data-[state=inactive]:hidden">
                <Section title="States">
                    <Fact
                        label="Forced"
                        value={
                            Object.entries(pseudo)
                                .filter(([, on]) => on)
                                .map(([n]) => `:${n}`)
                                .join(" ") || "none"
                        }
                    />
                    <Fact label="Breakpoint" value={inspect?.responsive.breakpoint || "—"} />
                    <Fact label="Focused page" value={emulateFocus ? "emulated" : "off"} />
                </Section>
                {inspect ? (
                    <Section title="Accessibility">
                        <Fact label="Name" value={inspect.accessibility.name} />
                        <Fact label="Role" value={inspect.accessibility.role} />
                        <Fact label="Focusable" value={inspect.accessibility.focusable ? "yes" : "no"} />
                        {inspect.accessibility.alt != null ? <Fact label="Alt" value={inspect.accessibility.alt || "(empty)"} /> : null}
                        <Fact
                            label="Contrast"
                            value={inspect.accessibility.contrast != null ? `${inspect.accessibility.contrast.toFixed(2)}:1` : "—"}
                        />
                    </Section>
                ) : null}
            </TabsContent>
            <TabsContent value="issues" className="min-h-0 flex-1 overflow-y-auto custom-scrollbar data-[state=inactive]:hidden">
                <Section title="Problems" defaultOpen={issues.length > 0}>
                    {issues.length === 0 ? (
                        <p className="text-xs text-text-muted">No issues detected.</p>
                    ) : (
                        issues.map((issue) => (
                            <div key={issue.id} className="py-1 text-xs">
                                <div className={cn(issue.severity === "warn" ? "text-text-primary" : "text-text-secondary")}>{issue.title}</div>
                                {issue.detail ? <div className="text-[10px] text-text-muted">{issue.detail}</div> : null}
                            </div>
                        ))
                    )}
                </Section>
            </TabsContent>
        </Tabs>
    );
}

"use client";

import React from "react";
import { RiAddLine, RiArrowDownSLine, RiDeleteBinLine, RiPencilLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { PluginLogo } from "@/components/ui/plugin-logo";
import { fetchPlugins, fetchPluginTools, peekPluginsCache, type PluginRow, type PluginToolHint } from "@/lib/plugins/api";
import { newWorkflowId, workflowPluginTools, type AgentWorkflow } from "@/lib/chat/workflows";
import { updateSettingSection } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { SettingSection } from "../shared/controls";

export function WorkflowsEditor({ value }: { value: AgentWorkflow[] }) {
    const [open, setOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<AgentWorkflow | null>(null);

    const save = (next: AgentWorkflow[]) => {
        updateSettingSection("ai", { workflows: next });
    };

    return (
        <SettingSection
            id="settings-ai-workflows"
            title="Workflows"
            description="Type / in chat (same picker as @) to run a slash command, or use a trigger phrase. Each workflow loads a prompt and can pre-approve plugin tools."
            action={
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                        setEditing({
                            id: newWorkflowId(),
                            name: "",
                            trigger: "",
                            prompt: "",
                        });
                        setOpen(true);
                    }}
                >
                    <Icon icon={RiAddLine} />
                    New
                </Button>
            }
        >
            {value.length === 0 ? (
                <p className="px-4 py-3 text-sm text-text-muted">No workflows yet.</p>
            ) : (
                value.map((w) => (
                    <div key={w.id} className="flex items-center gap-3 border-t border-border-subtle px-4 py-3 first:border-t-0">
                        <WorkflowPluginMark toolkit={w.pluginToolkit} />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-text-primary">{w.name || "Untitled"}</div>
                            <div className="truncate text-sm text-text-muted">
                                “{w.trigger}”
                                {w.pluginToolkit
                                    ? ` · ${w.pluginToolkit}${
                                          workflowPluginTools(w).length
                                              ? ` · ${workflowPluginTools(w).length} tools`
                                              : ""
                                      }`
                                    : ""}
                            </div>
                        </div>
                        <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Edit workflow"
                            onClick={() => {
                                setEditing({ ...w });
                                setOpen(true);
                            }}
                        >
                            <Icon icon={RiPencilLine} />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete workflow"
                            onClick={() => save(value.filter((x) => x.id !== w.id))}
                        >
                            <Icon icon={RiDeleteBinLine} />
                        </Button>
                    </div>
                ))
            )}

            <WorkflowDialog
                open={open}
                workflow={editing}
                existing={value}
                onClose={() => {
                    setOpen(false);
                    setEditing(null);
                }}
                onSave={(wf) => {
                    const next = value.some((x) => x.id === wf.id)
                        ? value.map((x) => (x.id === wf.id ? wf : x))
                        : [...value, wf];
                    save(next);
                    setOpen(false);
                    setEditing(null);
                }}
            />
        </SettingSection>
    );
}

function WorkflowPluginMark({ toolkit }: { toolkit?: string }) {
    const plugins = peekPluginsCache()?.plugins ?? [];
    const plugin = toolkit ? plugins.find((p) => p.toolkit === toolkit && p.connected) : undefined;
    if (!plugin) return null;
    return (
        <PluginLogo
            toolkit={plugin.toolkit}
            name={plugin.name}
            logo={plugin.logo}
            size={22}
            className="rounded-md"
        />
    );
}

function WorkflowDialog({
    open,
    workflow,
    existing,
    onClose,
    onSave,
}: {
    open: boolean;
    workflow: AgentWorkflow | null;
    existing: AgentWorkflow[];
    onClose: () => void;
    onSave: (wf: AgentWorkflow) => void;
}) {
    const [draft, setDraft] = React.useState<AgentWorkflow | null>(workflow);
    const [plugins, setPlugins] = React.useState<PluginRow[]>(() => peekPluginsCache()?.plugins ?? []);
    const [tools, setTools] = React.useState<PluginToolHint[]>([]);
    const [pluginsReady, setPluginsReady] = React.useState(() => Boolean(peekPluginsCache()));

    React.useEffect(() => {
        setDraft(workflow);
    }, [workflow]);

    React.useEffect(() => {
        if (!open) return;
        void fetchPlugins()
            .then((d) => {
                setPlugins(d.plugins);
                setPluginsReady(true);
            })
            .catch(() => setPluginsReady(true));
    }, [open]);

    const connected = React.useMemo(
        () => plugins.filter((p) => p.connected),
        [plugins],
    );

    React.useEffect(() => {
        if (!pluginsReady || !draft?.pluginToolkit) return;
        if (connected.some((p) => p.toolkit === draft.pluginToolkit)) return;
        setDraft((prev) =>
            prev ? { ...prev, pluginToolkit: undefined, pluginTool: undefined, pluginTools: undefined } : prev,
        );
    }, [pluginsReady, connected, draft?.pluginToolkit]);

    React.useEffect(() => {
        const toolkit = draft?.pluginToolkit;
        if (!toolkit) {
            setTools([]);
            return;
        }
        void fetchPluginTools(toolkit).then(setTools).catch(() => setTools([]));
    }, [draft?.pluginToolkit]);

    const uniqueTools = React.useMemo(() => {
        const seen = new Set<string>();
        return tools.filter((t) => {
            const key = (t.slug || t.name).trim().toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [tools]);

    if (!draft) return null;

    const canSave = draft.name.trim() && draft.trigger.trim() && draft.prompt.trim();
    const selected = connected.find((p) => p.toolkit === draft.pluginToolkit);
    const selectedSlugs = workflowPluginTools(draft);
    const selectedToolNames = uniqueTools
        .filter((t) => selectedSlugs.includes(t.slug))
        .map((t) => t.name || t.slug);

    return (
        <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
            <AlertDialogContent className="max-w-[480px]">
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {existing.some((x) => x.id === draft.id) ? "Edit workflow" : "New workflow"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        Type / in the composer to pick this workflow, or mention its trigger phrase in a message.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex flex-col gap-3 px-1 pb-2">
                    <Field label="Name">
                        <Input
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            placeholder="Resend pricing"
                            className="bg-panel-hover"
                        />
                    </Field>
                    <Field label="Trigger">
                        <Input
                            value={draft.trigger}
                            onChange={(e) => setDraft({ ...draft, trigger: e.target.value })}
                            placeholder="/test or “send proposal”"
                            className="bg-panel-hover"
                        />
                    </Field>
                    <Field label="Prompt">
                        <Textarea
                            value={draft.prompt}
                            onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                            placeholder="Load this context and follow these steps…"
                            className="min-h-28 bg-panel-hover"
                        />
                    </Field>
                    <Field label="Plugin*">
                        <PluginPicker
                            plugins={connected}
                            selected={selected}
                            onChange={(toolkit) =>
                                setDraft({
                                    ...draft,
                                    pluginToolkit: toolkit,
                                    pluginTool: undefined,
                                    pluginTools: undefined,
                                })
                            }
                        />
                    </Field>
                    {draft.pluginToolkit ? (
                        <Field label="Tools">
                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="secondary"
                                        size="md"
                                        className="w-full justify-between gap-2 bg-panel-hover!"
                                    >
                                        <span className="truncate">
                                            {selectedToolNames.length
                                                ? selectedToolNames.join(", ")
                                                : "Select tools to auto-run"}
                                        </span>
                                        <Icon icon={RiArrowDownSLine} className="shrink-0 text-text-muted" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    portalled={false}
                                    align="start"
                                    className="w-[var(--radix-dropdown-menu-trigger-width)]"
                                >
                                    {uniqueTools.length === 0 ? (
                                        <div className="px-2 py-1.5 text-sm text-text-muted">
                                            No tools found
                                        </div>
                                    ) : (
                                        uniqueTools.map((t, i) => (
                                            <DropdownMenuCheckboxItem
                                                key={`${t.slug}-${i}`}
                                                checked={selectedSlugs.includes(t.slug)}
                                                onCheckedChange={(checked) => {
                                                    const next = checked
                                                        ? [...selectedSlugs, t.slug]
                                                        : selectedSlugs.filter((s) => s !== t.slug);
                                                    setDraft({
                                                        ...draft,
                                                        pluginTools: next,
                                                        pluginTool: next[0],
                                                    });
                                                }}
                                            >
                                                {t.name || t.slug}
                                            </DropdownMenuCheckboxItem>
                                        ))
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </Field>
                    ) : null}
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onClose} className="w-full bg-panel-hover h-9 squircle-2xl">Cancel</AlertDialogCancel>
                    <Button
                        size="md"
                        variant="default"
                        className="w-full"
                        disabled={!canSave}
                        onClick={() => canSave && onSave(draft)}
                    >
                        Save
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function PluginPicker({
    plugins,
    selected,
    onChange,
}: {
    plugins: PluginRow[];
    selected?: PluginRow;
    onChange: (toolkit: string | undefined) => void;
}) {
    return (
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        size="md"
                        className="w-full justify-between gap-2 bg-panel-hover!"
                    >
                        <span className="flex min-w-0 items-center gap-2">
                            {selected ? (
                                <PluginLogo
                                    toolkit={selected.toolkit}
                                    name={selected.name}
                                    logo={selected.logo}
                                    size={18}
                                    className="rounded-sm"
                                />
                            ) : null}
                            <span className="truncate">{selected?.name ?? "None"}</span>
                        </span>
                        <Icon icon={RiArrowDownSLine} className="shrink-0 text-text-muted" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    portalled={false}
                    align="start"
                    className="w-[var(--radix-dropdown-menu-trigger-width)]"
                >
                <DropdownMenuItem onSelect={() => onChange(undefined)}>None</DropdownMenuItem>
                {plugins.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-text-muted">
                        No connected plugins
                    </div>
                ) : (
                    plugins.map((p) => (
                        <DropdownMenuItem
                            key={p.toolkit}
                            onSelect={() => onChange(p.toolkit)}
                            className={cn(selected?.toolkit === p.toolkit && "bg-panel-hover")}
                        >
                            <PluginLogo
                                toolkit={p.toolkit}
                                name={p.name}
                                logo={p.logo}
                                size={18}
                                className="rounded-sm"
                            />
                            <span className="min-w-0 truncate">{p.name}</span>
                        </DropdownMenuItem>
                    ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-text-secondary">{label}</span>
            {children}
        </label>
    );
}

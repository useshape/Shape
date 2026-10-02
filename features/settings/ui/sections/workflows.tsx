"use client";

import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { Delete20Regular } from "@fluentui/react-icons/headless/svg/delete";
import { Edit20Regular } from "@fluentui/react-icons/headless/svg/edit";
import { Flowchart20Regular } from "@fluentui/react-icons/headless/svg/flowchart";
import React from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

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
import { newWorkflowId, workflowPluginTools, workflowSeeHow, type AgentWorkflow } from "@/lib/chat/workflows";
import { updateSettingSection } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { SettingActionRow, SettingCard, SettingSection, SETTING_CONTROL_BTN } from "../shared/controls";

export function WorkflowsEditor({ value }: { value: AgentWorkflow[] }) {
    const [open, setOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<AgentWorkflow | null>(null);

    const save = (next: AgentWorkflow[]) => {
        updateSettingSection("ai", { workflows: next });
    };

    return (
        <SettingSection id="settings-ai-workflows" title="Workflows">
            <SettingCard>
            {value.map((w) => (
                    <div key={w.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                        <WorkflowPluginMark toolkit={w.pluginToolkit} />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-text-primary">{w.name || "Untitled"}</div>
                            <div className="truncate text-xs text-text-muted">
                                {w.trigger}
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
                            className="size-7"
                            aria-label="Edit workflow"
                            onClick={() => {
                                setEditing({ ...w });
                                setOpen(true);
                            }}
                        >
                            <Icon icon={Edit20Regular} />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            aria-label="Delete workflow"
                            onClick={() => save(value.filter((x) => x.id !== w.id))}
                        >
                            <Icon icon={Delete20Regular} />
                        </Button>
                    </div>
                ))}
            <SettingActionRow
                title="Add workflow"
                icon={Add20Regular}
                onClick={() => {
                    setEditing({
                        id: newWorkflowId(),
                        name: "",
                        trigger: "",
                        prompt: "",
                        when: "both",
                    });
                    setOpen(true);
                }}
            />
            </SettingCard>

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
    if (!plugin) return <Icon icon={Flowchart20Regular} className="shrink-0 text-text-muted" />;
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
            <AlertDialogContent className="max-w-[520px]">
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {existing.some((x) => x.id === draft.id) ? "Edit workflow" : "New workflow"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        Tell Shape what to do when this routine runs. Use / to mention it in chat.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex max-h-[min(70vh,560px)] flex-col gap-3 overflow-y-auto px-1 pb-2">
                    <Field label="Name">
                        <Input
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            placeholder="e.g. Summarize my emails"
                            className="bg-panel-hover"
                        />
                    </Field>
                    <Field label="When">
                        <div className="flex flex-wrap gap-1.5">
                            {(
                                [
                                    ["both", "Slash or phrase"],
                                    ["slash", "Slash only"],
                                    ["phrase", "Phrase in the message"],
                                ] as const
                            ).map(([id, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setDraft({ ...draft, when: id })}
                                    className={cn(
                                        "rounded-full px-2.5 py-1 text-xs",
                                        (draft.when ?? "both") === id
                                            ? "bg-panel-hover text-text-primary"
                                            : "text-text-muted hover:bg-panel-hover/60",
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
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
                            placeholder="Tell Shape what to do when this routine runs."
                            className="min-h-28 bg-panel-hover"
                        />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center justify-between rounded-xl bg-panel-hover px-3 py-2 text-sm">
                            <span>Web search</span>
                            <input
                                type="checkbox"
                                className="accent-accent"
                                checked={Boolean(draft.webSearch)}
                                onChange={(e) => setDraft({ ...draft, webSearch: e.target.checked })}
                            />
                        </label>
                        <label className="flex items-center justify-between rounded-xl bg-panel-hover px-3 py-2 text-sm">
                            <span>Open pages</span>
                            <input
                                type="checkbox"
                                className="accent-accent"
                                checked={Boolean(draft.browse)}
                                onChange={(e) => setDraft({ ...draft, browse: e.target.checked })}
                            />
                        </label>
                    </div>
                    <Field label="Mode">
                        <div className="flex flex-wrap gap-1.5">
                            {([undefined, "Ask", "Code", "Plan", "Visual"] as const).map((id) => (
                                <button
                                    key={id ?? "any"}
                                    type="button"
                                    onClick={() => setDraft({ ...draft, mode: id })}
                                    className={cn(
                                        "rounded-full px-2.5 py-1 text-xs",
                                        draft.mode === id
                                            ? "bg-panel-hover text-text-primary"
                                            : "text-text-muted hover:bg-panel-hover/60",
                                    )}
                                >
                                    {id ?? "Any"}
                                </button>
                            ))}
                        </div>
                    </Field>
                    <Field label="Plugin">
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
                                        <Icon icon={ChevronDown20Regular} className="shrink-0 text-text-muted" />
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
                    <div className="rounded-xl bg-panel-hover px-3 py-2.5">
                        <div className="text-xs font-medium text-text-secondary">See how</div>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-4 text-text-muted">
                            {workflowSeeHow(draft) || "Add a name, trigger, and prompt to preview this routine."}
                        </p>
                    </div>
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
                        variant="ghost"
                        size="sm"
                        className={cn(SETTING_CONTROL_BTN, "w-full")}
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
                        <Icon icon={ChevronDown20Regular} className="shrink-0 text-text-muted" />
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

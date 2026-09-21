"use client";

import React from "react";
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { commands } from "@/lib/backend";
import type { IndexProgress, IndexStatus } from "@/lib/backend/types";
import {
    getCatalogDefaultEnabledIds,
    getCatalogModels,
    isCatalogModelAllowed,
    useShapeCatalog,
} from "@/lib/catalog/store";
import { RiWebhookFill } from "@remixicon/react";
import { Icon } from "@/components/ui/icon";
import { getVisibleModels, isApiModel, isModelEnabled, resolveChatModels, type ModelInfo } from "@/lib/settings/models";
import { useShapeAuth } from "@/lib/cloud/store";
import {
    type AutoRunModeSetting,
    type ShapeSettings,
    updateSettingSection,
} from "@/lib/settings";
import { getShapeAccessToken } from "@/lib/cloud/store";
import { Textarea } from "@/components/ui/textarea";
import {
    SettingSection,
    SettingRow,
    SettingSelect,
    SettingSwitch,
    SettingNumberSelect,
    MAX_CONTEXT_PRESETS,
} from "../shared/controls";
import { WorkflowsEditor } from "./workflows";

const FEATURED_COUNT = 4;

function RulesEditor({ value }: { value: string }) {
    const [draft, setDraft] = React.useState(value);
    React.useEffect(() => setDraft(value), [value]);
    const dirty = draft !== value;

    return (
        <SettingSection
            id="settings-ai-rules"
            title="Instructions"
            action={
                <Button
                    size="sm"
                    variant="secondary"
                    disabled={!dirty}
                    onClick={() => updateSettingSection("ai", { customRules: draft })}
                >
                    Save
                </Button>
            }
            card={false}
        >
            <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add your custom instructions…"
                className="min-h-40 rounded-xl border-border-subtle bg-surface-2 px-4 py-3.5 text-md"
            />
        </SettingSection>
    );
}

function ModelRow({
    model,
    enabled,
    onToggle,
    unavailableReason,
}: {
    model: ModelInfo;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    unavailableReason?: string;
}) {
    return (
        <div className="flex items-start justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                    <span className="min-w-0 truncate">{model.name}</span>
                    {isApiModel(model) ? (
                        <Icon icon={RiWebhookFill} className="shrink-0 text-text-muted" />
                    ) : null}
                </div>
                <div className="text-sm text-text-muted">
                    {unavailableReason ?? model.description}
                </div>
            </div>
            <SettingSwitch checked={enabled} onChange={onToggle} disabled={!!unavailableReason} />
        </div>
    );
}

function IndexProgressBar({
    percent,
    indexing,
    phase,
}: {
    percent: number;
    indexing: boolean;
    phase?: string;
}) {
    const label = indexing
        ? phase === "scanning"
            ? "Scanning files…"
            : phase === "persisting"
              ? "Saving index…"
              : `Indexing… ${percent}%`
        : `${percent}%`;

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
                <span className="text-text-primary">{label}</span>
            </div>
            <div className="h-1 w-full rounded-full bg-surface-2 overflow-hidden">
                <div
                    className={cn(
                        "h-full rounded-full bg-success transition-all duration-300",
                        indexing && phase === "scanning" && "animate-pulse w-1/3 opacity-70",
                    )}
                    style={
                        indexing && phase === "scanning"
                            ? undefined
                            : { width: `${indexing ? Math.max(percent, 4) : percent}%` }
                    }
                />
            </div>
        </div>
    );
}

function applyIndexStatus(
    setIndexStatus: React.Dispatch<
        React.SetStateAction<{
            filesIndexed: number;
            totalFiles: number;
            chunks: number;
            vectors?: number;
            lastIndexedAt?: number | null;
        } | null>
    >,
    s: IndexStatus,
) {
    setIndexStatus({
        filesIndexed: s.filesIndexed,
        totalFiles: s.totalFiles,
        chunks: s.chunks,
        vectors: s.vectors,
        lastIndexedAt: s.lastIndexedAt ?? null,
    });
}

export function AiSettingsPanel({
    settings,
}: {
    settings: ShapeSettings;
}) {
    const a = settings.ai;
    const auth = useShapeAuth();
    useShapeCatalog();
    const allModels = resolveChatModels(getCatalogModels(), {
        openaiKey: false,
        openRouterKey: false,
        signedIn: Boolean(auth.loggedIn && !auth.offline),
    });
    const unavailableHint =
        "This model is not available on your plan.";
    const [showAllModels, setShowAllModels] = React.useState(false);
    const [indexStatus, setIndexStatus] = React.useState<{
        filesIndexed: number;
        totalFiles: number;
        chunks: number;
        vectors?: number;
        lastIndexedAt?: number | null;
    } | null>(null);
    const [indexing, setIndexing] = React.useState(false);
    const [indexPhase, setIndexPhase] = React.useState<string | undefined>();

    const enabledModels = a.enabledModels;
    const visibleModels = getVisibleModels(allModels, enabledModels);
    const defaultIds = getCatalogDefaultEnabledIds();
    const featuredIds = new Set(defaultIds.slice(0, FEATURED_COUNT));
    const displayedModels = showAllModels
        ? allModels
        : allModels.filter((m) => featuredIds.has(m.id) || m.id === "auto");

    React.useEffect(() => {
        void commands.getIndexStatus().then((s) => {
            applyIndexStatus(setIndexStatus, s);
            if (s.indexing) {
                setIndexing(true);
            }
        }).catch(() => {});
    }, []);

    React.useEffect(() => {
        const unlisteners: Array<() => void> = [];

        void listen<IndexProgress>("codebase-index-progress", (event) => {
            const p = event.payload;
            setIndexing(true);
            setIndexPhase(p.phase);
            setIndexStatus((prev) => ({
                filesIndexed: p.filesIndexed,
                totalFiles: p.totalFiles,
                chunks: p.chunks,
                lastIndexedAt: prev?.lastIndexedAt ?? null,
            }));
        }).then((unlisten) => unlisteners.push(unlisten));

        void listen<IndexStatus>("codebase-index-complete", (event) => {
            applyIndexStatus(setIndexStatus, event.payload);
            setIndexing(false);
            setIndexPhase(undefined);
        }).then((unlisten) => unlisteners.push(unlisten));

        void listen<string>("codebase-index-error", (event) => {
            setIndexing(false);
            setIndexPhase(undefined);
            void import("@/lib/errors/catalog").then(({ notifyCatalogError, SHAPE_ERRORS }) => {
                notifyCatalogError(SHAPE_ERRORS.INDEX_SEARCH, event.payload);
            });
        }).then((unlisten) => unlisteners.push(unlisten));

        return () => {
            for (const unlisten of unlisteners) {
                unlisten();
            }
        };
    }, []);

    const setEnabledModels = (next: string[]) => {
        updateSettingSection("ai", { enabledModels: next });
    };

    const toggleModel = (modelId: string, enabled: boolean) => {
        const current = enabledModels.length === 0 ? allModels.map((m) => m.id) : [...enabledModels];
        let next: string[];
        if (enabled) {
            next = current.includes(modelId) ? current : [...current, modelId];
        } else {
            next = current.filter((id) => id !== modelId);
        }
        setEnabledModels(next);
    };

    const handleReindex = async () => {
        if (indexing) return;
        setIndexing(true);
        setIndexPhase("scanning");
        try {
            const token = await getShapeAccessToken();
            const started = await commands.indexProject(undefined, token ?? undefined);
            if (!started) {
                setIndexing(false);
                setIndexPhase(undefined);
            }
        } catch {
            setIndexing(false);
            setIndexPhase(undefined);
        }
    };

    const indexPercent =
        indexStatus && indexStatus.totalFiles > 0
            ? Math.round((indexStatus.filesIndexed / indexStatus.totalFiles) * 100)
            : indexStatus?.filesIndexed
              ? 100
              : 0;

    return (
        <>
            <SettingSection id="settings-ai-models" title="Models">
                {displayedModels.map((model) => (
                    <ModelRow
                        key={model.id}
                        model={model}
                        enabled={isModelEnabled(model.id, enabledModels)}
                        onToggle={(on) => toggleModel(model.id, on)}
                        unavailableReason={
                            !isCatalogModelAllowed(model.id) && !isApiModel(model)
                                ? unavailableHint
                                : undefined
                        }
                    />
                ))}
                <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    className="w-full bg-panel-hover! rounded-none py-6"
                    onClick={() => setShowAllModels((v) => !v)}
                >
                    {showAllModels ? "Show fewer models" : "View all models"}
                </Button>
            </SettingSection>

            <SettingSection title="Behavior">
                <SettingRow title="Default Model">
                    <SettingSelect
                        value={a.defaultModel}
                        options={visibleModels.map((m) => ({ value: m.id, label: m.name }))}
                        onChange={(v) => updateSettingSection("ai", { defaultModel: v })}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="Auto-Run">
                <SettingRow title="Auto-run mode">
                    <SettingSelect
                        value={a.autoRunMode}
                        options={[
                            { value: "ask", label: "Ask every time" },
                            { value: "auto", label: "Auto (safe commands)" },
                            { value: "always", label: "Run everything" },
                        ] satisfies Array<{ value: AutoRunModeSetting; label: string }>}
                        onChange={(v) => {
                            updateSettingSection("ai", { autoRunMode: v as AutoRunModeSetting });
                            void commands.updateTurnPolicy({ autoRunMode: v });
                        }}
                    />
                </SettingRow>
                <SettingRow title="Protect destructive git">
                    <SettingSwitch
                        checked={a.protectDestructiveGit}
                        onChange={(on) => {
                            updateSettingSection("ai", { protectDestructiveGit: on });
                            void commands.updateTurnPolicy({ protectDestructiveGit: on });
                        }}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="Edits">
                <SettingRow title="Require edit approval">
                    <SettingSwitch
                        checked={a.requireEditApproval}
                        onChange={(on) => {
                            updateSettingSection("ai", { requireEditApproval: on });
                            void commands.updateTurnPolicy({ requireEditApproval: on });
                        }}
                    />
                </SettingRow>
                <SettingRow title="Auto-apply agent edits">
                    <SettingSwitch
                        checked={a.autoApplyEdits}
                        onChange={(on) => updateSettingSection("ai", { autoApplyEdits: on })}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="Composer">
                <SettingRow title="Compact input">
                    <SettingSwitch
                        checked={a.compactComposer}
                        onChange={(on) => updateSettingSection("ai", { compactComposer: on })}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection id="settings-ai-context" title="Context">
                <SettingRow title="Max context lines per file">
                    <SettingNumberSelect
                        value={a.maxContextLines}
                        options={MAX_CONTEXT_PRESETS}
                        onChange={(v) => updateSettingSection("ai", { maxContextLines: v })}
                    />
                </SettingRow>
                <SettingRow title="Semantic embeddings">
                    <SettingSwitch
                        checked={a.indexEmbeddings}
                        onChange={(on) => {
                            updateSettingSection("ai", { indexEmbeddings: on });
                            void commands.setIndexEmbeddings(on).catch(() => { /* ignore */ });
                        }}
                    />
                </SettingRow>
                <SettingRow
                    title="Project memory"
                >
                    <SettingSwitch
                        checked={a.chatMemoryEnabled}
                        onChange={(on) => {
                            updateSettingSection("ai", { chatMemoryEnabled: on });
                            void commands.setChatMemoryEnabled(on).catch(() => { /* ignore */ });
                        }}
                    />
                </SettingRow>
                <div className="p-3 space-y-2">
                    <IndexProgressBar percent={indexPercent} indexing={indexing} phase={indexPhase} />
                    <div className="text-sm text-text-muted">
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" className="w-full bg-panel-hover!" size="md" disabled={indexing} onClick={() => void handleReindex()}>
                            {indexing ? "Indexing…" : "Re-index"}
                        </Button>
                    </div>
                </div>
            </SettingSection>

            <RulesEditor value={a.customRules} />
            <SettingSection id="settings-ai-review" title="Review">
                <SettingRow
                    title="Adversarial review"
                    description="After huge multi-file writes, run a second-pass critique as a tool row. Skips small UI nits."
                >
                    <SettingSwitch
                        checked={a.reviewAdversarialEnabled}
                        onChange={(reviewAdversarialEnabled) =>
                            updateSettingSection("ai", { reviewAdversarialEnabled })
                        }
                    />
                </SettingRow>
            </SettingSection>
            <WorkflowsEditor value={a.workflows ?? []} />
        </>
    );
}

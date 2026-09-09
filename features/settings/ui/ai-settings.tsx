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
} from "@/lib/catalog-store";
import { isModelEnabled, type ModelInfo } from "@/lib/models";
import {
    type AutoRunModeSetting,
    type ShapeSettings,
    updateSettingSection,
} from "@/lib/settings";
import { getShapeAccessToken } from "@/lib/shape-auth/store";
import { openMcpConfig } from "@/lib/mcp-config";
import { PluginsSettings } from "./plugins-settings";
import { Textarea } from "@/components/ui/textarea";
import {
    SettingSection,
    SettingRow,
    SettingSelect,
    SettingSwitch,
    SettingNumberSelect,
    MAX_CONTEXT_PRESETS,
} from "./setting-controls";

const FEATURED_COUNT = 4;

function RulesEditor({ value }: { value: string }) {
    const [draft, setDraft] = React.useState(value);
    React.useEffect(() => setDraft(value), [value]);
    const dirty = draft !== value;

    return (
        <div className="px-4 py-3.5">
            <div className="mb-2 flex items-center justify-end">
                <Button
                    size="sm"
                    disabled={!dirty}
                    onClick={() => updateSettingSection("ai", { customRules: draft })}
                >
                    Save
                </Button>
            </div>
            <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add your custom instructions…"
                className="min-h-32 border-border-subtle bg-input-bg"
            />
        </div>
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
                <div className="text-sm font-medium text-text-primary">{model.name}</div>
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
    useShapeCatalog();
    const allModels = getCatalogModels();
    const unavailableHint =
        "This model is not available on your plan. Manage models on useshape.org.";
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
    const visibleModels = allModels.filter((m) => isModelEnabled(m.id, enabledModels));
    const defaultIds = getCatalogDefaultEnabledIds();
    const featuredIds = new Set(defaultIds.slice(0, FEATURED_COUNT));
    const displayedModels = showAllModels
        ? allModels
        : allModels.filter((m) => featuredIds.has(m.id));

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
                            !isCatalogModelAllowed(model.id) ? unavailableHint : undefined
                        }
                    />
                ))}
                <button
                    type="button"
                    className="px-3.5 py-2.5 text-left text-sm text-text-muted hover:text-text-primary transition-colors"
                    onClick={() => setShowAllModels((v) => !v)}
                >
                    {showAllModels ? "Show fewer models" : "View all models"}
                </button>
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
                        onChange={(v) =>
                            updateSettingSection("ai", { autoRunMode: v as AutoRunModeSetting })
                        }
                    />
                </SettingRow>
                <SettingRow title="Protect destructive git">
                    <SettingSwitch
                        checked={a.protectDestructiveGit}
                        onChange={(on) => updateSettingSection("ai", { protectDestructiveGit: on })}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="Edits">
                <SettingRow title="Require edit approval">
                    <SettingSwitch
                        checked={a.requireEditApproval}
                        onChange={(on) => updateSettingSection("ai", { requireEditApproval: on })}
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

            <SettingSection title="Review">
                <SettingRow title="Adversarial review">
                    <SettingSwitch
                        checked={a.reviewAdversarialEnabled}
                        onChange={(on) => updateSettingSection("ai", { reviewAdversarialEnabled: on })}
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
                <SettingRow title="Semantic codebase index">
                    <span className="text-xs text-text-muted">Always on</span>
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
                <div className="px-3.5 py-3 space-y-3">
                    <IndexProgressBar percent={indexPercent} indexing={indexing} phase={indexPhase} />
                    <div className="text-sm text-text-muted">
                        {indexStatus
                            ? `${indexStatus.filesIndexed} files · ${indexStatus.chunks} chunks${
                                  indexStatus.vectors != null ? ` · ${indexStatus.vectors} vectors` : ""
                              }${
                                  indexStatus.lastIndexedAt
                                      ? ` · Last indexed ${new Date(indexStatus.lastIndexedAt * 1000).toLocaleString()}`
                                      : ""
                              }`
                            : "Not indexed"}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" disabled={indexing} onClick={() => void handleReindex()}>
                            {indexing ? "Indexing…" : "Re-index"}
                        </Button>
                    </div>
                </div>
            </SettingSection>

            <SettingSection
                id="settings-ai-rules"
                title="Instructions"
                description="Give Shape extra instructions and context for all chats. Repository instructions may also apply."
            >
                <RulesEditor value={a.customRules} />
            </SettingSection>

            <PluginsSettings />

            <SettingSection id="settings-ai-mcp" title="MCP">
                <SettingRow title="Servers">
                    <Button variant="secondary" size="sm" onClick={() => void openMcpConfig()}>
                        Edit mcp.json
                    </Button>
                </SettingRow>
            </SettingSection>
        </>
    );
}

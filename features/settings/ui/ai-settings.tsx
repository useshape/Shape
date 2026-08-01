"use client";

import React from "react";
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { commands } from "@/lib/backend";
import type { IndexProgress, IndexStatus, McpStatusEntry } from "@/lib/backend/types";
import {
    getCatalogDefaultEnabledIds,
    getCatalogModels,
    isCatalogModelAllowed,
    useShapeCatalog,
} from "@/lib/catalog-store";
import { isModelEnabled, type ModelInfo } from "@/lib/models";
import {
    type ShapeSettings,
    updateSettingSection,
} from "@/lib/settings";
import { getShapeAccessToken } from "@/lib/shape-auth/store";
import { loadMcpServersFromFile, openMcpConfig } from "@/lib/mcp-config";
import {
    SettingSection,
    SettingRow,
    SettingSelect,
    SettingSwitch,
    SettingNumberSelect,
    MAX_CONTEXT_PRESETS,
} from "./setting-controls";

const FEATURED_COUNT = 4;

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
        <div className="flex items-start justify-between gap-4 px-3.5 py-3">
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

export function AiSettingsPanel({ settings }: { settings: ShapeSettings }) {
    const a = settings.ai;
    useShapeCatalog();
    const allModels = getCatalogModels();
    const unavailableHint =
        "This model is not available on your plan. Manage models on useshape.org.";
    const [showAllModels, setShowAllModels] = React.useState(false);
    const [mcpStatus, setMcpStatus] = React.useState<McpStatusEntry[]>([]);
    const [mcpConnecting, setMcpConnecting] = React.useState<string | null>(null);
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

    const syncMcpFromFile = React.useCallback(async () => {
        try {
            const servers = await loadMcpServersFromFile();
            const status = await commands.syncMcpServers(servers);
            setMcpStatus(status as McpStatusEntry[]);
        } catch {
            /* ignore */
        }
    }, []);

    React.useEffect(() => {
        void syncMcpFromFile();
    }, [syncMcpFromFile]);

    React.useEffect(() => {
        let unlistenOAuth: (() => void) | undefined;
        void import("@/lib/mcp-install").then(({ initMcpOAuthListener }) => {
            void initMcpOAuthListener(async () => {
                setMcpConnecting(null);
                await syncMcpFromFile();
            }).then((fn) => {
                unlistenOAuth = fn;
            });
        });
        return () => {
            unlistenOAuth?.();
        };
    }, [syncMcpFromFile]);

    const handleMcpConnect = async (serverId: string) => {
        setMcpConnecting(serverId);
        try {
            await commands.mcpStartOAuth(serverId);
        } catch {
            setMcpConnecting(null);
        }
    };

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
            <SettingSection
                id="settings-ai-models"
                title="Models"
                description="Choose which models are available to the agent"
            >
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

            <SettingSection title="Edits">
                <SettingRow
                    title="Auto-apply agent edits"
                    description="Automatically accept file edits from the agent without showing the review panel"
                >
                    <SettingSwitch
                        checked={a.autoApplyEdits}
                        onChange={(on) => updateSettingSection("ai", { autoApplyEdits: on })}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="Review">
                <SettingRow
                    title="Adversarial review"
                    description="After Review mode finishes, run critic models that challenge the findings before the turn completes"
                >
                    <SettingSwitch
                        checked={a.reviewAdversarialEnabled}
                        onChange={(on) => updateSettingSection("ai", { reviewAdversarialEnabled: on })}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection
                id="settings-ai-context"
                title="Context"
                description="How much of each file the agent can pull into context, and codebase search index status."
            >
                <SettingRow
                    title="Max context lines per file"
                    description="Cap on lines included when attaching a file to the agent"
                >
                    <SettingNumberSelect
                        value={a.maxContextLines}
                        options={MAX_CONTEXT_PRESETS}
                        onChange={(v) => updateSettingSection("ai", { maxContextLines: v })}
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
                            : "Not indexed yet"}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" disabled={indexing} onClick={() => void handleReindex()}>
                            {indexing ? "Indexing…" : "Re-index"}
                        </Button>
                    </div>
                </div>
            </SettingSection>

            <SettingSection
                id="settings-ai-memories"
                title="System Instructions"
                description="Additional instructions appended to the built-in agent system prompt"
            >
                <div className="px-3.5 py-3">
                    <textarea
                        value={a.customSystemPrompt}
                        onChange={(e) => updateSettingSection("ai", { customSystemPrompt: e.target.value })}
                        placeholder="Style, response language, tone…"
                        className="w-full min-h-[100px] rounded-lg bg-surface-2 border border-border-subtle px-3 py-2 text-sm text-text-primary resize-y focus:outline-none focus:border-accent select-text"
                    />
                </div>
            </SettingSection>

            <SettingSection
                id="settings-ai-rules"
                title="Rules"
                description="Persistent rules injected every turn. Project rules also load from .shape/rules.md and .shape/rules/*"
            >
                <div className="px-3.5 py-3">
                    <textarea
                        value={a.customRules}
                        onChange={(e) => updateSettingSection("ai", { customRules: e.target.value })}
                        placeholder="Project-specific rules and conventions…"
                        className="w-full min-h-[100px] rounded-lg bg-surface-2 border border-border-subtle px-3 py-2 text-sm text-text-primary resize-y focus:outline-none focus:border-accent select-text"
                    />
                </div>
            </SettingSection>

            <SettingSection
                id="settings-ai-mcp"
                title="MCP Servers"
                description="Status of servers configured in mcp.json."
            >
                <div className="px-3.5 py-3 space-y-3">
                    {mcpStatus.length > 0 ? (
                        <div className="space-y-2">
                            {mcpStatus.map((s) => (
                                <div key={s.id} className="flex items-center justify-between gap-3 text-sm py-1">
                                    <div className="min-w-0">
                                        <span className="text-text-primary">{s.name}</span>
                                        {s.status === "needs_auth" && s.auth === "oauth" ? (
                                            <p className="text-xs text-text-muted mt-0.5">
                                                Connects to {s.name} (not your Shape account)
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {s.status === "needs_auth" ? (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                disabled={mcpConnecting === s.id}
                                                onClick={() => void handleMcpConnect(s.id)}
                                            >
                                                {mcpConnecting === s.id ? "Connecting…" : "Connect"}
                                            </Button>
                                        ) : (
                                            <span
                                                className={cn(
                                                    "text-xs",
                                                    s.status === "connected" && "text-success",
                                                    s.status === "disabled" && "text-text-muted",
                                                    s.status === "error" && "text-error",
                                                )}
                                            >
                                                {s.status === "connected"
                                                    ? `${s.toolCount} tools`
                                                    : s.status === "disabled"
                                                      ? "Disabled"
                                                      : "Error"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-text-muted">No MCP servers configured yet.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" size="sm" onClick={() => void openMcpConfig()}>
                            Edit mcp.json
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void syncMcpFromFile()}>
                            Refresh
                        </Button>
                    </div>
                </div>
            </SettingSection>
        </>
    );
}

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
import { McpLogo } from "./mcp/catalog";
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

export function AiSettingsPanel({
    settings,
    onOpenMcpLibrary,
}: {
    settings: ShapeSettings;
    onOpenMcpLibrary?: () => void;
}) {
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
                    description="Run critic models after Review mode finishes"
                >
                    <SettingSwitch
                        checked={a.reviewAdversarialEnabled}
                        onChange={(on) => updateSettingSection("ai", { reviewAdversarialEnabled: on })}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection id="settings-ai-context" title="Context">
                <SettingRow
                    title="Max context lines per file"
                    description="Lines included when attaching a file"
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
                id="settings-ai-rules"
                title="Rules"
                description="Guide agent behavior. Also loads from .shape/rules.md"
            >
                <textarea
                    value={a.customRules}
                    onChange={(e) => updateSettingSection("ai", { customRules: e.target.value })}
                    placeholder="Style, tone, project conventions…"
                    className="w-full min-h-28 bg-transparent px-3.5 py-3 text-sm text-text-primary placeholder:text-text-disabled resize-y focus:outline-none select-text"
                />
            </SettingSection>

            <SettingSection id="settings-ai-mcp" title="Installed MCP Servers">
                {mcpStatus.length > 0 ? (
                    mcpStatus.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
                            <div className="relative shrink-0">
                                <McpLogo server={s} size={30} />
                                {s.status === "connected" ? (
                                    <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-panel" />
                                ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                                <span className="text-sm text-text-primary">{s.name}</span>
                                {s.status === "error" && s.error ? (
                                    <p className="text-xs text-error mt-0.5 truncate" title={s.error}>
                                        {s.error}
                                    </p>
                                ) : s.status === "connected" ? (
                                    <p className="text-xs text-text-muted mt-0.5">
                                        {s.toolCount} tools enabled
                                    </p>
                                ) : s.status === "needs_auth" ? (
                                    <p className="text-xs text-text-muted mt-0.5">Sign in required</p>
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
                                ) : s.status === "disabled" ? (
                                    <span className="text-xs text-text-muted">Disabled</span>
                                ) : s.status === "error" ? (
                                    <span className="text-xs text-error">Error</span>
                                ) : null}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center gap-3 px-3.5 py-8 text-center">
                        <div className="text-sm font-medium text-text-primary">No MCP Tools</div>
                        <p className="text-sm text-text-muted max-w-sm">
                            Add a server from the library, or configure{" "}
                            <span className="text-text-secondary">mcp.json</span>
                        </p>
                        <Button variant="outline" size="sm" onClick={() => onOpenMcpLibrary?.()}>
                            Browse Library
                        </Button>
                    </div>
                )}
                {mcpStatus.length > 0 ? (
                    <div className="flex flex-wrap gap-2 px-3.5 py-2.5">
                        <Button variant="secondary" size="sm" onClick={() => onOpenMcpLibrary?.()}>
                            Browse Library
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void openMcpConfig()}>
                            Edit mcp.json
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void syncMcpFromFile()}>
                            Refresh
                        </Button>
                    </div>
                ) : null}
            </SettingSection>
        </>
    );
}

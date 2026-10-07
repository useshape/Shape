"use client";

import { Link20Regular } from "@fluentui/react-icons/headless/svg/link";
import React from "react";
import { Icon } from "@/components/ui/icon";
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

import { getVisibleModels, isApiModel, isModelEnabled, isSubagentModelEnabled, resolveChatModels, resolveSubagentDefaultModel, sanitizeEnabledModels, sanitizeSubagentModels, type ModelInfo } from "@/lib/settings/models";
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
    SettingCard,
    SettingRow,
    SettingSelect,
    SettingSwitch,
    SettingNumberSelect,
    SETTING_CONTROL_BTN,
    MAX_CONTEXT_PRESETS,
} from "../shared/controls";
import { WorkflowsEditor } from "./workflows";

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
                    variant="ghost"
                    className={SETTING_CONTROL_BTN}
                    disabled={!dirty}
                    onClick={() => updateSettingSection("ai", { customRules: draft })}
                >
                    Save
                </Button>
            }
            card={false}
        >
            <SettingCard>
            <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add your custom instructions…"
                className="min-h-40 rounded-xl border-0 bg-transparent px-3.5 py-3 text-sm"
            />
            </SettingCard>
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
                        <Icon icon={Link20Regular} className="shrink-0 text-text-muted" />
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
    page,
}: {
    settings: ShapeSettings;
    page: "models" | "rules" | "workflows" | "context" | "subagents";
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
    const [showAllSubagentModels, setShowAllSubagentModels] = React.useState(false);
    const [indexStatus, setIndexStatus] = React.useState<{
        filesIndexed: number;
        totalFiles: number;
        chunks: number;
        vectors?: number;
        lastIndexedAt?: number | null;
    } | null>(null);
    const [indexing, setIndexing] = React.useState(false);
    const [indexPhase, setIndexPhase] = React.useState<string | undefined>();

    const defaultIds = getCatalogDefaultEnabledIds();
    const enabledModels = sanitizeEnabledModels(
        a.enabledModels,
        allModels.map((m) => m.id),
        defaultIds,
    );
    const visibleModels = getVisibleModels(allModels, enabledModels);
    const subagentModels = sanitizeSubagentModels(
        a.subagentModels,
        allModels.map((m) => m.id),
    );
    const subagentDefaultModel = resolveSubagentDefaultModel(a.subagentDefaultModel, subagentModels);
    const visibleSubagentModels = allModels.filter((m) => isSubagentModelEnabled(m.id, subagentModels));
    const featuredIds = React.useMemo(() => {
        const ids: string[] = [];
        const seen = new Set<string>();
        for (const m of allModels) {
            if (seen.has(m.provider)) continue;
            seen.add(m.provider);
            ids.push(m.id);
        }
        return new Set(ids);
    }, [allModels]);
    const displayedModels = showAllModels
        ? allModels
        : allModels.filter((m) => featuredIds.has(m.id) || m.id === "auto");
    const displayedSubagentModels = showAllSubagentModels
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
        const ids = allModels.map((m) => m.id);
        if (ids.length > 0 && ids.every((id) => next.includes(id))) next = [];
        setEnabledModels(next);
    };

    const toggleSubagentModel = (modelId: string, enabled: boolean) => {
        let next = enabled
            ? subagentModels.includes(modelId) ? subagentModels : [...subagentModels, modelId]
            : subagentModels.filter((id) => id !== modelId);
        next = sanitizeSubagentModels(next, allModels.map((m) => m.id));
        const nextDefault = resolveSubagentDefaultModel(subagentDefaultModel, next);
        updateSettingSection("ai", { subagentModels: next, subagentDefaultModel: nextDefault });
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
            {page === "subagents" ? (
                <>
                    <SettingSection
                        id="settings-ai-subagents"
                        title="Subagents"
                        description="Background agents use Auto unless you pick other models here. Named models fall back to Auto if you run out of credits."
                    >
                        <SettingCard>
                            {displayedSubagentModels.map((model) => (
                                <ModelRow
                                    key={model.id}
                                    model={model}
                                    enabled={isSubagentModelEnabled(model.id, subagentModels)}
                                    onToggle={(on) => toggleSubagentModel(model.id, on)}
                                    unavailableReason={
                                        !isCatalogModelAllowed(model.id) && !isApiModel(model)
                                            ? unavailableHint
                                            : undefined
                                    }
                                />
                            ))}
                            <button
                                type="button"
                                className="px-3.5 py-2.5 text-left text-sm text-text-muted hover:bg-white/4 hover:text-text-primary"
                                onClick={() => setShowAllSubagentModels((v) => !v)}
                            >
                                {showAllSubagentModels ? "Show fewer models" : "View all models"}
                            </button>
                        </SettingCard>
                    </SettingSection>
                    <SettingSection title="Default">
                        <SettingRow
                            title="Default subagent model"
                            description="Used unless you allow another model and the parent names it. Subagents never use the chat model."
                        >
                            <SettingSelect
                                value={subagentDefaultModel}
                                options={visibleSubagentModels.map((m) => ({ value: m.id, label: m.name }))}
                                onChange={(v) =>
                                    updateSettingSection("ai", {
                                        subagentDefaultModel: resolveSubagentDefaultModel(v, subagentModels),
                                    })
                                }
                            />
                        </SettingRow>
                    </SettingSection>
                </>
            ) : null}
            {page === "models" ? (
                <>
            <SettingSection id="settings-ai-models" title="Models">
                <SettingCard>
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
                <button
                    type="button"
                    className="px-3.5 py-2.5 text-left text-sm text-text-muted hover:bg-white/4 hover:text-text-primary"
                    onClick={() => setShowAllModels((v) => !v)}
                >
                    {showAllModels ? "Show fewer models" : "View all models"}
                </button>
                </SettingCard>
            </SettingSection>

            <SettingSection title="Default">
                <SettingRow title="Default model" description="Used when a chat is set to Auto.">
                    <SettingSelect
                        value={a.defaultModel}
                        options={visibleModels.map((m) => ({ value: m.id, label: m.name }))}
                        onChange={(v) => updateSettingSection("ai", { defaultModel: v })}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="Auto-run">
                <SettingCard>
                <SettingRow title="Auto-run mode" description="When the agent may run terminal commands.">
                    <SettingSelect
                        value={a.autoRunMode}
                        options={[
                            { value: "ask", label: "Ask every time" },
                            { value: "auto", label: "Auto" },
                            { value: "always", label: "Run everything" },
                        ] satisfies Array<{ value: AutoRunModeSetting; label: string }>}
                        onChange={(v) => {
                            updateSettingSection("ai", { autoRunMode: v as AutoRunModeSetting });
                            void commands.updateTurnPolicy({ autoRunMode: v });
                        }}
                    />
                </SettingRow>
                <SettingRow title="Protect destructive git" description="Force push, reset, and clean still ask.">
                    <SettingSwitch
                        checked={a.protectDestructiveGit}
                        onChange={(on) => {
                            updateSettingSection("ai", { protectDestructiveGit: on });
                            void commands.updateTurnPolicy({ protectDestructiveGit: on });
                        }}
                    />
                </SettingRow>
                </SettingCard>
            </SettingSection>

            <SettingSection title="Edits">
                <SettingCard>
                <SettingRow title="Require edit approval" description="Stage file edits before they are written.">
                    <SettingSwitch
                        checked={a.requireEditApproval}
                        onChange={(on) => {
                            updateSettingSection("ai", { requireEditApproval: on });
                            void commands.updateTurnPolicy({ requireEditApproval: on });
                        }}
                    />
                </SettingRow>
                <SettingRow title="Auto-apply agent edits" description="Write approved edits without a second confirm.">
                    <SettingSwitch
                        checked={a.autoApplyEdits}
                        onChange={(on) => updateSettingSection("ai", { autoApplyEdits: on })}
                    />
                </SettingRow>
                </SettingCard>
            </SettingSection>
                </>
            ) : null}

            {page === "context" ? (
            <>
            <SettingSection id="settings-ai-review" title="Review">
                <SettingRow
                    title="Adversarial review"
                    description="A second pass after large multi-file edits."
                >
                    <SettingSwitch
                        checked={a.reviewAdversarialEnabled}
                        onChange={(reviewAdversarialEnabled) =>
                            updateSettingSection("ai", { reviewAdversarialEnabled })
                        }
                    />
                </SettingRow>
            </SettingSection>
            <SettingSection id="settings-ai-context" title="Context">
                <SettingRow title="Max context lines" description="How much of each file is sent with a turn.">
                    <SettingNumberSelect
                        value={a.maxContextLines}
                        options={MAX_CONTEXT_PRESETS}
                        onChange={(v) => updateSettingSection("ai", { maxContextLines: v })}
                    />
                </SettingRow>
                <SettingCard>
                    <SettingRow title="Codebase index" description="This project is indexed for search. Always on.">
                        <span className="text-sm text-text-muted">Always on</span>
                    </SettingRow>
                    <SettingRow title="Semantic embeddings" description="Search by meaning, not only exact words.">
                        <SettingSwitch
                            checked={a.indexEmbeddings}
                            onChange={(on) => {
                                updateSettingSection("ai", { indexEmbeddings: on });
                                void commands.setIndexEmbeddings(on).catch(() => { /* ignore */ });
                            }}
                        />
                    </SettingRow>
                    <SettingRow
                        title="Chat memory"
                        description="The agent can look up past chats in this project when needed."
                    >
                        <SettingSwitch
                            checked={a.chatMemoryEnabled}
                            onChange={(on) => {
                                updateSettingSection("ai", { chatMemoryEnabled: on });
                                void commands.setChatMemoryEnabled(on).catch(() => { /* ignore */ });
                            }}
                        />
                    </SettingRow>
                </SettingCard>
            </SettingSection>
            <SettingSection title="Index">
                <SettingCard>
                    <div className="px-3.5 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-text-primary">
                                    {indexing
                                        ? indexPhase === "scanning"
                                            ? "Scanning files…"
                                            : indexPhase === "persisting"
                                              ? "Saving index…"
                                              : `Indexing… ${indexPercent}%`
                                        : indexStatus
                                          ? "Indexed"
                                          : "Not indexed yet"}
                                </div>
                                <div className="mt-0.5 text-xs text-text-muted">
                                    {indexStatus
                                        ? `${indexStatus.filesIndexed.toLocaleString()} files · ${indexStatus.chunks.toLocaleString()} chunks${
                                              indexStatus.lastIndexedAt
                                                  ? ` · Last indexed ${new Date(indexStatus.lastIndexedAt).toLocaleString(undefined, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                                                  : ""
                                          }`
                                        : "Index this project so search can find code."}
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" className={cn(SETTING_CONTROL_BTN, "shrink-0")} disabled={indexing} onClick={() => void handleReindex()}>
                                {indexing ? "Indexing…" : "Re-index"}
                            </Button>
                        </div>
                        <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                                className={cn(
                                    "h-full rounded-full bg-success",
                                    indexing && indexPhase === "scanning" && "w-1/3 animate-pulse",
                                )}
                                style={
                                    indexing && indexPhase === "scanning"
                                        ? undefined
                                        : { width: `${indexing ? Math.max(indexPercent, 4) : indexStatus ? Math.max(indexPercent, indexStatus.filesIndexed ? 100 : 0) : 0}%` }
                                }
                            />
                        </div>
                    </div>
                </SettingCard>
            </SettingSection>
            </>
            ) : null}

            {page === "rules" ? <RulesEditor value={a.customRules} /> : null}
            {page === "workflows" ? <WorkflowsEditor value={a.workflows ?? []} /> : null}
        </>
    );
}

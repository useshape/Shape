"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type AgentPanelTab = "changes" | "preview" | "terminal";

type AgentLayoutContextValue = {
    sessionsOpen: boolean;
    setSessionsOpen: (open: boolean) => void;
    toggleSessions: () => void;
    /** Right workbench rail (Changes / Preview / Terminal). */
    panelOpen: boolean;
    setPanelOpen: (open: boolean) => void;
    togglePanel: () => void;
    panelTab: AgentPanelTab;
    setPanelTab: (tab: AgentPanelTab) => void;
    openPanelTab: (tab: AgentPanelTab) => void;
    /** In-agent AI settings overlay (replaces chat content). */
    aiSettingsOpen: boolean;
    setAiSettingsOpen: (open: boolean) => void;
    openAiSettings: () => void;
    closeAiSettings: () => void;
};

const AgentLayoutContext = createContext<AgentLayoutContextValue | null>(null);

export function AgentLayoutProvider({ children }: { children: React.ReactNode }) {
    const [sessionsOpen, setSessionsOpen] = useState(true);
    const [panelOpen, setPanelOpen] = useState(true);
    const [panelTab, setPanelTab] = useState<AgentPanelTab>("changes");
    const [aiSettingsOpen, setAiSettingsOpen] = useState(false);

    const toggleSessions = useCallback(() => setSessionsOpen((v) => !v), []);
    const togglePanel = useCallback(() => setPanelOpen((v) => !v), []);
    const openPanelTab = useCallback((tab: AgentPanelTab) => {
        setPanelTab(tab);
        setPanelOpen(true);
    }, []);
    const openAiSettings = useCallback(() => setAiSettingsOpen(true), []);
    const closeAiSettings = useCallback(() => setAiSettingsOpen(false), []);

    useEffect(() => {
        const openPreview = () => openPanelTab("preview");
        const openChanges = () => openPanelTab("changes");
        const openTerminal = () => openPanelTab("terminal");
        const onToggleSessions = () => toggleSessions();
        const onTogglePanel = () => togglePanel();
        const onOpenAiSettings = () => openAiSettings();
        window.addEventListener("shape-open-preview", openPreview);
        window.addEventListener("shape-agent-open-preview", openPreview);
        window.addEventListener("shape-agent-open-changes", openChanges);
        window.addEventListener("shape-agent-open-terminal", openTerminal);
        window.addEventListener("shape-agent-toggle-sessions", onToggleSessions);
        window.addEventListener("shape-agent-toggle-panel", onTogglePanel);
        window.addEventListener("shape-agent-open-ai-settings", onOpenAiSettings);
        return () => {
            window.removeEventListener("shape-open-preview", openPreview);
            window.removeEventListener("shape-agent-open-preview", openPreview);
            window.removeEventListener("shape-agent-open-changes", openChanges);
            window.removeEventListener("shape-agent-open-terminal", openTerminal);
            window.removeEventListener("shape-agent-toggle-sessions", onToggleSessions);
            window.removeEventListener("shape-agent-toggle-panel", onTogglePanel);
            window.removeEventListener("shape-agent-open-ai-settings", onOpenAiSettings);
        };
    }, [openPanelTab, toggleSessions, togglePanel, openAiSettings]);

    const value = useMemo(
        () => ({
            sessionsOpen,
            setSessionsOpen,
            toggleSessions,
            panelOpen,
            setPanelOpen,
            togglePanel,
            panelTab,
            setPanelTab,
            openPanelTab,
            aiSettingsOpen,
            setAiSettingsOpen,
            openAiSettings,
            closeAiSettings,
        }),
        [
            sessionsOpen,
            toggleSessions,
            panelOpen,
            togglePanel,
            panelTab,
            openPanelTab,
            aiSettingsOpen,
            openAiSettings,
            closeAiSettings,
        ],
    );

    return <AgentLayoutContext.Provider value={value}>{children}</AgentLayoutContext.Provider>;
}

export function useAgentLayout() {
    const ctx = useContext(AgentLayoutContext);
    if (!ctx) {
        throw new Error("useAgentLayout must be used within AgentLayoutProvider");
    }
    return ctx;
}

export function useAgentLayoutOptional() {
    return useContext(AgentLayoutContext);
}

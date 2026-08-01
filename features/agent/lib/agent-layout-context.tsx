"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type AgentLayoutContextValue = {
    sessionsOpen: boolean;
    setSessionsOpen: (open: boolean) => void;
    toggleSessions: () => void;
};

const AgentLayoutContext = createContext<AgentLayoutContextValue | null>(null);

export function AgentLayoutProvider({ children }: { children: React.ReactNode }) {
    const [sessionsOpen, setSessionsOpen] = useState(true);

    const toggleSessions = useCallback(() => setSessionsOpen((v) => !v), []);

    const value = useMemo(
        () => ({
            sessionsOpen,
            setSessionsOpen,
            toggleSessions,
        }),
        [sessionsOpen, toggleSessions],
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

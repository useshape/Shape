"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { statusProgress } from "@/lib/status-progress";

interface LoadingContextType {
    isLoading: boolean;
    startLoading: (message?: string) => void;
    stopLoading: (message?: string) => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
    const [loadingCount, setLoadingCount] = useState(0);

    const startLoading = useCallback((message?: string) => {
        if (message) statusProgress.push("global-loading", message);
        setLoadingCount((prev) => prev + 1);
    }, []);
    const stopLoading = useCallback((message?: string) => {
        setLoadingCount((prev) => {
            const next = Math.max(0, prev - 1);
            if (next === 0) statusProgress.remove("global-loading");
            return next;
        });
        if (message) statusProgress.remove(message);
    }, []);

    return (
        <LoadingContext.Provider value={{ isLoading: loadingCount > 0, startLoading, stopLoading }}>
            {children}
        </LoadingContext.Provider>
    );
}

export function useLoading() {
    const context = useContext(LoadingContext);
    if (!context) {
        throw new Error("useLoading must be used within a LoadingProvider");
    }
    return context;
}

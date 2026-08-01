"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

interface LayoutContextType {
    zenMode: boolean;
    toggleZenMode: () => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: React.ReactNode }) {
    const [zenMode, setZenModeInternal] = useState(false);

    const toggleZenMode = useCallback(() => {
        setZenModeInternal(prev => !prev);
    }, []);

    // Handle global event for zen mode
    useEffect(() => {
        const handleToggle = () => toggleZenMode();
        window.addEventListener("shape-toggle-zen-mode", handleToggle);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let unlisten: any;
        import("@tauri-apps/api/event").then(module => {
            module.listen("toggle-zen-mode", () => {
                toggleZenMode();
            }).then(fn => unlisten = fn);
        });

        return () => {
            window.removeEventListener("shape-toggle-zen-mode", handleToggle);
            if (unlisten) unlisten();
        };
    }, [toggleZenMode]);

    return (
        <LayoutContext.Provider value={{ zenMode, toggleZenMode }}>
            {children}
        </LayoutContext.Provider>
    );
}

export function useLayout() {
    const context = useContext(LayoutContext);
    if (!context) {
        throw new Error("useLayout must be used within a LayoutProvider");
    }
    return context;
}

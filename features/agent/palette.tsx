"use client";

import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";

type CmdPaletteMod = { CommandPalette: ComponentType };

function loadCommandPalette(): Promise<{ default: ComponentType }> {
    const g = globalThis as typeof globalThis & {
        __shapeCmdPalettePromise?: Promise<{ default: ComponentType }>;
    };
    if (!g.__shapeCmdPalettePromise) {
        g.__shapeCmdPalettePromise = import("@/features/command-palette").then(
            (m: CmdPaletteMod) => ({ default: m.CommandPalette }),
        );
    }
    return g.__shapeCmdPalettePromise;
}

const CommandPalette = lazy(() => loadCommandPalette());

function PaletteMount() {
    return (
        <Suspense fallback={null}>
            <CommandPalette />
        </Suspense>
    );
}

/** Mount only after first Ctrl+K / shape-command-palette. */
export function CommandPaletteBridge() {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const arm = () => setReady(true);
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") arm();
        };
        window.addEventListener("shape-command-palette", arm);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("shape-command-palette", arm);
            window.removeEventListener("keydown", onKey);
        };
    }, []);

    if (!ready) return null;
    return <PaletteMount />;
}

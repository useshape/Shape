"use client";

import React, { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface FontViewProps {
    path: string;
}

const SAMPLE_TEXT = "The quick brown fox jumps over the lazy dog.";
const SAMPLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789";

export function FontView({ path }: FontViewProps) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fontFamily = useMemo(() => {
        const base = path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "PreviewFont";
        return `shape-font-${base.replace(/[^a-zA-Z0-9_-]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
    }, [path]);

    const fileName = path.split(/[\\/]/).pop() || path;

    useEffect(() => {
        let cancelled = false;
        const loadFont = async () => {
            setLoaded(false);
            setError(null);
            try {
                const src = convertFileSrc(path);
                const response = await fetch(src);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const buffer = await response.arrayBuffer();
                const face = new FontFace(fontFamily, buffer);
                await face.load();
                if (cancelled) return;
                document.fonts.add(face);
                setLoaded(true);
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : String(e));
                }
            }
        };
        void loadFont();
        return () => {
            cancelled = true;
        };
    }, [path, fontFamily]);

    return (
        <div className="flex flex-1 flex-col gap-6 overflow-auto custom-scrollbar bg-panel-secondary p-4 h-full">
            <div className="space-y-1">
                <h2 className="text-md font-regular text-text-primary">{fileName}</h2>
            </div>

            {error && (
                <div className="rounded-lg bg-error/10 p-1 text-sm text-error">
                    Failed to load font preview: {error}
                </div>
            )}

            {!loaded && !error && (
                <div className="text-sm text-text-muted">Loading font preview...</div>
            )}

            {loaded && (
                <div className="space-y-8" style={{ fontFamily: `"${fontFamily}", sans-serif` }}>
                    {[48, 36, 24, 18, 14].map((size) => (
                        <div key={size} className="space-y-2">
                            <div className="text-sm font-sans text-text-muted">{size}px</div>
                            <p className="text-text-primary leading-snug" style={{ fontSize: size }}>
                                {SAMPLE_TEXT}
                            </p>
                        </div>
                    ))}
                    <div className="space-y-2">
                        <div className="text-sm font-sans text-text-muted">Character set</div>
                        <p className="text-xl text-text-primary leading-relaxed">{SAMPLE_CHARS}</p>
                    </div>
                </div>
            )}
        </div>
    );
}

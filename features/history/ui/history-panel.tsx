"use client";

import React, { useCallback, useEffect, useState } from "react";
import { commands } from "@/lib/backend";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { HistoryEntry } from "@/lib/backend/types";

export function HistoryPanel({ filePath, onClose }: { filePath: string; onClose?: () => void }) {
    const [entries, setEntries] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [restoring, setRestoring] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await commands.getFileHistory(filePath);
            setEntries(data);
        } catch {
            setEntries([]);
        } finally {
            setLoading(false);
        }
    }, [filePath]);

    useEffect(() => {
        void load();
    }, [load]);

    const restore = async (versionId: string) => {
        setRestoring(versionId);
        try {
            const content = await commands.restoreHistoryVersion(filePath, versionId);
            await commands.saveFile(filePath, content);
            window.dispatchEvent(new CustomEvent("shape-file-reload", { detail: { path: filePath } }));
            onClose?.();
        } catch (e) {
            console.error("Restore failed:", e);
        } finally {
            setRestoring(null);
        }
    };

    return (
        <div className="absolute inset-y-0 right-0 z-30 flex w-72 flex-col border-l border-border-subtle bg-panel shadow-lg">
            <div className="flex h-9 shrink-0 items-center justify-between px-3 border-b border-border-subtle">
                <span className="text-xs font-medium text-text-primary">Local History</span>
                <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
                    <Icon name="close" size={14} />
                </button>
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar p-2">
                {loading ? (
                    <div className="px-2 py-4 text-xs text-text-muted">Loading…</div>
                ) : entries.length === 0 ? (
                    <div className="px-2 py-4 text-xs text-text-muted">No saved versions yet.</div>
                ) : (
                    <div className="relative ml-3 border-l border-border-subtle pl-4">
                        {entries.map((entry) => (
                            <div key={entry.id} className="relative mb-3">
                                <div className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-accent" />
                                <button
                                    type="button"
                                    disabled={restoring === entry.id}
                                    className={cn(
                                        "w-full rounded-lg px-2 py-1.5 text-left hover:bg-panel-hover",
                                        restoring === entry.id && "opacity-50"
                                    )}
                                    onClick={() => restore(entry.id)}
                                >
                                    <div className="text-sm text-text-primary">{entry.label}</div>
                                    <div className="text-xs text-text-muted">
                                        {(entry.size / 1024).toFixed(1)} KB
                                    </div>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

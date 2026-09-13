"use client";

import { RiDeleteBinLine, RiDownloadLine, RiPencilLine, RiUploadLine } from "@remixicon/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search";
import { notify } from "@/features/notifications";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
    AlertDialog,
    AlertDialogBody,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    type KeyBinding,
    type KeybindingPresetId,
    applyKeybindingPreset,
    eventModifierPrefix,
    eventToKeyChord,
    exportKeybindingOverrides,
    findKeybindingConflicts,
    getActiveKeybindingPreset,
    importKeybindingOverrides,
    listKeybindingPresets,
    loadKeybindings,
    resetKeybindingOverrides,
    setKeybindingOverride,
} from "@/lib/ui/shortcuts";

function Keycap({ children }: { children: React.ReactNode }) {
    return (
        <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-input-bg px-2 py-0.5 text-xs font-medium text-text-secondary">
            {children}
        </kbd>
    );
}

function KeyChordBadges({ chord }: { chord: string }) {
    if (!chord.trim()) {
        return <span className="text-sm text-text-muted">Unassigned</span>;
    }
    const parts = chord.trim().split(/\s+/);
    return (
        <span className="inline-flex flex-wrap items-center gap-1">
            {parts.map((part, pi) => (
                <React.Fragment key={`${part}-${pi}`}>
                    {pi > 0 ? <span className="px-0.5 text-text-muted"> </span> : null}
                    <Keycap>{part}</Keycap>
                </React.Fragment>
            ))}
        </span>
    );
}

function RecordKeybindingDialog({
    binding,
    onClose,
    onSave,
}: {
    binding: KeyBinding;
    onClose: () => void;
    onSave: (key: string) => void;
}) {
    const [chord, setChord] = useState("");
    const [held, setHeld] = useState("");
    const chordRef = useRef("");
    const pendingRef = useRef<string | null>(null);
    const pendingTimerRef = useRef<number | null>(null);

    chordRef.current = chord;

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            setHeld(eventModifierPrefix(e));

            if (e.repeat) return;

            if (e.key === "Escape") {
                onClose();
                return;
            }

            const unmodified =
                !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

            if (e.key === "Enter" && unmodified) {
                const next = chordRef.current.trim();
                if (next) onSave(next);
                return;
            }

            if (e.key === "Backspace" && unmodified) {
                setChord("");
                pendingRef.current = null;
                if (pendingTimerRef.current != null) {
                    window.clearTimeout(pendingTimerRef.current);
                    pendingTimerRef.current = null;
                }
                return;
            }

            const piece = eventToKeyChord(e);
            if (!piece) return;

            if (pendingRef.current) {
                const next = `${pendingRef.current} ${piece}`;
                setChord(next);
                pendingRef.current = null;
                if (pendingTimerRef.current != null) {
                    window.clearTimeout(pendingTimerRef.current);
                    pendingTimerRef.current = null;
                }
                return;
            }

            setChord(piece);
            pendingRef.current = piece;
            if (pendingTimerRef.current != null) window.clearTimeout(pendingTimerRef.current);
            pendingTimerRef.current = window.setTimeout(() => {
                pendingRef.current = null;
                pendingTimerRef.current = null;
            }, 1000);
        };

        const onKeyUp = (e: KeyboardEvent) => {
            setHeld(eventModifierPrefix(e));
        };

        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("keyup", onKeyUp, true);
            if (pendingTimerRef.current != null) window.clearTimeout(pendingTimerRef.current);
        };
    }, [onClose, onSave]);

    const conflicts = findKeybindingConflicts(chord, binding.label);
    const preview = chord.trim() || held.replace(/\+$/, "");

    return (
        <AlertDialog
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <AlertDialogContent
                sizeClassName="max-w-md"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <AlertDialogHeader>
                    <AlertDialogTitle>Set keybinding</AlertDialogTitle>
                    <AlertDialogDescription>{binding.label}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogBody>
                    <div className="rounded-lg border border-border bg-panel px-3 py-2 font-mono text-sm text-text-primary">
                        {preview}
                        <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-accent align-middle" />
                    </div>
                    <div className="mt-3 flex min-h-8 items-center">
                        {preview ? <KeyChordBadges chord={preview} /> : null}
                    </div>
                    {conflicts.length > 0 ? (
                        <p className="mt-3 text-xs text-warning">
                            Also used by: {conflicts.map((c) => c.label).join(", ")}
                        </p>
                    ) : null}
                </AlertDialogBody>
                <AlertDialogFooter>
                    <AlertDialogCancel asChild>
                        <Button type="button" variant="ghost" size="sm">
                            Cancel
                        </Button>
                    </AlertDialogCancel>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onSave("")}
                    >
                        Clear
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        disabled={!chord.trim()}
                        onClick={() => onSave(chord.trim())}
                    >
                        Save
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export function KeyboardShortcutsView() {
    const [query, setQuery] = useState("");
    const [bindings, setBindings] = useState<KeyBinding[]>(() => loadKeybindings());
    const [recording, setRecording] = useState<KeyBinding | null>(null);
    const [presetId, setPresetId] = useState(() => getActiveKeybindingPreset());
    const presets = useMemo(() => listKeybindingPresets(), []);

    const reload = useCallback(() => {
        setBindings(loadKeybindings());
        setPresetId(getActiveKeybindingPreset());
    }, []);

    useEffect(() => {
        const onChange = () => reload();
        window.addEventListener("shape-keybindings-changed", onChange);
        return () => window.removeEventListener("shape-keybindings-changed", onChange);
    }, [reload]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return bindings;
        return bindings.filter(
            (b) =>
                b.label.toLowerCase().includes(q)
                || b.key.toLowerCase().includes(q)
                || b.when.toLowerCase().includes(q)
                || b.category.toLowerCase().includes(q)
                || b.id.toLowerCase().includes(q),
        );
    }, [bindings, query]);

    const grouped = useMemo(() => {
        const map = new Map<string, KeyBinding[]>();
        for (const b of filtered) {
            const cat = b.category || "General";
            const list = map.get(cat) ?? [];
            list.push(b);
            map.set(cat, list);
        }
        return [...map.entries()];
    }, [filtered]);

    const applyPreset = (id: KeybindingPresetId) => {
        applyKeybindingPreset(id);
        reload();
        notify.info("Keyboard Shortcuts", `Applied ${presets.find((p) => p.id === id)?.label ?? id}`);
    };

    const onImportJson = () => {
        try {
            const text = window.prompt("Paste keybinding overrides JSON (label → key):");
            if (!text?.trim()) return;
            const parsed = JSON.parse(text) as Record<string, string>;
            if (!parsed || typeof parsed !== "object") throw new Error("Invalid JSON");
            importKeybindingOverrides(parsed, "replace");
            reload();
            notify.info("Keyboard Shortcuts", "Imported overrides");
        } catch (err) {
            notify.error(
                "Keyboard Shortcuts",
                err instanceof Error ? err.message : "Failed to import",
            );
        }
    };

    const onExportJson = async () => {
        const json = exportKeybindingOverrides();
        try {
            await navigator.clipboard.writeText(json);
            notify.info("Keyboard Shortcuts", "Overrides copied to clipboard");
        } catch {
            window.prompt("Copy overrides JSON:", json);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-8 pb-6 lg:px-8">
                <div className="mx-auto w-full max-w-5xl">
                    <h1 className="text-2xl font-medium text-text-primary">Keyboard shortcuts</h1>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <SearchInput
                            placeholder="Search shortcuts"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="h-9 min-w-[220px] flex-1 rounded-full border border-border-subtle bg-input-bg px-3"
                        />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button type="button" variant="ghost" size="sm" className="gap-1.5">
                                    <Icon icon={RiDownloadLine} />
                                    Import
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[160px]">
                                {presets.map((p) => (
                                    <DropdownMenuItem key={p.id} onSelect={() => applyPreset(p.id)}>
                                        {p.label}
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => onImportJson()}>
                                    Import JSON…
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => void onExportJson()}
                        >
                            <Icon icon={RiUploadLine} />
                            Export
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                resetKeybindingOverrides();
                                reload();
                                notify.info("Keyboard Shortcuts", "Reset to defaults");
                            }}
                        >
                            Reset
                        </Button>
                    </div>
                    <p className="mt-2 text-sm text-text-muted">
                        {presetId === "custom"
                            ? "Custom"
                            : presets.find((p) => p.id === presetId)?.label ?? presetId}
                    </p>

                    <div className="mt-6 overflow-hidden rounded-xl border border-border-subtle bg-surface-2 divide-y divide-border-subtle">
                        {filtered.length === 0 ? (
                            <div className="px-4 py-10 text-center text-sm text-text-muted">
                                No keybindings match “{query}”
                            </div>
                        ) : (
                            grouped.flatMap(([, items]) =>
                                items.map((b) => (
                                    <div
                                        key={`${b.id}-${b.label}`}
                                        className="flex items-center gap-4 px-4 py-3.5"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="text-md font-medium text-text-primary">{b.label}</div>
                                            <div className="mt-0.5 text-sm text-text-muted">
                                                {b.description || b.when}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <KeyChordBadges chord={b.key} />
                                            <button
                                                type="button"
                                                aria-label={`Edit ${b.label}`}
                                                className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
                                                onClick={() => setRecording(b)}
                                            >
                                                <Icon icon={RiPencilLine} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={`Remove shortcut for ${b.label}`}
                                                className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-error"
                                                onClick={() => {
                                                    setKeybindingOverride(b.label, "");
                                                    reload();
                                                }}
                                            >
                                                <Icon icon={RiDeleteBinLine} />
                                            </button>
                                        </div>
                                    </div>
                                )),
                            )
                        )}
                    </div>
                </div>
            </div>

            {recording ? (
                <RecordKeybindingDialog
                    binding={recording}
                    onClose={() => setRecording(null)}
                    onSave={(key) => {
                        setKeybindingOverride(recording.label, key);
                        setRecording(null);
                        reload();
                    }}
                />
            ) : null}
        </div>
    );
}

"use client";

import { useEffect, useRef } from "react";
import { dispatchShortcutAction } from "@/lib/ui/shortcut-actions";
import defaultKeybindings from "@/config/keybindings.json";
import presetPack from "@/config/keybinding-presets.json";

export interface KeyBinding {
    id: string;
    label: string;
    key: string;
    /** Display / future context predicate (VS Code–style `when`). */
    when: string;
    category: string;
    description?: string;
    source: "default" | "user";
}

export type KeybindingPresetId = keyof typeof presetPack.presets;

const OVERRIDE_KEY = "shape-keybindings-override";
const PRESET_KEY = "shape-keybindings-preset";

type RawBinding = {
    id?: string;
    label: string;
    key: string;
    when?: string;
    context?: string;
    category?: string;
    description?: string;
};

function slugId(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function loadKeybindings(): KeyBinding[] {
    const defaults = (defaultKeybindings.keybindings as RawBinding[]).map((kb) => ({
        id: kb.id || slugId(kb.label),
        label: kb.label,
        key: kb.key,
        when: kb.when ?? kb.context ?? "global",
        category: kb.category ?? "General",
        description: kb.description ?? "",
        source: "default" as const,
    }));

    try {
        const raw = localStorage.getItem(OVERRIDE_KEY);
        if (!raw) return defaults;
        const overrides = JSON.parse(raw) as Record<string, string>;
        return defaults.map((kb) => {
            const customKey = overrides[kb.label] ?? overrides[kb.id];
            if (customKey === undefined) return kb;
            if (customKey.trim() === "") return { ...kb, key: "", source: "user" as const };
            return { ...kb, key: customKey.trim(), source: "user" as const };
        });
    } catch {
        return defaults;
    }
}

export function saveKeybindingOverrides(overrides: Record<string, string>): void {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
    window.dispatchEvent(new Event("shape-keybindings-changed"));
}

export function setKeybindingOverride(label: string, key: string | null): void {
    const overrides = getKeybindingOverrides();
    if (key === null) delete overrides[label];
    else overrides[label] = key.trim();
    saveKeybindingOverrides(overrides);
}

export function resetKeybindingOverrides(): void {
    localStorage.removeItem(OVERRIDE_KEY);
    localStorage.removeItem(PRESET_KEY);
    window.dispatchEvent(new Event("shape-keybindings-changed"));
}

export function getKeybindingOverrides(): Record<string, string> {
    try {
        const raw = localStorage.getItem(OVERRIDE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
    } catch {
        return {};
    }
}

export function listKeybindingPresets(): Array<{
    id: KeybindingPresetId;
    label: string;
}> {
    return (Object.keys(presetPack.presets) as KeybindingPresetId[]).map((id) => ({
        id,
        label: presetPack.presets[id].label,
    }));
}

export function getActiveKeybindingPreset(): KeybindingPresetId | "custom" {
    try {
        const id = localStorage.getItem(PRESET_KEY);
        if (id && id in presetPack.presets) return id as KeybindingPresetId;
    } catch {
        /* ignore */
    }
    const overrides = getKeybindingOverrides();
    return Object.keys(overrides).length > 0 ? "custom" : "default";
}

/** Apply a named preset (replaces user overrides). */
export function applyKeybindingPreset(presetId: KeybindingPresetId): void {
    const preset = presetPack.presets[presetId];
    if (!preset) return;
    localStorage.setItem(PRESET_KEY, presetId);
    saveKeybindingOverrides({ ...preset.overrides });
}

/** Import arbitrary overrides JSON (label → key). Merges by default. */
export function importKeybindingOverrides(
    overrides: Record<string, string>,
    mode: "replace" | "merge" = "merge",
): void {
    const next =
        mode === "replace" ? { ...overrides } : { ...getKeybindingOverrides(), ...overrides };
    localStorage.setItem(PRESET_KEY, "custom");
    saveKeybindingOverrides(next);
}

export function exportKeybindingOverrides(): string {
    return JSON.stringify(getKeybindingOverrides(), null, 2);
}

/** Find other commands that already use this key chord. */
export function findKeybindingConflicts(key: string, exceptLabel?: string): KeyBinding[] {
    const normalized = key.trim();
    if (!normalized) return [];
    return loadKeybindings().filter(
        (kb) => kb.key === normalized && kb.label !== exceptLabel,
    );
}

/**
 * Get the shortcut string for a given label.
 */
export function getShortcutForLabel(label: string): string | undefined {
    const bindings = loadKeybindings();
    return bindings.find((kb) => kb.label === label)?.key;
}

/** Split a chord into keycap tokens for UI badges (flat, with + separators implied by UI). */
export function splitKeyChord(chord: string): string[] {
    return chord
        .trim()
        .split(/\s+/)
        .flatMap((part) => part.split("+"))
        .map((k) => k.trim())
        .filter(Boolean);
}
/** Ctrl+/Alt+/Shift+/Cmd+ prefix from currently held modifiers. */
export function eventModifierPrefix(e: {
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
}): string {
    let modifier = "";
    if (e.ctrlKey) modifier += "Ctrl+";
    if (e.altKey) modifier += "Alt+";
    if (e.shiftKey) modifier += "Shift+";
    if (e.metaKey) modifier += "Cmd+";
    return modifier;
}

function keyNameFromEvent(e: KeyboardEvent): string | null {
    const { code, key } = e;
    if (key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") return null;

    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^F\d{1,2}$/.test(code)) return code;

    switch (code) {
        case "Space":
            return "Space";
        case "Escape":
            return "Escape";
        case "Enter":
        case "NumpadEnter":
            return "Enter";
        case "Tab":
            return "Tab";
        case "Backspace":
            return "Backspace";
        case "Delete":
            return "Delete";
        case "ArrowRight":
            return "Right";
        case "ArrowLeft":
            return "Left";
        case "ArrowUp":
            return "Up";
        case "ArrowDown":
            return "Down";
        case "Backquote":
            return "`";
        case "Minus":
        case "NumpadSubtract":
            return "-";
        case "Equal":
            return "=";
        case "BracketLeft":
            return "[";
        case "BracketRight":
            return "]";
        case "Backslash":
            return "\\";
        case "Semicolon":
            return ";";
        case "Quote":
            return "'";
        case "Comma":
            return ",";
        case "Period":
        case "NumpadDecimal":
            return ".";
        case "Slash":
        case "NumpadDivide":
            return "/";
        case "Home":
            return "Home";
        case "End":
            return "End";
        case "PageUp":
            return "PageUp";
        case "PageDown":
            return "PageDown";
        case "Insert":
            return "Insert";
        default:
            break;
    }

    if (key.length === 1) return key.toUpperCase();
    return null;
}

/** Normalize a KeyboardEvent into Shape's Ctrl+K S chord format. */
export function eventToKeyChord(e: KeyboardEvent): string | null {
    const keyName = keyNameFromEvent(e);
    if (!keyName) return null;
    return eventModifierPrefix(e) + keyName;
}

/**
 * React hook that registers global keyboard shortcuts from the built-in config.
 */
export function useKeyboardShortcuts() {
    const chordRef = useRef<string | null>(null);
    const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bindingsRef = useRef<KeyBinding[]>(loadKeybindings());

    useEffect(() => {
        const reload = () => {
            bindingsRef.current = loadKeybindings();
        };
        reload();
        window.addEventListener("shape-keybindings-changed", reload);
        return () => window.removeEventListener("shape-keybindings-changed", reload);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.defaultPrevented) return;

            const target = e.target as HTMLElement;
            const isInput =
                target.tagName === "INPUT"
                || target.tagName === "TEXTAREA"
                || target.isContentEditable;

            const currentPartial = eventToKeyChord(e);
            if (!currentPartial) return;

            let fullShortcut = currentPartial;

            if (chordRef.current) {
                fullShortcut = `${chordRef.current} ${currentPartial}`;
                chordRef.current = null;
                if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
            }

            // Prefer chord prefixes over a shorter exact match (e.g. Ctrl+K vs Ctrl+K S).
            const isChordRoot =
                !chordRef.current
                && bindingsRef.current.some((k) => k.key.startsWith(currentPartial + " "));
            if (isChordRoot) {
                e.preventDefault();
                const exact = bindingsRef.current.find((k) => k.key === currentPartial);
                chordRef.current = currentPartial;
                if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
                chordTimerRef.current = setTimeout(() => {
                    chordRef.current = null;
                    if (!exact) return;
                    if (!dispatchShortcutAction(exact.label, exact.key)) {
                        void import("@/lib/backend/commands").then(({ commands }) => {
                            void commands.handleShortcut(exact.key);
                        });
                    }
                }, 1000);
                return;
            }

            const binding = bindingsRef.current.find((k) => k.key === fullShortcut);

            if (binding) {
                const terminalRoot = target.closest('[data-terminal-root="true"]');
                if (
                    terminalRoot
                    && (binding.label === "Close Tab" || binding.label === "Close All Tabs")
                ) {
                    e.preventDefault();
                    window.dispatchEvent(
                        new CustomEvent("shape-terminal-shortcut", {
                            detail: {
                                action:
                                    binding.label === "Close Tab" ? "close_tab" : "close_all_tabs",
                            },
                        }),
                    );
                    return;
                }

                const inputIgnored = [
                    "Ctrl+A",
                    "Ctrl+C",
                    "Ctrl+V",
                    "Ctrl+X",
                    "Ctrl+Z",
                    "Ctrl+Y",
                ];
                if (isInput && inputIgnored.includes(fullShortcut)) {
                    return;
                }

                e.preventDefault();
                if (!dispatchShortcutAction(binding.label, binding.key)) {
                    void import("@/lib/backend/commands").then(({ commands }) => {
                        void commands.handleShortcut(binding.key);
                    });
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
        };
    }, []);
}

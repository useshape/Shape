"use client";

import { useEffect, useRef } from "react";
import { dispatchShortcutAction } from "@/lib/ui/shortcut-actions";
import defaultKeybindings from "@/config/keybindings.json";

export interface KeyBinding {
    id: string;
    label: string;
    key: string;
    context?: string;
    description?: string;
    source: "default" | "user";
}

const OVERRIDE_KEY = "shape-keybindings-override";

export function loadKeybindings(): KeyBinding[] {
    const defaults = defaultKeybindings.keybindings.map((kb) => ({
        id: kb.label.toLowerCase().replace(/\s+/g, "-"),
        label: kb.label,
        key: kb.key,
        context: (kb as Record<string, string>).context ?? "Global",
        description: (kb as Record<string, string>).description ?? "",
        source: "default" as const,
    }));

    try {
        const raw = localStorage.getItem(OVERRIDE_KEY);
        if (!raw) return defaults;
        const overrides = JSON.parse(raw) as Record<string, string>;
        return defaults.map((kb) => {
            const customKey = overrides[kb.label];
            if (!customKey?.trim()) return kb;
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

export function resetKeybindingOverrides(): void {
    localStorage.removeItem(OVERRIDE_KEY);
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

/**
 * Get the shortcut string for a given label.
 */
export function getShortcutForLabel(label: string): string | undefined {
    const bindings = loadKeybindings();
    return bindings.find((kb) => kb.label === label)?.key;
}

/**
 * React hook that registers global keyboard shortcuts from the built-in config.
 */
export function useKeyboardShortcuts() {
    const chordRef = useRef<string | null>(null);
    const chordTimerRef = useRef<NodeJS.Timeout | null>(null);
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
            const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

            let modifier = "";
            if (e.ctrlKey) modifier += "Ctrl+";
            if (e.altKey) modifier += "Alt+";
            if (e.shiftKey) modifier += "Shift+";
            if (e.metaKey) modifier += "Cmd+";

            const key = e.key.toUpperCase();
            if (key === "CONTROL" || key === "ALT" || key === "SHIFT" || key === "META") return;

            let keyName = "";
            if (key.startsWith("F") && key.length > 1) {
                keyName = key;
            } else if (key.length === 1) {
                keyName = key;
            } else if (key === "ARROWRIGHT") {
                keyName = "Right";
            } else if (key === "ARROWLEFT") {
                keyName = "Left";
            } else if (key === "ARROWUP") {
                keyName = "Up";
            } else if (key === "ARROWDOWN") {
                keyName = "Down";
            } else if (key === "`") {
                keyName = "`";
            } else {
                return;
            }

            const currentPartial = modifier + keyName;
            let fullShortcut = currentPartial;

            if (chordRef.current) {
                fullShortcut = `${chordRef.current} ${currentPartial}`;
                chordRef.current = null;
                if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
            }

            // Prefer chord prefixes over a shorter exact match (e.g. Ctrl+K vs Ctrl+K S).
            // Exact single-key bindings that are also chord roots fire after the chord timeout.
            const isChordRoot =
                !chordRef.current &&
                bindingsRef.current.some((k) => k.key.startsWith(currentPartial + " "));
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
                if (terminalRoot && (binding.label === "Close Tab" || binding.label === "Close All Tabs")) {
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent("shape-terminal-shortcut", {
                        detail: { action: binding.label === "Close Tab" ? "close_tab" : "close_all_tabs" }
                    }));
                    return;
                }

                const inputIgnored = ["Ctrl+A", "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Z", "Ctrl+Y"];
                if (isInput && inputIgnored.includes(fullShortcut)) {
                    return;
                }

                e.preventDefault();
                if (!dispatchShortcutAction(binding.label, binding.key)) {
                    void import("@/lib/backend/commands").then(({ commands }) => {
                        void commands.handleShortcut(binding.key);
                    });
                }
                return;
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
        };
    }, []);
}

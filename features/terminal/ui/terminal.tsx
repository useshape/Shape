"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { commands, useProjectState } from "@/lib/backend";
import type { TerminalShellProfile } from "@/lib/backend/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import type { Terminal as XTermType } from "@xterm/xterm";
import type { FitAddon as FitAddonType } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import Problems from "@/features/diagnostics/ui/problems";
import OutputPanel from "@/features/output/ui/output";
import TestPanel from "@/features/testing/ui/test-panel";
import PreviewPanel from "@/features/preview/ui/preview-panel";
import { Button } from "@/components/ui/button";
import { getSettings, resolveDefaultTerminalShell } from "@/lib/settings";
import { setLastDevUrl } from "@/features/preview/store";

type TerminalShell = TerminalShellProfile["id"] | "ai";
type TerminalTab = { id: string; title: string; shell: TerminalShell; cwd: string; boundPtyId?: number; };

const SHELL_DISPLAY_NAMES: Record<TerminalShell, string> = {
    powershell: "PowerShell",
    pwsh: "PowerShell 7",
    cmd: "CMD",
    gitbash: "Git Bash",
    wsl: "WSL",
    ai: "Agent Terminal",
};

const createTabId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11);
const createPtyId = () => Math.floor(100000 + Math.random() * 2_000_000_000);

const getNextTerminalName = (tabs: TerminalTab[], shell: TerminalShell, cwd: string): string => {
    const prefix = SHELL_DISPLAY_NAMES[shell];
    const projectTabs = tabs.filter(t => t.cwd === cwd && t.shell === shell);
    let num = 1;
    while (projectTabs.some(t => t.title === `${prefix} ${num}`)) num++;
    return `${prefix} ${num}`;
};

const createTerminalTab = (
    shell: TerminalShell,
    title: string,
    cwd: string,
    id: string = createTabId(),
    boundPtyId?: number,
): TerminalTab => ({ id, title, shell, cwd, boundPtyId });

// ── GLOBAL STORE FOR PERSISTENCE ──
class TerminalGlobalStore {
    tabs: TerminalTab[] = [];
    activeProjectTabs: Record<string, string | null> = {};
    instances = new Map<string, { term: XTermType; fitAddon: FitAddonType; ptyId: number; unlistenOutput: () => void }>();
    listeners = new Set<() => void>();

    subscribe(l: () => void): () => void { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
    notify() { this.listeners.forEach(l => l()); }
    setTabs(u: (p: TerminalTab[]) => TerminalTab[]) { this.tabs = u(this.tabs); this.notify(); }
    setActive(cwd: string, id: string | null) { this.activeProjectTabs = { ...this.activeProjectTabs, [cwd]: id }; this.notify(); }

    async refitAll() {
        const { invoke } = await import("@tauri-apps/api/core");
        for (const [, inst] of this.instances) {
            try {
                inst.fitAddon.fit();
                const cols = inst.term.cols;
                const rows = inst.term.rows;
                if (inst.ptyId > 0 && cols >= 20 && rows >= 4) {
                    await invoke("pty_resize", { id: inst.ptyId, rows, cols });
                }
            } catch {
                // ignore fit/resize failures during layout transitions
            }
        }
    }
}
const globalTerminalStore = new TerminalGlobalStore();

/** Unlisten stale PTY listeners after a webview reload (HMR). */
export function reapOrphanedTerminalSessions() {
    for (const [, inst] of globalTerminalStore.instances) {
        try {
            inst.unlistenOutput();
        } catch {
            // ignore
        }
    }
}



function TerminalInstance({ tab, isActive }: { tab: TerminalTab, isActive: boolean }) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTermType | null>(null);
    const fitAddonRef = useRef<FitAddonType | null>(null);

    const waitForVisibleSize = useCallback(async () => {
        for (let i = 0; i < 40; i++) {
            const node = terminalRef.current;
            if (!node) return false;
            const rect = node.getBoundingClientRect();
            if (isActive && rect.width >= 120 && rect.height >= 80) {
                return true;
            }
            await new Promise(res => setTimeout(res, 50));
        }
        return false;
    }, [isActive]);

    useEffect(() => {
        if (!terminalRef.current) return;
        let isMounted = true;
        let term: XTermType | undefined;
        let fitAddon: FitAddonType | undefined;
        let ptyId: number | undefined;
        let unlistenOutput: (() => void) | undefined;

        const init = async () => {
            if (!isMounted) return;
            const existing = globalTerminalStore.instances.get(tab.id);
            if (existing) {
                if (!isActive) return;
                term = existing.term;
                fitAddon = existing.fitAddon;
                ptyId = existing.ptyId;
                unlistenOutput = existing.unlistenOutput;
                if (terminalRef.current) {
                    if (term.element?.parentNode) term.element.parentNode.removeChild(term.element);
                    if (term.element) terminalRef.current.appendChild(term.element);
                    else term.open(terminalRef.current);

                    setTimeout(() => {
                        if (fitAddon) fitAddon.fit();
                        if (term) term.scrollToBottom();
                    }, 50);
                }
                xtermRef.current = term;
                fitAddonRef.current = fitAddon;
                return;
            }

            if (!isActive) return;
            const hasVisibleSize = await waitForVisibleSize();
            if (!isMounted || !hasVisibleSize || !terminalRef.current) return;

            const { Terminal: XTerm } = await import("@xterm/xterm");
            const { FitAddon } = await import("@xterm/addon-fit");
            const { WebglAddon } = await import("@xterm/addon-webgl");
            const { invoke } = await import("@tauri-apps/api/core");
            const { listen } = await import("@tauri-apps/api/event");
            if (!isMounted) return;

            const style = getComputedStyle(document.documentElement);
            const termSettings = getSettings().terminal;
            term = new XTerm({
                cursorBlink: true,
                fontFamily: termSettings.fontFamily || style.getPropertyValue('--font-mono').trim() || "monospace",
                fontSize: termSettings.fontSize,
                scrollback: termSettings.scrollback,
                convertEol: true,
                theme: { background: style.getPropertyValue('--panel').trim() || "#1e1e20" }
            });

            term.onSelectionChange(() => {
                if (getSettings().terminal.copyOnSelect && term?.hasSelection()) {
                    void navigator.clipboard.writeText(term.getSelection());
                }
            });

            // Enabling windowsMode specifically for ConPTY buffer handling
            // @ts-expect-error - internal property
            term._core.options.windowsMode = true;

            fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term.open(terminalRef.current!);
            try { term.loadAddon(new WebglAddon()); } catch { }

            fitAddon.fit();

            if (tab.shell === "ai" && tab.boundPtyId === undefined) {
                term.write(`Agent Terminal\r\n\r\n`);
                unlistenOutput = await listen<{ type: string; command?: string; data?: string; exitCode?: number }>("shape-terminal-ai-action", (e) => {
                    const pay = e.payload;
                    if (pay.type === "start") {
                        term?.write(`\r\n\x1b[38;2;120;120;120m$ ${pay.command}\x1b[0m\r\n`);
                    } else if (pay.type === "data" && pay.data) {
                        term?.write(pay.data);
                    } else if (pay.type === "finish") {
                        term?.write(`\r\n\x1b[38;2;120;120;120m[Process exited with code ${pay.exitCode}]\x1b[0m\r\n\r\n`);
                        term?.scrollToBottom();
                    }
                });

                globalTerminalStore.instances.set(tab.id, { term, fitAddon, ptyId: -1, unlistenOutput });
                xtermRef.current = term;
                fitAddonRef.current = fitAddon;
                if (isActive) {
                    term.focus();
                    term.scrollToBottom();
                }
                return;
            }

            try {
                ptyId = tab.boundPtyId ?? createPtyId();
                unlistenOutput = await listen<{ id: number; data: string }>("pty-output", (e) => {
                    if (e.payload.id === ptyId && term) {
                        term.write(e.payload.data);

                        // Detect development server URLs for the Preview panel
                        const devMatch = e.payload.data.match(/https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+/);
                        if (devMatch) {
                            setLastDevUrl(devMatch[0]);
                        }
                    }
                });
                const unlistenExit = await listen<{ id: number; exit_code: number | null }>("pty-exit", (e) => {
                    if (e.payload.id === ptyId && term) {
                        const code = e.payload.exit_code ?? 0;
                        term.write(`\r\n\x1b[38;2;120;120;120m[Process exited with code ${code}]\x1b[0m\r\n`);
                        term.scrollToBottom();
                    }
                });
                const originalUnlistenOutput = unlistenOutput;
                const combinedUnlisten = () => {
                    originalUnlistenOutput?.();
                    unlistenExit();
                };
                unlistenOutput = combinedUnlisten;

                if (tab.boundPtyId === undefined) {
                    const spawnedId = await invoke<number>("pty_spawn", {
                        cwd: tab.cwd !== "global" ? tab.cwd : null,
                        shell: tab.shell,
                        clientId: ptyId,
                        rows: Math.max(4, term.rows || 24),
                        cols: Math.max(20, term.cols || 80)
                    });
                    ptyId = spawnedId;
                } else {
                    // Agent-spawned sessions start at a fixed size; sync to the visible xterm.
                    try {
                        fitAddon.fit();
                        const cols = Math.max(20, term.cols || 80);
                        const rows = Math.max(4, term.rows || 24);
                        await invoke("pty_resize", { id: ptyId, rows, cols });
                    } catch { /* ignore */ }
                    if (tab.shell === "ai") {
                        term.write(`\r\n\x1b[38;2;120;120;120m$ Agent command (session ${ptyId})\x1b[0m\r\n`);
                    }
                }

                term.onData(data => { if (ptyId !== undefined) invoke("pty_write", { id: ptyId, data }).catch(() => { }); });
                term.onResize(size => {
                    if (ptyId !== undefined && size.cols >= 20 && size.rows >= 4) {
                        invoke("pty_resize", { id: ptyId, rows: size.rows, cols: size.cols }).catch(() => { });
                    }
                });

                const updateTheme = () => {
                    if (!term) return;
                    const comp = getComputedStyle(document.documentElement);
                    term.options.theme = {
                        background: comp.getPropertyValue('--panel').trim(),
                        foreground: comp.getPropertyValue('--foreground').trim(),
                        cursor: comp.getPropertyValue('--foreground').trim(),
                        selectionBackground: comp.getPropertyValue('--panel-active').trim() + "80",
                    };
                };
                updateTheme();
                const obs = new MutationObserver(updateTheme);
                obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
                (term as unknown as { _themeObserver?: MutationObserver })._themeObserver = obs;

                globalTerminalStore.instances.set(tab.id, { term, fitAddon, ptyId, unlistenOutput });
                xtermRef.current = term;
                fitAddonRef.current = fitAddon;
                if (isActive) {
                    term.focus();
                    term.scrollToBottom();
                }
            } catch (e) {
                unlistenOutput?.();
                if (term) term.write(`\r\n\x1b[31mError spawning terminal: ${e}\x1b[0m\r\n`);
                void import("@/features/notifications").then(({ notify }) => {
                    notify.error("Terminal", `Error spawning terminal: ${e}`, { code: 4400 });
                });
            }
        };

        init();
        const resObs = new ResizeObserver(() => {
            if (fitAddonRef.current && terminalRef.current) {
                requestAnimationFrame(() => {
                    try { fitAddonRef.current?.fit(); } catch { }
                });
            }
        });
        resObs.observe(terminalRef.current);

        return () => {
            isMounted = false;
            resObs.disconnect();
            if (term?.element?.parentNode) term.element.parentNode.removeChild(term.element);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab.shell, tab.cwd, tab.id, isActive, waitForVisibleSize]);

    useEffect(() => {
        const applyTerminalSettings = () => {
            const term = xtermRef.current;
            if (!term) return;
            const ts = getSettings().terminal;
            const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
            term.options.fontFamily = ts.fontFamily || mono || "monospace";
            term.options.fontSize = ts.fontSize;
            term.options.scrollback = ts.scrollback;
        };
        window.addEventListener("shape-settings-changed", applyTerminalSettings);
        return () => window.removeEventListener("shape-settings-changed", applyTerminalSettings);
    }, []);

    useEffect(() => {
        if (isActive && fitAddonRef.current && xtermRef.current) {
            const raf = requestAnimationFrame(() => {
                if (fitAddonRef.current && xtermRef.current) {
                    fitAddonRef.current.fit();
                    xtermRef.current.focus();
                    xtermRef.current.scrollToBottom();
                }
            });
            return () => cancelAnimationFrame(raf);
        }
    }, [isActive]);

    return <div className="h-full w-full overflow-hidden bg-panel p-3" ref={terminalRef} />;
}

export default function Terminal({
    onClose,
    isOpen,
    terminalOnly = false,
}: {
    onClose?: () => void;
    isOpen?: boolean;
    /** Hide Problems/Output/Tests/Preview chrome — terminal tabs only (agent rail). */
    terminalOnly?: boolean;
}) {
    const { project_path } = useProjectState();
    const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>(globalTerminalStore.tabs);
    const [projectActiveTabs, setProjectActiveTabs] = useState<Record<string, string | null>>(globalTerminalStore.activeProjectTabs);
    const safeCwd = project_path || "global";
    const currentTabs = terminalTabs.filter(t => t.cwd === safeCwd);
    const activeTerminalId = projectActiveTabs[safeCwd] || null;
    const [activeView, setActiveView] = useState<"terminal" | "problems" | "tests" | "output" | "preview">("terminal");
    const [availableShells, setAvailableShells] = useState<TerminalShellProfile[]>([]);
    const tabScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!project_path) return;
        globalTerminalStore.setTabs((tabs) => {
            let changed = false;
            const next = tabs.map((tab) => {
                if (tab.cwd === "global") {
                    changed = true;
                    return { ...tab, cwd: project_path };
                }
                return tab;
            });
            return changed ? next : tabs;
        });
        const legacyActive = globalTerminalStore.activeProjectTabs["global"];
        if (legacyActive) {
            globalTerminalStore.setActive(project_path, legacyActive);
            globalTerminalStore.setActive("global", null);
        }
    }, [project_path]);

    const ensurePanelOpen = useCallback(() => {
        window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
    }, []);

    useEffect(() => {
        const handleOpenProblems = () => {
            setActiveView("problems");
            window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
        };
        const handleOpenOutput = () => {
            setActiveView("output");
            window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
        };
        const handleOpenPreview = () => {
            setActiveView("preview");
            window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
        };
        window.addEventListener("shape-open-problems", handleOpenProblems);
        window.addEventListener("shape-open-output", handleOpenOutput);
        window.addEventListener("shape-open-preview", handleOpenPreview);
        return () => {
            window.removeEventListener("shape-open-problems", handleOpenProblems);
            window.removeEventListener("shape-open-output", handleOpenOutput);
            window.removeEventListener("shape-open-preview", handleOpenPreview);
        };
    }, []);

    useEffect(() => {
        const refit = () => {
            const run = () => { void globalTerminalStore.refitAll(); };
            requestAnimationFrame(run);
            window.setTimeout(run, 100);
            window.setTimeout(run, 300);
        };
        const onVisibility = () => {
            if (document.visibilityState === "visible") refit();
        };
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("focus", refit);
        let unlistenResize: (() => void) | undefined;
        if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
            void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
                void getCurrentWindow().onResized(() => refit()).then((fn) => {
                    unlistenResize = fn;
                });
            });
        }
        return () => {
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("focus", refit);
            unlistenResize?.();
        };
    }, []);

    useEffect(() => globalTerminalStore.subscribe(() => {
        setTerminalTabs([...globalTerminalStore.tabs]);
        setProjectActiveTabs({ ...globalTerminalStore.activeProjectTabs });
    }), []);

    const setActiveTerminalId = useCallback((id: string | null) => globalTerminalStore.setActive(safeCwd, id), [safeCwd]);
    const closingRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        commands.ptyAvailableShells()
            .then((shells) => {
                if (!cancelled) setAvailableShells(shells);
            })
            .catch(() => {
                if (!cancelled) setAvailableShells([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const resolveAvailableDefaultShell = useCallback((): TerminalShell => {
        const preferred = resolveDefaultTerminalShell();
        if (availableShells.some((shell) => shell.id === preferred)) {
            return preferred;
        }
        return availableShells[0]?.id ?? preferred;
    }, [availableShells]);

    useEffect(() => {
        const unlistenPromise = import("@tauri-apps/api/event").then(({ listen }) => {
            return listen<{ type: string; command?: string; data?: string; exitCode?: number; interactive?: boolean; sessionId?: number }>("shape-terminal-ai-action", (e) => {
                if (e.payload.type === "start") {
                    const interactive = e.payload.interactive && e.payload.sessionId != null;
                    globalTerminalStore.setTabs(tabs => {
                        if (interactive) {
                            const existing = tabs.find(
                                t => t.boundPtyId === e.payload.sessionId && t.cwd === safeCwd,
                            );
                            if (existing) {
                                setTimeout(() => setActiveTerminalId(existing.id), 0);
                                return tabs;
                            }
                            const id = createTabId();
                            setTimeout(() => setActiveTerminalId(id), 0);
                            const shell = resolveAvailableDefaultShell();
                            return [
                                ...tabs,
                                createTerminalTab(
                                    shell,
                                    "Agent Command",
                                    safeCwd,
                                    id,
                                    e.payload.sessionId,
                                ),
                            ];
                        }

                        const existing = tabs.find(t => t.shell === "ai" && t.cwd === safeCwd && t.boundPtyId === undefined);
                        if (existing) {
                            setTimeout(() => setActiveTerminalId(existing.id), 0);
                            return tabs;
                        }
                        const id = createTabId();
                        setTimeout(() => setActiveTerminalId(id), 0);
                        return [...tabs, createTerminalTab("ai", "Agent Action", safeCwd, id)];
                    });

                    // Fire layout event to make sure terminal split is open
                    window.dispatchEvent(new CustomEvent("shape-layout-toggle", {
                        detail: { id: "panel", value: true }
                    }));
                }
            });
        });
        return () => { unlistenPromise.then(u => u()).catch(() => { }); };
    }, [safeCwd, setActiveTerminalId, resolveAvailableDefaultShell]);

    const closeTab = useCallback((id: string) => {
        globalTerminalStore.setTabs(prev => {
            const next = prev.filter(t => t.id !== id);
            const projectTabs = next.filter(t => t.cwd === safeCwd);
            const inst = globalTerminalStore.instances.get(id);
            if (inst) {
                inst.unlistenOutput();
                if (inst.ptyId >= 0) {
                    import("@tauri-apps/api/core").then(({ invoke }) => invoke("pty_kill", { id: inst.ptyId }).catch(() => { }));
                }
                (inst.term as unknown as { _themeObserver?: MutationObserver })._themeObserver?.disconnect();
                inst.term.dispose();
                globalTerminalStore.instances.delete(id);
            }
            if (projectTabs.length === 0) {
                closingRef.current = true;
                setTimeout(() => setActiveTerminalId(null), 0);
                onClose?.();
                setTimeout(() => closingRef.current = false, 500);
            } else if (activeTerminalId === id || !projectTabs.some(t => t.id === activeTerminalId)) {
                setTimeout(() => setActiveTerminalId(projectTabs[projectTabs.length - 1].id), 0);
            }
            return next;
        });
    }, [activeTerminalId, onClose, safeCwd, setActiveTerminalId]);

    const addTab = useCallback((shell: TerminalShell) => {
        const id = createTabId();
        ensurePanelOpen();
        globalTerminalStore.setTabs(tabs => {
            const title = getNextTerminalName(tabs, shell, safeCwd);
            return [...tabs, createTerminalTab(shell, title, safeCwd, id)];
        });
        setActiveTerminalId(id);
        setActiveView("terminal");
    }, [safeCwd, setActiveTerminalId, ensurePanelOpen]);

    // Listen for titlebar menu terminal commands
    useEffect(() => {
        const handleTerminalShortcut = (e: Event) => {
            const custom = e as CustomEvent<{ action: string }>;
            if (!custom.detail) return;
            switch (custom.detail.action) {
                case "new":
                    addTab(resolveAvailableDefaultShell());
                    break;
                case "close_tab":
                    if (activeTerminalId) closeTab(activeTerminalId);
                    break;
                case "close_all_tabs":
                    currentTabs.forEach((tab) => closeTab(tab.id));
                    break;
                case "close":
                    onClose?.();
                    break;
                case "open": {
                    ensurePanelOpen();
                    setActiveView("terminal");
                    const existing = globalTerminalStore.tabs.filter(t => t.cwd === safeCwd);
                    if (existing.length === 0) {
                        addTab(resolveAvailableDefaultShell());
                    } else if (activeTerminalId) {
                        setActiveTerminalId(activeTerminalId);
                    } else {
                        setActiveTerminalId(existing[0].id);
                    }
                    break;
                }
            }
        };

        const handleTerminalRun = (e: Event) => {
            const custom = e as CustomEvent<{ command: string }>;
            if (!custom.detail?.command) return;
            const command = custom.detail.command;
            // Create a new terminal and write the command to it after it spawns
            const id = createTabId();
            ensurePanelOpen();
            globalTerminalStore.setTabs(tabs => {
                const title = `Run: ${command.split(' ').slice(0, 3).join(' ')}`;
                return [...tabs, createTerminalTab(resolveAvailableDefaultShell(), title, safeCwd, id)];
            });
            setActiveTerminalId(id);
            setActiveView("terminal");
            // Wait for the terminal to spawn, then write the command
            const waitAndWrite = () => {
                const inst = globalTerminalStore.instances.get(id);
                if (inst && inst.ptyId >= 0) {
                    import("@tauri-apps/api/core").then(({ invoke }) => {
                        invoke("pty_write", { id: inst.ptyId, data: command + "\r\n" }).catch(() => { });
                    });
                } else {
                    setTimeout(waitAndWrite, 200);
                }
            };
            setTimeout(waitAndWrite, 500);
        };

        window.addEventListener("shape-terminal-shortcut", handleTerminalShortcut as EventListener);
        window.addEventListener("shape-terminal-run", handleTerminalRun as EventListener);
        const handleTerminalView = (e: Event) => {
            const view = (e as CustomEvent<string>).detail;
            if (view === "output" || view === "problems" || view === "tests" || view === "terminal" || view === "preview") {
                setActiveView(view);
            }
        };
        window.addEventListener("shape-terminal-view", handleTerminalView as EventListener);
        return () => {
            window.removeEventListener("shape-terminal-shortcut", handleTerminalShortcut as EventListener);
            window.removeEventListener("shape-terminal-run", handleTerminalRun as EventListener);
            window.removeEventListener("shape-terminal-view", handleTerminalView as EventListener);
        };
    }, [addTab, closeTab, onClose, safeCwd, activeTerminalId, setActiveTerminalId, currentTabs, ensurePanelOpen, resolveAvailableDefaultShell]);

    useEffect(() => {
        if (!isOpen || activeView !== "terminal" || closingRef.current) return;

        const projectTabs = terminalTabs.filter(t => t.cwd === safeCwd);
        if (projectTabs.length === 0) {
            const shell = resolveAvailableDefaultShell();
            const id = createTabId();
            globalTerminalStore.setTabs(tabs => {
                if (tabs.filter(t => t.cwd === safeCwd).length !== 0) return tabs;
                const title = getNextTerminalName(tabs, shell, safeCwd);
                return [...tabs, createTerminalTab(shell, title, safeCwd, id)];
            });
            setActiveTerminalId(id);
            return;
        }

        if (!activeTerminalId || !projectTabs.some(t => t.id === activeTerminalId)) {
            setActiveTerminalId(projectTabs[projectTabs.length - 1].id);
        }
    }, [activeTerminalId, activeView, isOpen, safeCwd, terminalTabs, resolveAvailableDefaultShell, setActiveTerminalId]);

    useEffect(() => {
        const pt = terminalTabs.filter(t => t.cwd === safeCwd);
        if (pt.length > 0 && (!activeTerminalId || !pt.some(t => t.id === activeTerminalId))) {
            setTimeout(() => setActiveTerminalId(pt[pt.length - 1].id), 0);
        }
    }, [activeTerminalId, safeCwd, terminalTabs, setActiveTerminalId]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (tabScrollRef.current) {
            tabScrollRef.current.scrollLeft += e.deltaY;
        }
    }, []);

    const view = terminalOnly ? "terminal" : activeView;

    return (
        <div className="flex h-full flex-col overflow-hidden bg-panel select-none font-sans" data-terminal-root="true">
            {/* ── Row 1: view selectors (left) + X to hide (right) ── */}
            {!terminalOnly ? (
            <div className="relative z-20 flex shrink-0 items-center gap-1 px-2 pb-1.5 pt-2 min-w-0">
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                    {(["problems", "output", "tests", "preview", "terminal"] as const).map((viewId) => {
                        const labels: Record<string, string> = {
                            problems: "Problems",
                            output: "Output",
                            tests: "Tests",
                            preview: "Preview",
                            terminal: "Terminal",
                        };
                        return (
                            <Button
                                key={viewId}
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "h-7 px-2 text-sm",
                                    activeView === viewId
                                        ? "bg-surface-2 text-text-primary"
                                        : "text-text-muted hover:text-text-secondary"
                                )}
                                onClick={() => setActiveView(viewId)}
                            >
                                {labels[viewId]}
                            </Button>
                        );
                    })}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    {/* Hide panel (does NOT kill any terminal) */}
                    <Button onClick={() => onClose?.()} variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-md text-text-muted hover:text-text-primary">
                        <Icon name="close" size={14} />
                    </Button>
                </div>
            </div>
            ) : null}

            {/* ── Row 2: terminal tabs — only visible when terminal view is active ── */}
            {view === "terminal" && (
                <div className={cn(
                    "relative z-10 flex shrink-0 items-center gap-1 px-2 min-w-0",
                    terminalOnly ? "pt-2 pb-1.5" : "pb-1.5",
                )}>
                    <div
                        ref={tabScrollRef}
                        onWheel={handleWheel}
                        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar"
                    >
                        {currentTabs.map(tab => {
                            const isActive = activeTerminalId === tab.id;
                            return (
                                <div
                                    key={tab.id}
                                    onClick={() => setActiveTerminalId(tab.id)}
                                    className={cn(
                                        "group relative flex h-7 shrink-0 cursor-pointer select-none items-center gap-2 px-2 transition-colors duration-200 whitespace-nowrap",
                                        isActive
                                            ? "bg-surface-2 text-text-primary"
                                            : "text-text-muted hover:text-text-secondary"
                                    )}
                                >
                                    <span className="text-sm truncate max-w-[180px]">{tab.title}</span>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            closeTab(tab.id);
                                        }}
                                        className="p-1 rounded-md hover:bg-panel-active text-text-muted hover:text-text-primary transition-opacity shrink-0 opacity-0 group-hover:opacity-100"
                                    >
                                        <Icon name="close" size={12} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                        <Tooltip content="New Terminal">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 rounded-md text-text-muted hover:text-text-primary"
                                onClick={() => addTab(resolveAvailableDefaultShell())}
                            >
                                <Icon name="add" size={16} />
                            </Button>
                        </Tooltip>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-5 shrink-0 rounded-md text-text-muted hover:text-text-primary"
                                    title="Select Terminal"
                                >
                                    <Icon name="expand_more" size={16} />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                {availableShells.length === 0 ? (
                                    <DropdownMenuItem disabled>No terminals found</DropdownMenuItem>
                                ) : (
                                    availableShells.map((shell) => (
                                        <DropdownMenuItem key={shell.id} onClick={() => addTab(shell.id)}>
                                            New {shell.label}
                                        </DropdownMenuItem>
                                    ))
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => addTab("ai")}>New Agent Terminal</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            )}

            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                {view === "problems" ? (
                    <Problems />
                ) : view === "output" ? (
                    <OutputPanel />
                ) : view === "tests" ? (
                    <TestPanel />
                ) : view === "preview" ? (
                    <PreviewPanel />
                ) : null}
                <div className={cn(
                    "absolute inset-0 bg-transparent overflow-hidden",
                    view !== "terminal" && "invisible pointer-events-none"
                )}>
                    {currentTabs.map(tab => (
                        <div key={tab.id} className={cn("absolute inset-0 bg-transparent transition-opacity duration-150 overflow-hidden", tab.id === activeTerminalId ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none")}>
                            <TerminalInstance tab={tab} isActive={view === "terminal" && tab.id === activeTerminalId} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

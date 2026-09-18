"use client";

import { RiAddLine, RiArrowDownSLine, RiArrowUpSLine, RiCloseLine, RiDeleteBinLine, RiLayoutColumnLine } from "@remixicon/react";
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
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import TestPanel from "@/features/testing/ui/test-panel";
import { Button } from "@/components/ui/button";
import { getSettings, resolveDefaultTerminalShell } from "@/lib/settings";
import { setLastDevUrl } from "@/features/preview/store";
import { Input } from "@/components/ui/input";
import {
    WORKBENCH_TAB_ACTION_BUTTON_CLASS,
    WORKBENCH_TAB_BAR_CLASS,
    WORKBENCH_TAB_CLOSE_BUTTON_CLASS,
    workbenchTabItemClass,
} from "@/features/editor/ui/tabs/workbench-tab-styles";
import { terminalSessionStore, type TerminalTab as SessionTab } from "@/features/terminal/session";
type TerminalShell = SessionTab["shell"];
type TerminalGroupId = SessionTab["group"];
type TerminalTab = SessionTab;

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
    group: TerminalGroupId = "left",
): TerminalTab => ({ id, title, shell, cwd, boundPtyId, group });

function isLayoutResizing() {
    return document.body.classList.contains("resizing-vertical") || document.body.hasAttribute("data-resizing");
}

const lastPtySize = new Map<number, { cols: number; rows: number }>();

const globalTerminalStore = terminalSessionStore;

export async function refitAllTerminals() {
    if (isLayoutResizing()) return;
    const { invoke } = await import("@tauri-apps/api/core");
    for (const [, inst] of globalTerminalStore.instances) {
        try {
            inst.fitAddon.fit();
            const cols = inst.term.cols as number;
            const rows = inst.term.rows as number;
            if (inst.ptyId <= 0 || cols < 20 || rows < 4) continue;
            const prev = lastPtySize.get(inst.ptyId);
            if (prev && prev.cols === cols && prev.rows === rows) continue;
            lastPtySize.set(inst.ptyId, { cols, rows });
            await invoke("pty_resize", { id: inst.ptyId, rows, cols });
        } catch {
            // ignore fit/resize failures during layout transitions
        }
    }
}

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
        const node = terminalRef.current;
        if (!node) return false;
        for (let i = 0; i < 40; i++) {
            const rect = node.getBoundingClientRect();
            if (isActive && rect.width >= 120 && rect.height >= 80) return true;
            await new Promise((res) => setTimeout(res, 50));
        }
        // Don't give up forever — wait for a real resize if the panel was still settling.
        return await new Promise<boolean>((resolve) => {
            let done = false;
            const finish = (ok: boolean) => {
                if (done) return;
                done = true;
                ro.disconnect();
                resolve(ok);
            };
            const ro = new ResizeObserver(() => {
                const rect = node.getBoundingClientRect();
                if (isActive && rect.width >= 120 && rect.height >= 80) finish(true);
            });
            ro.observe(node);
            window.setTimeout(() => finish(false), 5000);
        });
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
                if (!term) return;
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
                fitAddonRef.current = fitAddon ?? null;
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
                        void import("@/features/preview/run-status").then(({ noteDevRunOutput }) => {
                            noteDevRunOutput(e.payload.data);
                        });
                    }
                });
                const unlistenExit = await listen<{ id: number; exit_code: number | null }>("pty-exit", (e) => {
                    if (e.payload.id === ptyId && term) {
                        const code = e.payload.exit_code ?? 0;
                        term.write(`\r\n\x1b[38;2;120;120;120m[Process exited with code ${code}]\x1b[0m\r\n`);
                        term.scrollToBottom();
                        void import("@/features/preview/run-status").then(({ noteDevRunExit }) => {
                            noteDevRunExit(code);
                        });
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
                    lastPtySize.set(ptyId, { cols: Math.max(20, term.cols || 80), rows: Math.max(4, term.rows || 24) });
                } else {
                    // Replay Rust-buffered output (source of truth while Terminal was closed),
                    // then any JS scrollback that arrived after the last Rust read.
                    try {
                        const snap = await invoke<{ output?: string }>("pty_read_output", {
                            id: ptyId,
                            tailChars: 200_000,
                        });
                        if (snap?.output) term.write(snap.output);
                    } catch { /* ignore */ }
                    try {
                        const { terminalSessionStore } = await import("@/features/terminal/session");
                        const buffered = terminalSessionStore.takePtyScrollback(ptyId);
                        if (buffered) term.write(buffered);
                    } catch { /* ignore */ }
                    // Agent-spawned sessions start at a fixed size; sync to the visible xterm.
                    try {
                        fitAddon.fit();
                        const cols = Math.max(20, term.cols || 80);
                        const rows = Math.max(4, term.rows || 24);
                        await invoke("pty_resize", { id: ptyId, rows, cols });
                        lastPtySize.set(ptyId, { cols, rows });
                    } catch { /* ignore */ }
                    if (tab.shell === "ai") {
                        term.write(`\r\n\x1b[38;2;120;120;120m$ Agent command (session ${ptyId})\x1b[0m\r\n`);
                    }
                }

                term.onData(data => { if (ptyId !== undefined) invoke("pty_write", { id: ptyId, data }).catch(() => { }); });
                term.onResize(size => {
                    // ConPTY reprints the viewport on pty_resize. Doing that while the
                    // pane is still being dragged wraps/duplicates the buffer.
                    if (isLayoutResizing()) return;
                    if (ptyId === undefined || size.cols < 20 || size.rows < 4) return;
                    const prev = lastPtySize.get(ptyId);
                    if (prev && prev.cols === size.cols && prev.rows === size.rows) return;
                    lastPtySize.set(ptyId, { cols: size.cols, rows: size.rows });
                    invoke("pty_resize", { id: ptyId, rows: size.rows, cols: size.cols }).catch(() => { });
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
        let fitTimer: ReturnType<typeof setTimeout> | undefined;
        const scheduleFit = (immediate = false) => {
            if (isLayoutResizing()) return;
            const run = () => {
                if (isLayoutResizing()) return;
                try {
                    fitAddonRef.current?.fit();
                } catch { /* ignore */ }
            };
            if (immediate) {
                run();
                return;
            }
            if (fitTimer) clearTimeout(fitTimer);
            fitTimer = setTimeout(run, 200);
        };
        const resObs = new ResizeObserver(() => {
            if (isLayoutResizing()) return;
            scheduleFit(false);
        });
        resObs.observe(terminalRef.current);
        const onRefit = () => scheduleFit(true);
        window.addEventListener("shape-terminal-refit", onRefit);

        return () => {
            isMounted = false;
            if (fitTimer) clearTimeout(fitTimer);
            resObs.disconnect();
            window.removeEventListener("shape-terminal-refit", onRefit);
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
                if (isLayoutResizing()) return;
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
    /** Hide Problems/Output/Tests chrome — terminal tabs only. */
    terminalOnly?: boolean;
}) {
    const { project_path } = useProjectState();
    const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>(globalTerminalStore.tabs);
    const [projectActiveTabs, setProjectActiveTabs] = useState<Record<string, string | null>>(globalTerminalStore.activeProjectTabs);
    const [secondaryActiveTabs, setSecondaryActiveTabs] = useState<Record<string, string | null>>(globalTerminalStore.activeSecondaryTabs);
    const [focusedGroups, setFocusedGroups] = useState<Record<string, TerminalGroupId>>(globalTerminalStore.focusedGroup);
    const [panelFilter, setPanelFilter] = useState("");
    const safeCwd = project_path || "global";
    const currentTabs = terminalTabs.filter(t => t.cwd === safeCwd);
    const leftTabs = currentTabs.filter((t) => (t.group ?? "left") === "left");
    const rightTabs = currentTabs.filter((t) => t.group === "right");
    const splitEnabled = rightTabs.length > 0;
    const activeTerminalId = projectActiveTabs[safeCwd] || null;
    const secondaryTerminalId = secondaryActiveTabs[safeCwd] || null;
    const focusedGroup = focusedGroups[safeCwd] || "left";
    const [activeView, setActiveView] = useState<"terminal" | "tests">("terminal");
    const [availableShells, setAvailableShells] = useState<TerminalShellProfile[]>([]);
    const tabScrollRef = useRef<HTMLDivElement>(null);
    const [splitRatio, setSplitRatio] = useState(0.5);
    const splitDragging = useRef(false);

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
        const handleOpenBrowser = () => {
            void import("@/lib/browser-tab").then(({ openBrowserTab }) => openBrowserTab());
        };
        window.addEventListener("shape-open-preview", handleOpenBrowser);
        return () => {
            window.removeEventListener("shape-open-preview", handleOpenBrowser);
        };
    }, []);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const refit = () => {
            if (isLayoutResizing()) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                if (!isLayoutResizing()) void refitAllTerminals();
            }, 200);
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
            if (timer) clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("focus", refit);
            unlistenResize?.();
        };
    }, []);

    useEffect(() => globalTerminalStore.subscribe(() => {
        setTerminalTabs([...globalTerminalStore.tabs]);
        setProjectActiveTabs({ ...globalTerminalStore.activeProjectTabs });
        setSecondaryActiveTabs({ ...globalTerminalStore.activeSecondaryTabs });
        setFocusedGroups({ ...globalTerminalStore.focusedGroup });
    }), []);

    const setActiveTerminalId = useCallback((id: string | null) => {
        globalTerminalStore.setActive(safeCwd, id);
        if (id) {
            const tab = globalTerminalStore.tabs.find((t) => t.id === id);
            if (tab?.group === "right") globalTerminalStore.setFocusedGroup(safeCwd, "right");
            else globalTerminalStore.setFocusedGroup(safeCwd, "left");
        }
    }, [safeCwd]);
    const setSecondaryTerminalId = useCallback(
        (id: string | null) => globalTerminalStore.setSecondaryActive(safeCwd, id),
        [safeCwd],
    );
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
            const closing = prev.find((t) => t.id === id);
            const next = prev.filter(t => t.id !== id);
            const projectTabs = next.filter(t => t.cwd === safeCwd);
            const left = projectTabs.filter((t) => (t.group ?? "left") === "left");
            const right = projectTabs.filter((t) => t.group === "right");
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
                setTimeout(() => {
                    setActiveTerminalId(null);
                    setSecondaryTerminalId(null);
                }, 0);
                onClose?.();
                setTimeout(() => closingRef.current = false, 500);
            } else {
                if (closing?.group === "right") {
                    if (right.length === 0) {
                        setTimeout(() => setSecondaryTerminalId(null), 0);
                    } else if (secondaryTerminalId === id) {
                        setTimeout(() => setSecondaryTerminalId(right[right.length - 1].id), 0);
                    }
                } else if (activeTerminalId === id || !left.some(t => t.id === activeTerminalId)) {
                    const fallback = left[left.length - 1] ?? projectTabs[projectTabs.length - 1];
                    setTimeout(() => setActiveTerminalId(fallback.id), 0);
                }
            }
            return next;
        });
        setTimeout(() => void refitAllTerminals(), 50);
    }, [activeTerminalId, secondaryTerminalId, onClose, safeCwd, setActiveTerminalId, setSecondaryTerminalId]);

    const addTab = useCallback((shell: TerminalShell, group: TerminalGroupId = "left") => {
        const id = createTabId();
        ensurePanelOpen();
        globalTerminalStore.setTabs(tabs => {
            const title = getNextTerminalName(tabs, shell, safeCwd);
            return [...tabs, createTerminalTab(shell, title, safeCwd, id, undefined, group)];
        });
        if (group === "right") {
            setSecondaryTerminalId(id);
            globalTerminalStore.setFocusedGroup(safeCwd, "right");
        } else {
            setActiveTerminalId(id);
            globalTerminalStore.setFocusedGroup(safeCwd, "left");
        }
        setActiveView("terminal");
        setTimeout(() => void refitAllTerminals(), 80);
    }, [safeCwd, setActiveTerminalId, setSecondaryTerminalId, ensurePanelOpen]);

    /** Split like the editor: open a new terminal in the right pane (reuse split if present). */
    const splitTerminal = useCallback((shell?: TerminalShell) => {
        const resolved = shell ?? resolveAvailableDefaultShell();
        ensurePanelOpen();
        setActiveView("terminal");
        addTab(resolved, "right");
    }, [addTab, ensurePanelOpen, resolveAvailableDefaultShell]);

    // Listen for titlebar menu terminal commands
    useEffect(() => {
        const handleTerminalShortcut = (e: Event) => {
            const custom = e as CustomEvent<{ action: string }>;
            if (!custom.detail) return;
            switch (custom.detail.action) {
                case "new":
                    addTab(resolveAvailableDefaultShell());
                    break;
                case "split":
                    splitTerminal();
                    break;
                case "close_tab":
                    if (focusedGroup === "right" && secondaryTerminalId) closeTab(secondaryTerminalId);
                    else if (activeTerminalId) closeTab(activeTerminalId);
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

        window.addEventListener("shape-terminal-shortcut", handleTerminalShortcut as EventListener);
        const handleTerminalView = (e: Event) => {
            const view = (e as CustomEvent<string>).detail;
            if (view === "tests" || view === "terminal") {
                setActiveView(view);
            }
        };
        window.addEventListener("shape-terminal-view", handleTerminalView as EventListener);
        return () => {
            window.removeEventListener("shape-terminal-shortcut", handleTerminalShortcut as EventListener);
            window.removeEventListener("shape-terminal-view", handleTerminalView as EventListener);
        };
    }, [addTab, closeTab, onClose, safeCwd, activeTerminalId, secondaryTerminalId, focusedGroup, setActiveTerminalId, currentTabs, ensurePanelOpen, resolveAvailableDefaultShell, splitTerminal]);

    useEffect(() => {
        if (!isOpen || activeView !== "terminal" || closingRef.current) return;

        const projectTabs = terminalTabs.filter(t => t.cwd === safeCwd);
        if (projectTabs.length === 0) {
            // Prefer a background Run tab registered under this cwd (or legacy "global").
            const bound = terminalTabs.find(
                (t) =>
                    typeof t.boundPtyId === "number" &&
                    (t.cwd === safeCwd || (safeCwd !== "global" && t.cwd === "global")),
            );
            if (bound) {
                if (bound.cwd !== safeCwd) {
                    globalTerminalStore.setTabs((tabs) =>
                        tabs.map((t) => (t.id === bound.id ? { ...t, cwd: safeCwd } : t)),
                    );
                }
                setActiveTerminalId(bound.id);
                return;
            }
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

        const left = projectTabs.filter((t) => (t.group ?? "left") === "left");
        const right = projectTabs.filter((t) => t.group === "right");
        if (!activeTerminalId || !left.some(t => t.id === activeTerminalId)) {
            if (left.length > 0) setActiveTerminalId(left[left.length - 1].id);
        }
        if (right.length > 0 && (!secondaryTerminalId || !right.some((t) => t.id === secondaryTerminalId))) {
            setSecondaryTerminalId(right[right.length - 1].id);
        }
    }, [activeTerminalId, secondaryTerminalId, activeView, isOpen, safeCwd, terminalTabs, resolveAvailableDefaultShell, setActiveTerminalId, setSecondaryTerminalId]);

    useEffect(() => {
        const pt = terminalTabs.filter(t => t.cwd === safeCwd && (t.group ?? "left") === "left");
        if (pt.length > 0 && (!activeTerminalId || !pt.some(t => t.id === activeTerminalId))) {
            setTimeout(() => setActiveTerminalId(pt[pt.length - 1].id), 0);
        }
    }, [activeTerminalId, safeCwd, terminalTabs, setActiveTerminalId]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (tabScrollRef.current) {
            tabScrollRef.current.scrollLeft += e.deltaY;
        }
    }, []);

    const clearActiveTerminal = useCallback(() => {
        const id = focusedGroup === "right" ? secondaryTerminalId : activeTerminalId;
        if (!id) return;
        const inst = globalTerminalStore.instances.get(id);
        if (inst) {
            try {
                inst.term.clear();
            } catch {
                /* ignore */
            }
        }
    }, [focusedGroup, activeTerminalId, secondaryTerminalId]);

    const view = terminalOnly ? "terminal" : activeView;

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!splitDragging.current) return;
            const root = document.getElementById("terminal-split-root");
            if (!root) return;
            const rect = root.getBoundingClientRect();
            const next = Math.min(0.75, Math.max(0.25, (e.clientX - rect.left) / rect.width));
            setSplitRatio(next);
        };
        const onUp = () => {
            if (!splitDragging.current) return;
            splitDragging.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.body.removeAttribute("data-resizing");
            void refitAllTerminals();
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, []);

    const shellMenu = (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(WORKBENCH_TAB_ACTION_BUTTON_CLASS, "h-7 w-7")}
                    title="Terminal profiles"
                >
                    <Icon icon={RiArrowDownSLine} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
                {availableShells.length === 0 ? (
                    <DropdownMenuItem disabled>No terminals found</DropdownMenuItem>
                ) : (
                    availableShells.map((shell) => (
                        <DropdownMenuItem key={shell.id} onClick={() => addTab(shell.id)}>
                            {shell.label}
                        </DropdownMenuItem>
                    ))
                )}
                <DropdownMenuItem onClick={() => addTab("ai")}>Agent Terminal</DropdownMenuItem>
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Split Terminal</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent >
                        {availableShells.map((shell) => (
                            <DropdownMenuItem key={`split-${shell.id}`} onClick={() => splitTerminal(shell.id)}>
                                {shell.label}
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem onClick={() => splitTerminal()}>Default Profile</DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() =>
                        window.dispatchEvent(new Event("shape-open-settings"))
                    }
                >
                    Configure Terminal Settings
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    const renderTerminalTabs = (
        tabs: TerminalTab[],
        activeId: string | null,
        onActivate: (id: string) => void,
        scrollRef?: React.RefObject<HTMLDivElement | null>,
    ) => (
        <div
            ref={scrollRef}
            onWheel={handleWheel}
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar"
        >
            {tabs.map((tab) => {
                const isActive = activeId === tab.id;
                return (
                    <div
                        key={tab.id}
                        onClick={() => onActivate(tab.id)}
                        className={workbenchTabItemClass(isActive)}
                    >
                        <span className="max-w-[160px] truncate text-sm">{tab.title}</span>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                closeTab(tab.id);
                            }}
                            className={WORKBENCH_TAB_CLOSE_BUTTON_CLASS}
                            aria-label={`Close ${tab.title}`}
                        >
                            <Icon icon={RiCloseLine} />
                        </button>
                    </div>
                );
            })}
        </div>
    );

    const renderGroupChrome = (
        tabs: TerminalTab[],
        activeId: string | null,
        group: TerminalGroupId,
        onActivate: (id: string) => void,
        showShellMenu: boolean,
    ) => (
        <div className={cn(WORKBENCH_TAB_BAR_CLASS, "border-b border-border-subtle bg-panel px-2")}>
            {renderTerminalTabs(
                tabs,
                activeId,
                onActivate,
                group === "left" ? tabScrollRef : undefined,
            )}
            <div className="flex shrink-0 items-center gap-0.5">
                <Tooltip content="New Terminal">
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(WORKBENCH_TAB_ACTION_BUTTON_CLASS, "h-7 w-7")}
                        onClick={() => addTab(resolveAvailableDefaultShell(), group)}
                    >
                        <Icon icon={RiAddLine} />
                    </Button>
                </Tooltip>
                {showShellMenu ? shellMenu : null}
                {terminalOnly && onClose && group === "left" ? (
                    <Tooltip content="Close terminal">
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(WORKBENCH_TAB_ACTION_BUTTON_CLASS, "h-7 w-7")}
                            onClick={() => onClose()}
                            aria-label="Close terminal"
                        >
                            <Icon icon={RiCloseLine} />
                        </Button>
                    </Tooltip>
                ) : null}
            </div>
        </div>
    );

    const renderTerminalPane = (
        tabs: TerminalTab[],
        activeId: string | null,
        group: TerminalGroupId,
        onActivate: (id: string) => void,
        showShellMenu: boolean,
    ) => (
        <div
            className={cn(
                "flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
                splitEnabled && focusedGroup === group && "ring-1 ring-inset ring-accent/20",
            )}
            onMouseDown={() => globalTerminalStore.setFocusedGroup(safeCwd, group)}
        >
            {renderGroupChrome(tabs, activeId, group, onActivate, showShellMenu)}
            <div className="relative min-h-0 flex-1 overflow-hidden">
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        className={cn(
                            "absolute inset-0 overflow-hidden bg-transparent",
                            tab.id === activeId ? "z-10" : "pointer-events-none z-0 invisible",
                        )}
                    >
                        <TerminalInstance
                            tab={tab}
                            isActive={view === "terminal" && tab.id === activeId}
                        />
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="flex h-full w-full flex-col overflow-hidden bg-panel select-none font-sans" data-terminal-root="true">
            {!terminalOnly ? (
                <div className="relative z-20 flex h-12 min-w-0 shrink-0 items-center gap-1 px-2">
                    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
                        {(["terminal", "tests"] as const).map((viewId) => {
                            const labels: Record<string, string> = {
                                tests: "Tests",
                                terminal: "Terminal",
                            };
                            const active = activeView === viewId;
                            return (
                                <Button
                                    key={viewId}
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    className={cn(
                                        "",
                                        active
                                            ? "bg-surface-3 text-text-primary"
                                            : "text-text-muted hover:bg-panel-hover hover:text-text-secondary",
                                    )}
                                    onClick={() => setActiveView(viewId)}
                                >
                                    {labels[viewId]}
                                </Button>
                            );
                        })}
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                        {activeView === "terminal" ? (
                            <>
                                <Tooltip content="Clear Terminal">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={cn(WORKBENCH_TAB_ACTION_BUTTON_CLASS, "h-7 w-7")}
                                        onClick={clearActiveTerminal}
                                    >
                                        <Icon icon={RiDeleteBinLine} />
                                    </Button>
                                </Tooltip>
                                <Tooltip content="Split Terminal">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={cn(WORKBENCH_TAB_ACTION_BUTTON_CLASS, "h-7 w-7")}
                                        onClick={() => splitTerminal()}
                                    >
                                        <Icon icon={RiLayoutColumnLine} />
                                    </Button>
                                </Tooltip>
                            </>
                        ) : null}
                        <Tooltip content="Hide Panel">
                            <Button
                                onClick={() => onClose?.()}
                                variant="ghost"
                                size="icon"
                                className={cn(WORKBENCH_TAB_ACTION_BUTTON_CLASS, "h-7 w-7")}
                            >
                                <Icon icon={RiArrowUpSLine} />
                            </Button>
                        </Tooltip>
                        <Button
                            onClick={() => onClose?.()}
                            variant="ghost"
                            size="icon"
                            className={cn(WORKBENCH_TAB_ACTION_BUTTON_CLASS, "h-7 w-7")}
                        >
                            <Icon icon={RiCloseLine} />
                        </Button>
                    </div>
                </div>
            ) : null}

            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                {view === "tests" ? (
                    <TestPanel />
                ) : null}
                <div
                    className={cn(
                        "absolute inset-0 overflow-hidden bg-transparent",
                        view !== "terminal" && "pointer-events-none invisible",
                    )}
                >
                    {splitEnabled ? (
                        <div id="terminal-split-root" className="flex h-full w-full min-w-0 overflow-hidden">
                            <div className="min-w-0 overflow-hidden" style={{ flex: splitRatio }}>
                                {renderTerminalPane(
                                    leftTabs,
                                    activeTerminalId,
                                    "left",
                                    (id) => {
                                        setActiveTerminalId(id);
                                        globalTerminalStore.setFocusedGroup(safeCwd, "left");
                                    },
                                    focusedGroup === "left",
                                )}
                            </div>
                            <div
                                className="w-1 shrink-0 cursor-col-resize bg-border-subtle/40 hover:bg-accent/40 transition-colors"
                                onMouseDown={() => {
                                    splitDragging.current = true;
                                    document.body.setAttribute("data-resizing", "true");
                                    document.body.style.cursor = "col-resize";
                                    document.body.style.userSelect = "none";
                                }}
                            />
                            <div className="min-w-0 overflow-hidden" style={{ flex: 1 - splitRatio }}>
                                {renderTerminalPane(
                                    rightTabs,
                                    secondaryTerminalId,
                                    "right",
                                    (id) => {
                                        setSecondaryTerminalId(id);
                                        globalTerminalStore.setFocusedGroup(safeCwd, "right");
                                    },
                                    focusedGroup === "right",
                                )}
                            </div>
                        </div>
                    ) : (
                        renderTerminalPane(
                            leftTabs.length ? leftTabs : currentTabs,
                            activeTerminalId,
                            "left",
                            setActiveTerminalId,
                            true,
                        )
                    )}
                </div>
            </div>
        </div>
    );
}

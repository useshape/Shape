"use client";

import { useSyncExternalStore } from "react";
import { normalizeColorTheme, type ColorThemeId } from "@/lib/themes";

export type WordWrapSetting = "off" | "on" | "bounded";
export type AutoSaveSetting = "off" | "afterDelay" | "onFocusChange";
export type LineNumbersSetting = "on" | "off" | "relative";
export type RenderWhitespaceSetting = "none" | "selection" | "all";
export type CursorStyleSetting = "line" | "block" | "underline";
export type DefaultShellSetting = "auto" | "powershell" | "cmd" | "git-bash";
export type UpdateChannel = "stable" | "pre";
export type ColorThemeSetting = ColorThemeId;
/** How agent terminal commands are approved: ask for everything, safe-list
 * auto-runs (default), or run everything except hard-blocked commands. */
export type AutoRunModeSetting = "ask" | "auto" | "always";

export interface McpServerConfig {
    id: string;
    name: string;
    transport: "stdio" | "http";
    command: string;
    args: string[];
    env: Record<string, string>;
    url?: string;
    auth: "none" | "oauth";
    enabled: boolean;
}

export interface ShapeSettings {
    editor: {
        fontFamily: string;
        fontSize: number;
        tabSize: number;
        insertSpaces: boolean;
        wordWrap: WordWrapSetting;
        minimap: boolean;
        lineNumbers: LineNumbersSetting;
        renderWhitespace: RenderWhitespaceSetting;
        bracketPairColorization: boolean;
        formatOnSave: boolean;
        autoSave: AutoSaveSetting;
        autoSaveDelay: number;
        trimTrailingWhitespace: boolean;
        insertFinalNewline: boolean;
        detectIndentation: boolean;
        fontLigatures: boolean;
        cursorStyle: CursorStyleSetting;
        cursorBlinking: string;
        smoothScrolling: boolean;
        scrollBeyondLastLine: boolean;
        renderLineHighlight: "none" | "gutter" | "line" | "all";
        showIndentGuides: boolean;
        showBracketGuides: boolean;
        imagePreview: boolean;
        compactTabs: boolean;
    };
    terminal: {
        defaultShell: DefaultShellSetting;
        fontFamily: string;
        fontSize: number;
        scrollback: number;
        copyOnSelect: boolean;
    };
    git: {
        autoFetch: boolean;
        autoFetchInterval: number;
        confirmBeforeCommit: boolean;
        /** Show GitHub author avatars on multi-lane git graph branches. */
        graphAvatars: boolean;
        /** When true, Git Graph uses `git log --all`. When false, only the current branch. */
        graphShowAllBranches: boolean;
        blame: {
            enabled: boolean;
        };
    };
    ai: {
        maxContextLines: number;
        autoApplyEdits: boolean;
        enabledModels: string[];
        defaultModel: string;
        /** @deprecated Folded into customRules on load. Kept for storage compat. */
        customSystemPrompt: string;
        customRules: string;
        mcpServers: McpServerConfig[];
        reviewAdversarialEnabled: boolean;
        /** Terminal command approval mode (Cursor-style run modes). */
        autoRunMode: AutoRunModeSetting;
        /** Stage agent file edits for approval before they touch disk. */
        requireEditApproval: boolean;
        /** Destructive git commands always ask, even in "run everything". */
        protectDestructiveGit: boolean;
        /** Semantic embeddings for codebase search (BM25 always on). */
        indexEmbeddings: boolean;
    };
    files: {
        exclude: string;
        defaultEol: "LF" | "CRLF";
    };
    eslint: {
        enable: boolean;
        fixOnSave: boolean;
    };
    prettier: {
        enable: boolean;
    };
    lsp: {
        typescript: boolean;
        css: boolean;
        html: boolean;
        json: boolean;
        tailwindcss: boolean;
        emmet: boolean;
    };
    node: {
        interpreterPath: string;
        packageManager: "auto" | "npm" | "yarn" | "pnpm" | "bun";
        codingAssistance: boolean;
    };
    python: {
        /** Absolute path, or `"auto"` to discover from PATH / venv. */
        interpreterPath: string;
    };
    designAutocomplete: {
        enable: boolean;
    };
    designDiagnostics: {
        enable: boolean;
        level: "AA" | "AAA";
    };
    tailwindControls: {
        enable: boolean;
        /** Alt+drag / hover-wheel scrubbing on numeric design tokens */
        numberScrubbing: boolean;
        /** Open flex/gap/padding panel when cursor rests on a token */
        cursorBindPanel: boolean;
        /** Dashed underline on scrubbable numbers */
        scrubDecorations: boolean;
        /** Wheel over padding/gap inputs changes values (Figma-style) */
        wheelOnInputs: boolean;
    };
    designBlame: {
        enable: boolean;
    };
    spacingRefactor: {
        enable: boolean;
    };
    developer: {
        enableDevTools: boolean;
    };
    privacy: {
        telemetryEnabled: boolean;
        showLoginPromptOnLaunch: boolean;
        /** Show the welcome page when the main window opens with no editor. */
        showWelcomeOnStartup: boolean;
        /** Open the Agent window on launch and keep the editor window hidden until needed. */
        startupWithAgentView: boolean;
    };
    notifications: {
        /** Master switch for OS/desktop notifications. On by default. */
        desktopEnabled: boolean;
        onGenerationComplete: boolean;
        onApprovalRequired: boolean;
    };
    workspace: {
        /** @deprecated Kept for settings merge compat; package suggestions were removed. */
        toolingInstall: "prompt" | "auto" | "off";
    };
    updates: {
        /** Poll for updates automatically. */
        autoUpdate: boolean;
        /** Stable = latest non-prerelease; pre = GitHub prereleases. */
        channel: UpdateChannel;
    };
    appearance: {
        /** Color theme. Dark is default (:root). All others use data-theme. */
        colorTheme: ColorThemeSetting;
    };
}

export const DEFAULT_SETTINGS: ShapeSettings = {
    editor: {
        fontFamily: "'IBM Plex Mono', 'Cascadia Code', Consolas, monospace",
        fontSize: 14,
        tabSize: 4,
        insertSpaces: true,
        wordWrap: "off",
        minimap: false,
        lineNumbers: "on",
        renderWhitespace: "selection",
        bracketPairColorization: true,
        formatOnSave: false,
        autoSave: "off",
        autoSaveDelay: 1000,
        trimTrailingWhitespace: false,
        insertFinalNewline: true,
        detectIndentation: true,
        fontLigatures: true,
        cursorStyle: "line",
        cursorBlinking: "blink",
        smoothScrolling: true,
        scrollBeyondLastLine: true,
        renderLineHighlight: "line",
        showIndentGuides: true,
        showBracketGuides: true,
        imagePreview: true,
        compactTabs: false,
    },
    terminal: {
        defaultShell: "auto",
        fontFamily: "'IBM Plex Mono', Consolas, monospace",
        fontSize: 13,
        scrollback: 5000,
        copyOnSelect: false,
    },
    git: {
        autoFetch: false,
        autoFetchInterval: 300,
        confirmBeforeCommit: false,
        graphAvatars: true,
        graphShowAllBranches: true,
        blame: {
            enabled: false,
        },
    },
    ai: {
        maxContextLines: 200,
        autoApplyEdits: false,
        enabledModels: [],
        defaultModel: "auto",
        customSystemPrompt: "",
        customRules: "",
        mcpServers: [],
        reviewAdversarialEnabled: true,
        autoRunMode: "auto",
        requireEditApproval: false,
        protectDestructiveGit: true,
        indexEmbeddings: true,
    },
    files: {
        exclude: "**/node_modules,**/.git,**/dist,**/build,**/.next",
        defaultEol: "LF",
    },
    eslint: {
        enable: true,
        fixOnSave: false,
    },
    prettier: {
        enable: true,
    },
    lsp: {
        typescript: true,
        css: true,
        html: true,
        json: true,
        tailwindcss: true,
        emmet: true,
    },
    node: {
        interpreterPath: "auto",
        packageManager: "auto",
        codingAssistance: true,
    },
    python: {
        interpreterPath: "auto",
    },
    designAutocomplete: {
        enable: true,
    },
    designDiagnostics: {
        enable: true,
        level: "AA",
    },
    tailwindControls: {
        enable: true,
        numberScrubbing: true,
        cursorBindPanel: true,
        scrubDecorations: true,
        wheelOnInputs: true,
    },
    designBlame: {
        enable: true,
    },
    spacingRefactor: {
        enable: true,
    },
    developer: {
        enableDevTools: false,
    },
    privacy: {
        telemetryEnabled: false,
        showLoginPromptOnLaunch: true,
        showWelcomeOnStartup: true,
        startupWithAgentView: false,
    },
    notifications: {
        desktopEnabled: true,
        onGenerationComplete: true,
        onApprovalRequired: true,
    },
    workspace: {
        toolingInstall: "off",
    },
    updates: {
        autoUpdate: true,
        channel: "stable",
    },
    appearance: {
        colorTheme: "dark",
    },
};

const STORAGE_KEY = "shape-settings-v1";

let currentSettings: ShapeSettings = {
    ...DEFAULT_SETTINGS,
    editor: { ...DEFAULT_SETTINGS.editor },
    terminal: { ...DEFAULT_SETTINGS.terminal },
    git: { ...DEFAULT_SETTINGS.git },
    ai: { ...DEFAULT_SETTINGS.ai },
    files: { ...DEFAULT_SETTINGS.files },
    eslint: { ...DEFAULT_SETTINGS.eslint },
    prettier: { ...DEFAULT_SETTINGS.prettier },
    lsp: { ...DEFAULT_SETTINGS.lsp },
    node: { ...DEFAULT_SETTINGS.node },
    python: { ...DEFAULT_SETTINGS.python },
    designAutocomplete: { ...DEFAULT_SETTINGS.designAutocomplete },
    designDiagnostics: { ...DEFAULT_SETTINGS.designDiagnostics },
    tailwindControls: { ...DEFAULT_SETTINGS.tailwindControls },
    designBlame: { ...DEFAULT_SETTINGS.designBlame },
    spacingRefactor: { ...DEFAULT_SETTINGS.spacingRefactor },
    developer: { ...DEFAULT_SETTINGS.developer },
    privacy: { ...DEFAULT_SETTINGS.privacy },
    notifications: { ...DEFAULT_SETTINGS.notifications },
    workspace: { ...DEFAULT_SETTINGS.workspace },
    updates: { ...DEFAULT_SETTINGS.updates },
    appearance: { ...DEFAULT_SETTINGS.appearance },
};
let hydrated = false;
let settingsBridgeInitialized = false;
const listeners = new Set<() => void>();

function mergeAiSettings(
    base: ShapeSettings["ai"] | undefined,
    patch: Partial<ShapeSettings["ai"]> | undefined,
): ShapeSettings["ai"] {
    const merged = { ...DEFAULT_SETTINGS.ai, ...base, ...patch };
    // Legacy "System Instructions" fold into Rules — one concept for user guidance.
    const legacy = merged.customSystemPrompt?.trim();
    if (legacy) {
        const rules = merged.customRules?.trim();
        merged.customRules = rules ? `${rules}\n\n${legacy}` : legacy;
        merged.customSystemPrompt = "";
    }
    return merged;
}

function mergeSettings(base: ShapeSettings, patch: Partial<ShapeSettings>): ShapeSettings {
    const aiPatch = patch.ai ? { ...patch.ai } : undefined;
    return {
        editor: { ...DEFAULT_SETTINGS.editor, ...base.editor, ...patch.editor },
        terminal: { ...DEFAULT_SETTINGS.terminal, ...base.terminal, ...patch.terminal },
        git: {
            ...DEFAULT_SETTINGS.git,
            ...base.git,
            ...patch.git,
            blame: {
                ...DEFAULT_SETTINGS.git.blame,
                ...(base.git?.blame ?? {}),
                ...(patch.git?.blame ?? {}),
            },
        },
        ai: mergeAiSettings(base.ai, aiPatch),
        files: { ...DEFAULT_SETTINGS.files, ...base.files, ...patch.files },
        eslint: { ...DEFAULT_SETTINGS.eslint, ...base.eslint, ...patch.eslint },
        prettier: { ...DEFAULT_SETTINGS.prettier, ...base.prettier, ...patch.prettier },
        lsp: { ...DEFAULT_SETTINGS.lsp, ...base.lsp, ...patch.lsp },
        node: { ...DEFAULT_SETTINGS.node, ...base.node, ...patch.node },
        python: { ...DEFAULT_SETTINGS.python, ...base.python, ...patch.python },
        designAutocomplete: { ...DEFAULT_SETTINGS.designAutocomplete, ...base.designAutocomplete, ...patch.designAutocomplete },
        designDiagnostics: { ...DEFAULT_SETTINGS.designDiagnostics, ...base.designDiagnostics, ...patch.designDiagnostics },
        tailwindControls: {
            ...DEFAULT_SETTINGS.tailwindControls,
            ...(base as ShapeSettings & { inlinePickers?: { enable: boolean } }).tailwindControls,
            ...(base as ShapeSettings & { inlinePickers?: { enable: boolean } }).inlinePickers,
            ...patch.tailwindControls,
            ...(patch as Partial<ShapeSettings & { inlinePickers?: { enable: boolean } }>).inlinePickers,
        },
        designBlame: {
            ...DEFAULT_SETTINGS.designBlame,
            ...base.designBlame,
            ...patch.designBlame,
        },
        spacingRefactor: {
            ...DEFAULT_SETTINGS.spacingRefactor,
            ...base.spacingRefactor,
            ...patch.spacingRefactor,
        },
        privacy: { ...DEFAULT_SETTINGS.privacy, ...base.privacy, ...patch.privacy },
        notifications: {
            ...DEFAULT_SETTINGS.notifications,
            ...base.notifications,
            ...patch.notifications,
        },
        developer: { ...DEFAULT_SETTINGS.developer, ...base.developer, ...patch.developer },
        workspace: { ...DEFAULT_SETTINGS.workspace, ...base.workspace, ...patch.workspace },
        updates: { ...DEFAULT_SETTINGS.updates, ...base.updates, ...patch.updates },
        appearance: {
            ...DEFAULT_SETTINGS.appearance,
            ...base.appearance,
            ...patch.appearance,
            colorTheme: normalizeColorTheme(
                patch.appearance?.colorTheme ??
                    base.appearance?.colorTheme ??
                    DEFAULT_SETTINGS.appearance.colorTheme,
            ),
        },
    };
}

export function resolveDefaultTerminalShell(): "powershell" | "cmd" | "gitbash" {
    const shell = getSettings().terminal.defaultShell;
    if (shell === "cmd") return "cmd";
    if (shell === "git-bash") return "gitbash";
    if (shell === "powershell") return "powershell";
    if (typeof navigator !== "undefined") {
        const platform = navigator.platform?.toLowerCase() ?? "";
        const userAgent = navigator.userAgent?.toLowerCase() ?? "";
        if (platform.includes("win") || userAgent.includes("windows")) {
            return "powershell";
        }
    }
    return "powershell";
}

export function isLspLanguageEnabled(language: string, settings: ShapeSettings = getSettings()): boolean {
    switch (language) {
        case "typescript":
            return settings.lsp.typescript;
        case "css":
            return settings.lsp.css;
        case "html":
            return settings.lsp.html;
        case "json":
            return settings.lsp.json;
        case "tailwindcss":
            return settings.lsp.tailwindcss;
        default:
            return true;
    }
}

export function getFileExcludePatterns(): string {
    return getSettings().files.exclude;
}

function applySettingsFromPayload(next: Partial<ShapeSettings> | ShapeSettings) {
    currentSettings = mergeSettings(DEFAULT_SETTINGS, next);
    hydrated = true;
    applyAppearanceSettings(currentSettings);
}

function emitLocal() {
    listeners.forEach((l) => l());
    if (typeof window !== "undefined") {
        void import("@/lib/editor/monaco-registry").then(({ applyMonacoSettingsToAllEditors }) => {
            applyMonacoSettingsToAllEditors();
        }).catch(() => { /* registry unavailable during SSR */ });
        window.dispatchEvent(new CustomEvent("shape-settings-changed", { detail: currentSettings }));
    }
}

function emit() {
    emitLocal();
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        void import("@tauri-apps/api/event").then(({ emit: tauriEmit }) => {
            void tauriEmit("shape-settings-changed", currentSettings).catch(() => { /* ignore */ });
        }).catch(() => { /* ignore */ });
    }
}

/** Sync settings across Tauri windows (settings window -> main editor window). */
export function initSettingsBridge(): void {
    if (settingsBridgeInitialized || typeof window === "undefined") return;
    settingsBridgeInitialized = true;

    window.addEventListener("storage", (event) => {
        if (event.key !== STORAGE_KEY || !event.newValue) return;
        try {
            applySettingsFromPayload(JSON.parse(event.newValue) as Partial<ShapeSettings>);
            emitLocal();
        } catch {
            /* ignore malformed storage payload */
        }
    });

    if ("__TAURI_INTERNALS__" in window) {
        void import("@tauri-apps/api/event").then(({ listen }) => {
            void listen<ShapeSettings>("shape-settings-changed", (event) => {
                applySettingsFromPayload(event.payload);
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
                } catch { /* ignore */ }
                emitLocal();
            });
        }).catch(() => { /* ignore */ });
    }
}

function loadFromLocalStorage() {
    if (typeof window === "undefined") return;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<ShapeSettings>;
            currentSettings = mergeSettings(DEFAULT_SETTINGS, parsed);
        }
    } catch {
        currentSettings = { ...DEFAULT_SETTINGS, editor: { ...DEFAULT_SETTINGS.editor }, terminal: { ...DEFAULT_SETTINGS.terminal }, git: { ...DEFAULT_SETTINGS.git }, ai: { ...DEFAULT_SETTINGS.ai }, files: { ...DEFAULT_SETTINGS.files }, eslint: { ...DEFAULT_SETTINGS.eslint }, prettier: { ...DEFAULT_SETTINGS.prettier }, lsp: { ...DEFAULT_SETTINGS.lsp }, node: { ...DEFAULT_SETTINGS.node }, python: { ...DEFAULT_SETTINGS.python } };
    }
}

function persist() {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
    } catch { /* ignore */ }
}

export async function initSettings(): Promise<void> {
    initSettingsBridge();
    if (hydrated) return;
    loadFromLocalStorage();
    try {
        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("settings.json", { autoSave: true, defaults: {} });
        const stored = await store.get<Partial<ShapeSettings>>("settings");
        if (stored) {
            currentSettings = mergeSettings(DEFAULT_SETTINGS, stored);
            persist();
        } else {
            await store.set("settings", currentSettings);
            await store.save();
        }
    } catch {
        // Browser dev or store unavailable — localStorage is enough
    }
    hydrated = true;
    applyAppearanceSettings(currentSettings);
    emit();
    // Keep the Rust indexer embeddings flag in sync with persisted settings.
    void import("@/lib/backend").then(({ commands }) =>
        commands.setIndexEmbeddings(currentSettings.ai.indexEmbeddings).catch(() => {
            /* desktop bridge may not be ready yet */
        }),
    );
}

export function getSettings(): ShapeSettings {
    if (!hydrated && typeof window !== "undefined") {
        loadFromLocalStorage();
        hydrated = true;
        applyAppearanceSettings(currentSettings);
    }
    return currentSettings;
}

export function updateSettings(patch: Partial<ShapeSettings>): void {
    currentSettings = mergeSettings(currentSettings, patch);
    persist();
    applyAppearanceSettings(currentSettings);
    void (async () => {
        try {
            const { load } = await import("@tauri-apps/plugin-store");
            const store = await load("settings.json", { autoSave: true, defaults: {} });
            await store.set("settings", currentSettings);
            await store.save();
        } catch { /* ignore */ }
    })();
    emit();
}

export function updateSettingSection<K extends keyof ShapeSettings>(
    section: K,
    patch: Partial<ShapeSettings[K]>
): void {
    updateSettings({ [section]: { ...currentSettings[section], ...patch } } as Partial<ShapeSettings>);
}

export function useSettings(): ShapeSettings {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => getSettings(),
        () => DEFAULT_SETTINGS
    );
}

export function subscribeSettings(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function applyAppearanceSettings(settings: ShapeSettings) {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--editor-font-family", settings.editor.fontFamily);
    document.documentElement.style.setProperty("--editor-font-size", `${settings.editor.fontSize}px`);
    document.documentElement.style.setProperty("--font-mono", settings.editor.fontFamily);

    const theme = normalizeColorTheme(settings.appearance?.colorTheme);
    if (theme === "dark") {
        delete document.documentElement.dataset.theme;
    } else {
        document.documentElement.dataset.theme = theme;
    }

    // Re-apply Monaco colors from CSS vars after theme tokens settle.
    if (typeof window !== "undefined") {
        requestAnimationFrame(() => {
            void import("@/lib/ui/monaco-theme").then(({ refreshShapeMonacoTheme }) => {
                refreshShapeMonacoTheme();
            }).catch(() => { /* monaco not loaded */ });
        });
    }
}

export function getMonacoOptionsFromSettings(settings: ShapeSettings = getSettings()) {
    return {
        fontFamily: settings.editor.fontFamily,
        fontSize: settings.editor.fontSize,
        tabSize: settings.editor.tabSize,
        insertSpaces: settings.editor.insertSpaces,
        wordWrap: settings.editor.wordWrap as "off" | "on" | "wordWrapColumn" | "bounded",
        minimap: { enabled: settings.editor.minimap },
        lineNumbers: settings.editor.lineNumbers as "on" | "off" | "relative" | "interval" | (number & {}),
        renderWhitespace: settings.editor.renderWhitespace as "none" | "boundary" | "selection" | "trailing" | "all",
        bracketPairColorization: { enabled: settings.editor.bracketPairColorization },
        fontLigatures: settings.editor.fontLigatures,
        cursorStyle: settings.editor.cursorStyle as "line" | "block" | "underline" | "line-thin" | "block-outline" | "underline-thin",
        cursorBlinking: settings.editor.cursorBlinking as "blink" | "smooth" | "phase" | "expand" | "solid",
        detectIndentation: settings.editor.detectIndentation,
        smoothScrolling: settings.editor.smoothScrolling,
        scrollBeyondLastLine: settings.editor.scrollBeyondLastLine,
        renderLineHighlight: settings.editor.renderLineHighlight,
        guides: {
            indentation: settings.editor.showIndentGuides,
            highlightActiveIndentation: settings.editor.showIndentGuides,
            bracketPairs: settings.editor.showBracketGuides,
            bracketPairsHorizontal: settings.editor.showBracketGuides,
        },
    };
}

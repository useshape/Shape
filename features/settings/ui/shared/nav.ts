import type { SolarIconName } from "@/components/ui/icon";

export type SettingsNavLeaf = {
    id: string;
    label: string;
    icon: SolarIconName;
    /** DOM id of the scroll target in the main settings page */
    targetId?: string;
    /** Navigate to a separate settings sub-page instead of scrolling */
    href?: string;
};

export type SettingsNavGroup = {
    id: string;
    label: string;
    children: SettingsNavLeaf[];
};

/**
 * VS Code-style tree: group headers are categories; leaves are sections.
 * Never reuse a group label as a leaf label (e.g. Account > Account).
 */
export const SETTINGS_NAV: SettingsNavGroup[] = [
    {
        id: "account",
        label: "You",
        children: [{ id: "account-profile", label: "Profile", icon: "user", targetId: "settings-account" }],
    },
    {
        id: "agents",
        label: "Agents",
        children: [
            { id: "ai-models", label: "Models", icon: "magic-stick", targetId: "settings-ai-models" },
            { id: "ai-rules", label: "Instructions", icon: "file-text", targetId: "settings-ai-rules" },
            { id: "ai-workflows", label: "Workflows", icon: "routing", targetId: "settings-ai-workflows" },
            { id: "ai-context", label: "Context", icon: "layers", targetId: "settings-ai-context" },
            { id: "plugins", label: "Plugins", icon: "widget", targetId: "settings-ai-plugins" },
        ],
    },
    {
        id: "editor",
        label: "Editor",
        children: [
            { id: "editor-font", label: "Editor", icon: "code", targetId: "settings-editor-font" },
            { id: "appearance", label: "Appearance", icon: "palette", targetId: "settings-appearance" },
        ],
    },
    {
        id: "features",
        label: "Features",
        children: [
            { id: "terminal", label: "Terminal", icon: "programming", targetId: "settings-terminal" },
            { id: "microphone", label: "Microphone", icon: "microphone", targetId: "settings-microphone" },
            { id: "git", label: "Git", icon: "git-commit", targetId: "settings-git" },
        ],
    },
    {
        id: "application",
        label: "Application",
        children: [
            { id: "keyboard-shortcuts", label: "Keyboard Shortcuts", icon: "keyboard", targetId: "settings-keyboard-shortcuts" },
            { id: "updates", label: "Updates", icon: "download-minimalistic", targetId: "settings-updates" },
            { id: "notifications", label: "Notifications", icon: "bell", targetId: "settings-notifications" },
            { id: "privacy", label: "Data Control", icon: "shield", targetId: "settings-privacy" },
            { id: "developer", label: "Developer", icon: "bug", targetId: "settings-developer" },
        ],
    },
];


export function allSettingsLeaves(): SettingsNavLeaf[] {
    return SETTINGS_NAV.flatMap((g) => g.children);
}

export const SETTINGS_PAGE_LEAF_IDS = new Set(["keyboard-shortcuts", "plugins"]);

export function findLeafByTarget(targetId: string): SettingsNavLeaf | undefined {
    return allSettingsLeaves().find((l) => l.targetId === targetId);
}

/** Flat category list for command palette deep-links (settings UI uses SETTINGS_NAV). */
export type SettingsCategoryId =
    | "account"
    | "agents"
    | "editor"
    | "terminal"
    | "git"
    | "application";

export type SettingsCategory = {
    id: SettingsCategoryId;
    label: string;
    icon: SolarIconName;
    keywords?: string[];
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
    {
        id: "account",
        label: "Account",
        icon: "user",
        keywords: ["profile", "billing", "plan", "login"],
    },
    {
        id: "agents",
        label: "Agents",
        icon: "magic-stick",
        keywords: ["ai", "models", "mcp", "plugins", "slack", "rules", "context", "workflows", "commands"],
    },
    {
        id: "editor",
        label: "Editor",
        icon: "code",
        keywords: ["font", "indent", "caret", "save", "files", "design"],
    },
    {
        id: "terminal",
        label: "Terminal",
        icon: "programming",
        keywords: ["shell", "scrollback"],
    },
    {
        id: "git",
        label: "Git",
        icon: "git-commit",
        keywords: ["source", "control", "scm"],
    },
    {
        id: "application",
        label: "Application",
        icon: "settings",
        keywords: ["updates", "notifications", "privacy", "telemetry", "developer", "reset", "keyboard", "shortcuts", "keybindings"],
    },
];

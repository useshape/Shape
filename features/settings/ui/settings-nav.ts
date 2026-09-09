import type { RemixiconComponentType } from "@remixicon/react";
import {
    RiBugLine,
    RiCodeLine,
    RiDownloadLine,
    RiFileTextLine,
    RiGitCommitLine,
    RiKeyboardLine,
    RiNotification3Line,
    RiPaletteLine,
    RiApps2Line,
    RiPlugLine,
    RiSettings3Line,
    RiShieldLine,
    RiSparkling2Line,
    RiStackLine,
    RiTerminalBoxLine,
    RiUserLine,
} from "@remixicon/react";

export type SettingsNavLeaf = {
    id: string;
    label: string;
    icon: RemixiconComponentType;
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
        label: "Account",
        children: [{ id: "account-profile", label: "Profile", icon: RiUserLine, targetId: "settings-account" }],
    },
    {
        id: "agents",
        label: "Agents",
        children: [
            { id: "ai-models", label: "Models", icon: RiSparkling2Line, targetId: "settings-ai-models" },
            { id: "ai-rules", label: "Rules", icon: RiFileTextLine, targetId: "settings-ai-rules" },
            { id: "ai-context", label: "Context", icon: RiStackLine, targetId: "settings-ai-context" },
            { id: "plugins", label: "Plugins", icon: RiApps2Line, targetId: "settings-ai-plugins" },
            { id: "mcp", label: "MCP", icon: RiPlugLine, targetId: "settings-ai-mcp" },
        ],
    },
    {
        id: "editor",
        label: "Editor",
        children: [
            { id: "editor-font", label: "Editor", icon: RiCodeLine, targetId: "settings-editor-font" },
            { id: "appearance", label: "Appearance", icon: RiPaletteLine, targetId: "settings-appearance" },
        ],
    },
    {
        id: "features",
        label: "Features",
        children: [
            { id: "terminal", label: "Terminal", icon: RiTerminalBoxLine, targetId: "settings-terminal" },
            { id: "git", label: "Git", icon: RiGitCommitLine, targetId: "settings-git" },
        ],
    },
    {
        id: "application",
        label: "Application",
        children: [
            { id: "keyboard-shortcuts", label: "Keyboard Shortcuts", icon: RiKeyboardLine, targetId: "settings-keyboard-shortcuts" },
            { id: "updates", label: "Updates", icon: RiDownloadLine, targetId: "settings-updates" },
            { id: "notifications", label: "Notifications", icon: RiNotification3Line, targetId: "settings-notifications" },
            { id: "privacy", label: "Privacy", icon: RiShieldLine, targetId: "settings-privacy" },
            { id: "developer", label: "Developer", icon: RiBugLine, targetId: "settings-developer" },
        ],
    },
];


export function allSettingsLeaves(): SettingsNavLeaf[] {
    return SETTINGS_NAV.flatMap((g) => g.children);
}

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
    icon: RemixiconComponentType;
    keywords?: string[];
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
    {
        id: "account",
        label: "Account",
        icon: RiUserLine,
        keywords: ["profile", "billing", "plan", "login"],
    },
    {
        id: "agents",
        label: "Agents",
        icon: RiSparkling2Line,
        keywords: ["ai", "models", "mcp", "plugins", "slack", "rules", "context"],
    },
    {
        id: "editor",
        label: "Editor",
        icon: RiCodeLine,
        keywords: ["font", "indent", "caret", "save", "files", "design"],
    },
    {
        id: "terminal",
        label: "Terminal",
        icon: RiTerminalBoxLine,
        keywords: ["shell", "scrollback"],
    },
    {
        id: "git",
        label: "Git",
        icon: RiGitCommitLine,
        keywords: ["source", "control", "scm"],
    },
    {
        id: "application",
        label: "Application",
        icon: RiSettings3Line,
        keywords: ["updates", "notifications", "privacy", "telemetry", "developer", "reset", "keyboard", "shortcuts", "keybindings"],
    },
];

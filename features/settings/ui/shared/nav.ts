"use client";

import { settingsIcons, type SettingsGlyph } from "../fluent-icons";

export type SettingsNavLeaf = {
    id: string;
    label: string;
    icon: SettingsGlyph;
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
        children: [{ id: "account-profile", label: "Profile", icon: settingsIcons.person, targetId: "settings-account" }],
    },
    {
        id: "agents",
        label: "Agents",
        children: [
            { id: "ai-models", label: "Models", icon: settingsIcons.sparkle, targetId: "settings-ai-models" },
            { id: "ai-rules", label: "Instructions", icon: settingsIcons.document, targetId: "settings-ai-rules" },
            { id: "ai-workflows", label: "Workflows", icon: settingsIcons.flowchart, targetId: "settings-ai-workflows" },
            { id: "ai-skills", label: "Skills", icon: settingsIcons.document, targetId: "settings-skills" },
            { id: "ai-context", label: "Context", icon: settingsIcons.layer, targetId: "settings-ai-context" },
            { id: "plugins", label: "Plugins", icon: settingsIcons.apps, targetId: "settings-ai-plugins" },
        ],
    },
    {
        id: "editor",
        label: "Editor",
        children: [
            { id: "editor-font", label: "Editor", icon: settingsIcons.code, targetId: "settings-editor-font" },
            { id: "appearance", label: "Appearance", icon: settingsIcons.color, targetId: "settings-appearance" },
        ],
    },
    {
        id: "features",
        label: "Features",
        children: [
            { id: "terminal", label: "Terminal", icon: settingsIcons.terminal, targetId: "settings-terminal" },
            { id: "microphone", label: "Microphone", icon: settingsIcons.mic, targetId: "settings-microphone" },
            { id: "git", label: "Git", icon: settingsIcons.branch, targetId: "settings-git" },
        ],
    },
    {
        id: "application",
        label: "Application",
        children: [
            { id: "keyboard-shortcuts", label: "Keyboard Shortcuts", icon: settingsIcons.keyboard, targetId: "settings-keyboard-shortcuts" },
            { id: "updates", label: "Updates", icon: settingsIcons.download, targetId: "settings-updates" },
            { id: "notifications", label: "Notifications", icon: settingsIcons.alert, targetId: "settings-notifications" },
            { id: "privacy", label: "Data Control", icon: settingsIcons.shield, targetId: "settings-privacy" },
            { id: "developer", label: "Developer", icon: settingsIcons.bug, targetId: "settings-developer" },
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
    icon: SettingsGlyph;
    keywords?: string[];
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
    {
        id: "account",
        label: "Account",
        icon: settingsIcons.person,
        keywords: ["profile", "billing", "plan", "login"],
    },
    {
        id: "agents",
        label: "Agents",
        icon: settingsIcons.sparkle,
        keywords: ["ai", "models", "mcp", "plugins", "slack", "rules", "context", "workflows", "commands"],
    },
    {
        id: "editor",
        label: "Editor",
        icon: settingsIcons.code,
        keywords: ["font", "indent", "caret", "save", "files", "design"],
    },
    {
        id: "terminal",
        label: "Terminal",
        icon: settingsIcons.terminal,
        keywords: ["shell", "scrollback"],
    },
    {
        id: "git",
        label: "Git",
        icon: settingsIcons.branch,
        keywords: ["source", "control", "scm"],
    },
    {
        id: "application",
        label: "Application",
        icon: settingsIcons.settings,
        keywords: ["updates", "notifications", "privacy", "telemetry", "developer", "reset", "keyboard", "shortcuts", "keybindings"],
    },
];

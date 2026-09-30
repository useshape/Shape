"use client";

import { Alert20Regular } from "@fluentui/react-icons/headless/svg/alert";
import { AppsAddIn24Regular } from "@fluentui/react-icons/headless/svg/apps-add-in";
import { ArrowDownload20Regular } from "@fluentui/react-icons/headless/svg/arrow-download";
import { BranchFork20Regular } from "@fluentui/react-icons/headless/svg/branch-fork";
import { Bug20Regular } from "@fluentui/react-icons/headless/svg/bug";
import { Code20Regular } from "@fluentui/react-icons/headless/svg/code";
import { AgentsPerson24Regular } from "@fluentui/react-icons/headless/svg/agents-person";
import { DocumentData24Regular } from "@fluentui/react-icons/headless/svg/document-data";
import { DocumentEdit24Regular } from "@fluentui/react-icons/headless/svg/document-edit";
import { Keyboard20Regular } from "@fluentui/react-icons/headless/svg/keyboard";
import { ChatCursor24Regular } from "@fluentui/react-icons/headless/svg/chat-cursor";
import { MicrophoneChat24Regular } from "@fluentui/react-icons/headless/svg/microphone-chat";
import { BranchCompare24Regular } from "@fluentui/react-icons/headless/svg/branch-compare";
import { Settings24Regular } from "@fluentui/react-icons/headless/svg/settings";
import { Settings20Regular } from "@fluentui/react-icons/headless/svg/settings";
import { ArrowClockwiseDashesSettings24Regular } from "@fluentui/react-icons/headless/svg/arrow-clockwise-dashes-settings";
import { Shield20Regular } from "@fluentui/react-icons/headless/svg/shield";
import { Sparkle24Regular } from "@fluentui/react-icons/headless/svg/sparkle";
import { CodeText16Regular } from "@fluentui/react-icons/headless/svg/code-text";
import { LayoutRowTwoFocusTopSettings32Filled } from "@fluentui/react-icons/headless/svg/layout-row-two-focus-top-settings";
import { WindowConsole20Regular } from "@fluentui/react-icons/headless/svg/window-console";
import type { IconGlyph } from "@/components/ui/icon";

export type SettingsNavLeaf = {
    id: string;
    label: string;
    icon: IconGlyph;
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
        children: [{ id: "account-profile", label: "Profile", icon: Settings24Regular, targetId: "settings-account" }],
    },
    {
        id: "agents",
        label: "Agents",
        children: [
            { id: "ai-models", label: "Models", icon: AgentsPerson24Regular, targetId: "settings-ai-models" },
            { id: "ai-rules", label: "Instructions", icon: DocumentEdit24Regular, targetId: "settings-ai-rules" },
            { id: "ai-workflows", label: "Workflows", icon: ArrowClockwiseDashesSettings24Regular, targetId: "settings-ai-workflows" },
            { id: "ai-skills", label: "Skills", icon: DocumentData24Regular, targetId: "settings-skills" },
            { id: "ai-context", label: "Context", icon: ChatCursor24Regular, targetId: "settings-ai-context" },
            { id: "plugins", label: "Plugins", icon: AppsAddIn24Regular, targetId: "settings-ai-plugins" },
        ],
    },
    {
        id: "editor",
        label: "Editor",
        children: [
            { id: "editor-font", label: "Editor", icon: CodeText16Regular, targetId: "settings-editor-font" },
            { id: "appearance", label: "Appearance", icon: LayoutRowTwoFocusTopSettings32Filled, targetId: "settings-appearance" },
        ],
    },
    {
        id: "features",
        label: "Features",
        children: [
            { id: "terminal", label: "Terminal", icon: WindowConsole20Regular, targetId: "settings-terminal" },
            { id: "microphone", label: "Microphone", icon: MicrophoneChat24Regular, targetId: "settings-microphone" },
            { id: "git", label: "Git", icon: BranchCompare24Regular, targetId: "settings-git" },
        ],
    },
    {
        id: "application",
        label: "Application",
        children: [
            { id: "keyboard-shortcuts", label: "Keyboard Shortcuts", icon: Keyboard20Regular, targetId: "settings-keyboard-shortcuts" },
            { id: "updates", label: "Updates", icon: ArrowDownload20Regular, targetId: "settings-updates" },
            { id: "notifications", label: "Notifications", icon: Alert20Regular, targetId: "settings-notifications" },
            { id: "privacy", label: "Data Control", icon: Shield20Regular, targetId: "settings-privacy" },
            { id: "developer", label: "Developer", icon: Bug20Regular, targetId: "settings-developer" },
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
    icon: IconGlyph;
    keywords?: string[];
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
    {
        id: "account",
        label: "Account",
        icon: Settings24Regular,
        keywords: ["profile", "billing", "plan", "login"],
    },
    {
        id: "agents",
        label: "Agents",
        icon: Sparkle24Regular,
        keywords: ["ai", "models", "mcp", "plugins", "slack", "rules", "context", "workflows", "commands"],
    },
    {
        id: "editor",
        label: "Editor",
        icon: Code20Regular,
        keywords: ["font", "indent", "caret", "save", "files", "design"],
    },
    {
        id: "terminal",
        label: "Terminal",
        icon: WindowConsole20Regular,
        keywords: ["shell", "scrollback"],
    },
    {
        id: "git",
        label: "Git",
        icon: BranchFork20Regular,
        keywords: ["source", "control", "scm"],
    },
    {
        id: "application",
        label: "Application",
        icon: Settings20Regular,
        keywords: ["updates", "notifications", "privacy", "telemetry", "developer", "reset", "keyboard", "shortcuts", "keybindings"],
    },
];

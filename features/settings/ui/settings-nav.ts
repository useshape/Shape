export type SettingsNavLeaf = {
    id: string;
    label: string;
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
        children: [{ id: "account-profile", label: "Profile", targetId: "settings-account" }],
    },
    {
        id: "agents",
        label: "Agents",
        children: [
            { id: "ai-models", label: "Models", targetId: "settings-ai-models" },
            { id: "ai-instructions", label: "Instructions", targetId: "settings-ai-memories" },
            { id: "ai-rules", label: "Rules", targetId: "settings-ai-rules" },
            { id: "ai-context", label: "Context", targetId: "settings-ai-context" },
            { id: "mcp", label: "MCP", targetId: "settings-ai-mcp" },
        ],
    },
    {
        id: "editor",
        label: "Editor",
        children: [
            { id: "editor-font", label: "Font & Display", targetId: "settings-editor-font" },
            { id: "editor-indent", label: "Indentation", targetId: "settings-editor-indent" },
            { id: "editor-cursor", label: "Caret & Scrolling", targetId: "settings-editor-cursor" },
            { id: "editor-save", label: "Saving & Formatting", targetId: "settings-editor-save" },
            { id: "editor-files", label: "Files", targetId: "settings-editor-files" },
            { id: "editor-design", label: "Design", targetId: "settings-editor-design" },
        ],
    },
    {
        id: "features",
        label: "Features",
        children: [
            { id: "terminal", label: "Terminal", targetId: "settings-terminal" },
            { id: "git", label: "Source Control", targetId: "settings-git" },
            { id: "languages", label: "Language Servers", targetId: "settings-languages" },
            { id: "node", label: "Node.js", targetId: "settings-node" },
            { id: "python", label: "Python", targetId: "settings-python" },
            { id: "tools-lint", label: "ESLint & Prettier", targetId: "settings-tools-lint" },
        ],
    },
    {
        id: "application",
        label: "Application",
        children: [
            { id: "appearance", label: "Appearance", targetId: "settings-appearance" },
            { id: "updates", label: "Updates", targetId: "settings-updates" },
            { id: "notifications", label: "Notifications", targetId: "settings-notifications" },
            { id: "privacy", label: "Privacy & telemetry", targetId: "settings-privacy" },
            { id: "developer", label: "Developer", targetId: "settings-developer" },
        ],
    },
];

export function allSettingsLeaves(): SettingsNavLeaf[] {
    return SETTINGS_NAV.flatMap((g) => g.children);
}

export function findLeafByTarget(targetId: string): SettingsNavLeaf | undefined {
    return allSettingsLeaves().find((l) => l.targetId === targetId);
}

export type SettingsNavLeaf = {
    id: string;
    label: string;
    /** DOM id of the scroll target in the main settings page */
    targetId?: string;
    /** Navigate to a separate settings sub-page instead of scrolling */
    href?: string;
    /** Open an in-place settings sub-view (works in both the settings window and the editor tab) */
    view?: "mcp-library";
};

export type SettingsNavGroup = {
    id: string;
    label: string;
    children: SettingsNavLeaf[];
};

/** Cursor-style flat sidebar categories (primary nav). */
export type SettingsCategoryId =
    | "account"
    | "agents"
    | "editor"
    | "terminal"
    | "git"
    | "languages"
    | "appearance"
    | "application";

export type SettingsCategory = {
    id: SettingsCategoryId;
    label: string;
    icon: string;
    /** Optional search keywords */
    keywords?: string[];
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
    {
        id: "account",
        label: "Account",
        icon: "person",
        keywords: ["profile", "billing", "plan", "login"],
    },
    {
        id: "agents",
        label: "Agents",
        icon: "auto_awesome",
        keywords: ["ai", "models", "mcp", "rules", "context"],
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
        icon: "terminal",
        keywords: ["shell", "scrollback"],
    },
    {
        id: "git",
        label: "Git",
        icon: "commit",
        keywords: ["source", "control", "scm"],
    },
    {
        id: "languages",
        label: "Languages",
        icon: "language",
        keywords: ["lsp", "eslint", "prettier", "node", "python"],
    },
    {
        id: "appearance",
        label: "Appearance",
        icon: "palette",
        keywords: ["theme", "color"],
    },
    {
        id: "application",
        label: "Application",
        icon: "settings",
        keywords: ["updates", "notifications", "privacy", "telemetry", "developer", "reset"],
    },
];

/**
 * Legacy VS Code-style tree kept for deep-link target ids / IntersectionObserver.
 * Primary UX uses SETTINGS_CATEGORIES.
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
            { id: "ai-rules", label: "Rules", targetId: "settings-ai-rules" },
            { id: "ai-context", label: "Context", targetId: "settings-ai-context" },
            { id: "mcp", label: "MCP", targetId: "settings-ai-mcp" },
            { id: "mcp-library", label: "MCP Library", view: "mcp-library" },
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

/** Map legacy leaf / group ids to a flat category. */
export function categoryForLeafId(leafId: string): SettingsCategoryId {
    if (leafId.startsWith("account")) return "account";
    if (leafId.startsWith("ai") || leafId.startsWith("mcp")) return "agents";
    if (leafId.startsWith("editor")) return "editor";
    if (leafId === "terminal") return "terminal";
    if (leafId === "git") return "git";
    if (
        leafId === "languages" ||
        leafId === "node" ||
        leafId === "python" ||
        leafId === "tools-lint"
    ) {
        return "languages";
    }
    if (leafId === "appearance") return "appearance";
    return "application";
}

export function categoryForTargetId(targetId: string): SettingsCategoryId | null {
    const leaf = findLeafByTarget(targetId);
    return leaf ? categoryForLeafId(leaf.id) : null;
}

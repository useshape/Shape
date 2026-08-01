import { getShortcutForLabel } from "@/lib/ui/shortcuts";

export type MenuItem =
    | { label: string; shortcut?: string; submenu?: MenuItem[]; type?: never }
    | { type: "separator"; label?: never; shortcut?: never; submenu?: never };

/**
 * Build the menu structure dynamically from the current keybinding configuration.
 * This ensures menu shortcuts always reflect user customizations.
 */
export function buildMenuStructure(): Record<string, MenuItem[]> {
    return {
        File: [
            { label: "New Text File", shortcut: getShortcutForLabel("New Text File") },
            { label: "New Window", shortcut: getShortcutForLabel("New Window") },
            { type: "separator" },
            { label: "Open File", shortcut: getShortcutForLabel("Open File") },
            { label: "Open Folder", shortcut: getShortcutForLabel("Open Folder") },
            { label: "Add Folder to Workspace" },
            { type: "separator" },
            { label: "Save", shortcut: getShortcutForLabel("Save") },
            { label: "Save As", shortcut: getShortcutForLabel("Save As") },
            { label: "Save All", shortcut: getShortcutForLabel("Save All") },
            { type: "separator" },
            { label: "Close Tab", shortcut: getShortcutForLabel("Close Tab") },
            { label: "Close All Tabs", shortcut: getShortcutForLabel("Close All Tabs") },
            { label: "Close Window", shortcut: getShortcutForLabel("Close Window") },
            { label: "Close Folder", shortcut: getShortcutForLabel("Close Folder") },
            { type: "separator" },
            { label: "Exit" },
        ],
        Edit: [
            { label: "Undo", shortcut: getShortcutForLabel("Undo") },
            { label: "Redo", shortcut: getShortcutForLabel("Redo") },
            { type: "separator" },
            { label: "Cut", shortcut: getShortcutForLabel("Cut") },
            { label: "Copy", shortcut: getShortcutForLabel("Copy") },
            { label: "Paste", shortcut: getShortcutForLabel("Paste") },
            { type: "separator" },
            { label: "Select All", shortcut: getShortcutForLabel("Select All") },
            { type: "separator" },
            { label: "Find in Files", shortcut: getShortcutForLabel("Find in Files") },
            { label: "Replace in Files", shortcut: getShortcutForLabel("Replace in Files") },
            { type: "separator" },
            { label: "Format Document", shortcut: getShortcutForLabel("Format Document") },
            { type: "separator" },
            { label: "Go to Definition", shortcut: getShortcutForLabel("Go to Definition") },
        ],
        View: [
            { label: "Command Palette...", shortcut: getShortcutForLabel("Command Palette...") },
            { label: "Open View..." },
            { label: "Zen Mode", shortcut: getShortcutForLabel("Zen Mode") },
            { type: "separator" },
            { label: "Explorer", shortcut: getShortcutForLabel("Explorer") },
            { label: "Search", shortcut: getShortcutForLabel("Search") },
            { label: "Source Control", shortcut: getShortcutForLabel("Source Control") },
            { label: "Git Graph", shortcut: getShortcutForLabel("Git Graph") },
            { label: "Outline", shortcut: getShortcutForLabel("Outline") },
            { label: "Problems", shortcut: getShortcutForLabel("Problems") },

            { type: "separator" },
            { label: "AI Chat", shortcut: getShortcutForLabel("AI Chat") },
            { label: "Terminal", shortcut: getShortcutForLabel("Terminal") },
            { label: "Project Statistics" },
            { type: "separator" },
            { label: "Word Wrap", shortcut: getShortcutForLabel("Word Wrap") },
            { type: "separator" },
            { label: "Reset Layout" },
        ],
        Go: [
            { label: "Back", shortcut: "Alt+Left" },
            { label: "Forward", shortcut: "Alt+Right" },
            { label: "Last Edit Location" },
            { type: "separator" },
            { label: "Go to File...", shortcut: getShortcutForLabel("Go to File") },
            { label: "Go to Symbol in Workspace..." },
            { type: "separator" },
            { label: "Go to Symbol in Editor..." },
            { label: "Go to Definition", shortcut: getShortcutForLabel("Go to Definition") },
            { label: "Go to Declaration" },
            { label: "Go to Type Definition" },
            { label: "Go to Implementations" },
            { label: "Go to References" },
            { type: "separator" },
            { label: "Go to Line/Column...", shortcut: "Ctrl+G" },
            { label: "Go to Bracket", shortcut: "Ctrl+Shift+\\" },
        ],

        Terminal: [
            { label: "New Terminal", shortcut: getShortcutForLabel("New Terminal") },
            { label: "Close Terminal", shortcut: getShortcutForLabel("Close Terminal") },
            { label: "Kill Current Terminal", shortcut: getShortcutForLabel("Kill Current Terminal") },
        ],
        Window: [
            { label: "New Window", shortcut: getShortcutForLabel("New Window") },
            { label: "Close Window", shortcut: getShortcutForLabel("Close Window") },
            { type: "separator" },
            { label: "Git Manager" },
            { label: "Settings", shortcut: getShortcutForLabel("Settings") },
            { label: "Project Statistics" },
            { type: "separator" },
            { label: "Toggle Full Screen", shortcut: "F11" },
        ],
        Help: [
            { label: "Documentation" },
            { label: "Release Notes" },
            { type: "separator" },
            { label: "Report Issue" },
            { type: "separator" },
            { label: "View License" },
            { label: "Privacy Statement" },
            { type: "separator" },
            { label: "Check for Updates..." },
            { type: "separator" },
            { label: "About" },
        ],
    };
}

// For backwards compatibility: a static snapshot (computed once at module init)
export const menuStructure = buildMenuStructure();

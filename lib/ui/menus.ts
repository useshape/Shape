import { getShortcutForLabel } from "@/lib/ui/shortcuts";

export type MenuItem =
    | { label: string; shortcut?: string; submenu?: MenuItem[]; type?: never }
    | { type: "separator"; label?: never; shortcut?: never; submenu?: never };

/** Agent View menubar — File / Edit / View / Help. */
export function buildAgentMenuStructure(): Record<string, MenuItem[]> {
    return {
        File: [
            { label: "New Chat" },
            { label: "Open Folder", shortcut: getShortcutForLabel("Open Folder") },
            { type: "separator" },
            { label: "Open File", shortcut: getShortcutForLabel("Open File") },
            { type: "separator" },
            { label: "Save", shortcut: getShortcutForLabel("Save") },
            { label: "Save All", shortcut: getShortcutForLabel("Save All") },
            { type: "separator" },
            { label: "Close Folder", shortcut: getShortcutForLabel("Close Folder") },
            { label: "Close Window", shortcut: getShortcutForLabel("Close Window") },
            { type: "separator" },
            { label: "Settings", shortcut: getShortcutForLabel("Settings") },
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
        ],
        View: [
            { label: "Command Palette...", shortcut: getShortcutForLabel("Command Palette...") },
            { type: "separator" },
            { label: "Explorer", shortcut: getShortcutForLabel("Explorer") },
            { label: "Changes" },
            { label: "Preview" },
            { type: "separator" },
            { label: "Git Manager" },
            { label: "Settings", shortcut: getShortcutForLabel("Settings") },
        ],
        Help: [
            { label: "Documentation" },
            { label: "Release Notes" },
            { type: "separator" },
            { label: "Report Issue" },
            { type: "separator" },
            { label: "Check for Updates..." },
            { type: "separator" },
            { label: "About" },
        ],
    };
}

/** @deprecated IDE menu — Agent View uses buildAgentMenuStructure */
export function buildMenuStructure(): Record<string, MenuItem[]> {
    return buildAgentMenuStructure();
}

export const menuStructure = buildAgentMenuStructure();
export const agentMenuStructure = buildAgentMenuStructure();

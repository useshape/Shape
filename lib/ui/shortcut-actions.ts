import { commands } from "@/lib/backend/commands";
import { isPopoutPath } from "@/lib/tauri-window";

function openSearchSidebar(mode: "search" | "replace") {
    window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "search" }));
    window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "primary-sidebar", value: true } }));
    window.dispatchEvent(new CustomEvent("shape-search-mode", { detail: { mode } }));
}

function dispatchEditorAction(action: string) {
    window.dispatchEvent(new CustomEvent("shape-editor-action", { detail: { action } }));
}

function isExplorerFocused(): boolean {
    const el = document.activeElement as HTMLElement | null;
    return !!el?.closest?.('[data-explorer-root="true"]');
}

/** Dispatch a keybinding action by label. Returns true if handled locally. */
export function dispatchShortcutAction(label: string, key: string): boolean {
    switch (label) {
        case "Find in Files":
            openSearchSidebar("search");
            return true;
        case "Replace in Files":
            openSearchSidebar("replace");
            return true;
        case "Go to File":
        case "Go to File...":
            window.dispatchEvent(new CustomEvent("shape-command-palette", { detail: { mode: "files" } }));
            return true;
        case "Find":
            window.dispatchEvent(new Event("open-in-file-search"));
            return true;
        case "Command Palette":
        case "Command Palette...":
            window.dispatchEvent(new CustomEvent("shape-command-palette"));
            return true;
        case "Save All":
            window.dispatchEvent(new Event("save-all-request"));
            return true;
        case "Close Folder":
            window.dispatchEvent(new Event("shape-design-exit"));
            void import("@/lib/last-project").then(({ saveLastProject }) => saveLastProject(null));
            void commands.setProjectPath(null);
            return true;
        case "New Window":
            void commands.newWindow();
            return true;
        case "Explorer":
            window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "explorer" }));
            window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "primary-sidebar", value: true } }));
            return true;
        case "Search":
            window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "search" }));
            window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "primary-sidebar", value: true } }));
            return true;
        case "Source Control":
            window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "source" }));
            window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "primary-sidebar", value: true } }));
            return true;
        case "Problems":
            window.dispatchEvent(new Event("shape-open-problems"));
            window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
            return true;
        case "Terminal":
            window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
            window.dispatchEvent(new CustomEvent("shape-terminal-shortcut", { detail: { action: "open" } }));
            return true;
        case "New Terminal":
            window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
            window.dispatchEvent(new CustomEvent("shape-terminal-shortcut", { detail: { action: "new" } }));
            return true;
        case "Settings":
            void import("@/lib/open-settings").then(({ openSettingsWindow }) => openSettingsWindow());
            return true;
        case "AI Chat":
            window.dispatchEvent(
                new CustomEvent("shape-layout-toggle", { detail: { id: "secondary-sidebar", value: true } }),
            );
            return true;
        case "Toggle Design Mode":
            window.dispatchEvent(new Event("shape-toggle-design-mode"));
            return true;
        case "Go to Line/Column...":
            window.dispatchEvent(new CustomEvent("shape-command-palette", {
                detail: { mode: "goto_line", placeholder: "Line : Column" },
            }));
            return true;
        case "Undo":
        case "Redo":
        case "Cut":
        case "Copy":
        case "Paste":
        case "Select All":
        case "Format Document":
        case "Go to Definition":
        case "Go to Symbol in Editor...":
        case "Go to Symbol in Workspace...":
        case "Go to References":
        case "Go to Bracket":
            if (
                (label === "Cut" || label === "Copy" || label === "Paste") &&
                isExplorerFocused()
            ) {
                window.dispatchEvent(
                    new CustomEvent("shape-explorer-action", {
                        detail: { action: label.toLowerCase() },
                    }),
                );
                return true;
            }
            dispatchEditorAction({
                Undo: "undo",
                Redo: "redo",
                Cut: "cut",
                Copy: "copy",
                Paste: "paste",
                "Select All": "selectAll",
                "Format Document": "format",
                "Go to Definition": "definition",
                "Go to Symbol in Editor...": "goToSymbolInEditor",
                "Go to Symbol in Workspace...": "goToSymbolInWorkspace",
                "Go to References": "goToReferences",
                "Go to Bracket": "goToBracket",
                "Inline Edit": "inlineEdit",
            }[label] ?? label);
            return true;
        case "Save":
            window.dispatchEvent(new Event("save-request"));
            return true;
        case "New Text File":
            window.dispatchEvent(new CustomEvent("shape-explorer-create", { detail: { type: "file" } }));
            return true;
        case "Open File":
            window.dispatchEvent(new Event("open-file-request"));
            return true;
        case "Open Folder":
            window.dispatchEvent(new Event("open-folder-request"));
            return true;
        case "Save As":
            void (async () => {
                const { commands } = await import("@/lib/backend/commands");
                const state = await commands.getProjectState();
                const active = state.active_file;
                if (!active) return;
                const { getFileExtension, isImageExtension, isFontExtension } = await import(
                    "@/features/editor/lsp/image-types"
                );
                const ext = getFileExtension(active);
                if (isImageExtension(ext) || isFontExtension(ext)) {
                    window.dispatchEvent(new Event("save-request"));
                    return;
                }
                const { save } = await import("@tauri-apps/plugin-dialog");
                const name = active.split(/[\\/]/).pop() || "untitled";
                const selected = await save({
                    defaultPath: state.project_path ? `${state.project_path}/${name}` : name,
                });
                if (typeof selected !== "string") return;
                const content = await commands.readFile(active);
                await commands.saveFile(selected, content);
                await commands.openFile(selected, selected.split(/[\\/]/).pop() || selected);
            })();
            return true;
        case "Recent Files":
            window.dispatchEvent(new CustomEvent("shape-command-palette", {
                detail: { mode: "files", recent: true, placeholder: "Recent files..." },
            }));
            return true;
        case "Close Tab":
            return false;
        case "Close All Tabs":
            void commands.closeAllFiles();
            return true;
        case "Zen Mode":
            if (isPopoutPath()) return true;
            window.dispatchEvent(new Event("shape-toggle-zen-mode"));
            return true;
        case "Inline Edit":
            dispatchEditorAction("inlineEdit");
            return true;
        default:
            return false;
    }
}

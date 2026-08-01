import { commands } from "@/lib/backend";
import { HELP_LINKS } from "@/lib/help-links";
import { isPopoutPath } from "@/lib/tauri-window";
import { notifyWorkspaceClosed, notifyWorkspaceOpened } from "@/lib/workspace-trust";
import { clearExtraWorkspaceFolders } from "@/lib/workspace-folders";
import type { MenuActionContext } from "./types";
import { getFileExtension, isImageExtension, isFontExtension } from "@/features/editor/lsp/image-types";

function getFileName(path: string) {
    return path.split(/[\\/]/).pop() || path;
}

function getDirectoryName(path: string) {
    const normalized = path.replace(/\\/g, "/");
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash < 0) return null;
    return normalized.slice(0, lastSlash);
}

/** Binary assets must not be round-tripped through UTF-8 text save. */
function isBinaryAssetPath(path: string): boolean {
    const ext = getFileExtension(path);
    return isImageExtension(ext) || isFontExtension(ext);
}

const EDITOR_ACTION_MAP: Record<string, string> = {
    Undo: "undo",
    Redo: "redo",
    Cut: "cut",
    Copy: "copy",
    Paste: "paste",
    "Select All": "selectAll",
    "Format Document": "format",
    "Go to Definition": "definition",
    "Go to Declaration": "declaration",
    "Go to Type Definition": "typeDefinition",
    "Go to Implementations": "implementation",
    "Go to Line/Column...": "goToLine",
    "Go to Symbol in Editor...": "goToSymbolInEditor",
    "Go to Symbol in Workspace...": "goToSymbolInWorkspace",
    "Go to References": "goToReferences",
    "Go to Bracket": "goToBracket",
    Back: "back",
    Forward: "forward",
    "Last Edit Location": "lastEditLocation",
};

export function createMenuActionHandler(ctx: MenuActionContext) {
    return async (label: string) => {
        switch (label) {
            case "New Window":
                await commands.newWindow();
                break;
            case "Open File": {
                const { open } = await import("@tauri-apps/plugin-dialog");
                const selected = await open({
                    directory: false,
                    multiple: false,
                    defaultPath: ctx.projectPath || undefined,
                });
                if (typeof selected === "string") {
                    const selectedDir = getDirectoryName(selected);
                    if (!ctx.projectPath && selectedDir) {
                        clearExtraWorkspaceFolders();
                        await commands.setProjectPath(selectedDir);
                        notifyWorkspaceOpened(selectedDir);
                    }
                    await commands.openFile(selected, getFileName(selected));
                }
                break;
            }
            case "Open Folder": {
                const { open } = await import("@tauri-apps/plugin-dialog");
                const selected = await open({ directory: true, multiple: false });
                if (selected) {
                    window.dispatchEvent(
                        new CustomEvent("shape-open-project", { detail: { path: selected as string } }),
                    );
                }
                break;
            }
            case "Add Folder to Workspace": {
                const { open } = await import("@tauri-apps/plugin-dialog");
                const selected = await open({ directory: true, multiple: false });
                if (selected && typeof selected === "string") {
                    const { addWorkspaceFolder } = await import("@/lib/workspace-folders");
                    addWorkspaceFolder(selected);
                    window.dispatchEvent(new Event("shape-workspace-folders-changed"));
                }
                break;
            }
            case "Close Folder":
                await commands.closeAllFiles();
                const { saveLastProject } = await import("@/lib/last-project");
                saveLastProject(null);
                await commands.setProjectPath(null);
                notifyWorkspaceClosed();
                break;
            case "Close Tab":
                if (ctx.activeFile) commands.closeFile(ctx.activeFile);
                break;
            case "Close All Tabs":
                commands.closeAllFiles();
                break;
            case "New Text File":
                window.dispatchEvent(new CustomEvent("shape-explorer-create", { detail: { type: "file" } }));
                break;
            case "Save":
                window.dispatchEvent(new Event("save-request"));
                break;
            case "Save As": {
                if (!ctx.activeFile) break;
                if (isBinaryAssetPath(ctx.activeFile)) {
                    // Image/font editors own their own save path (bytes), not UTF-8 text.
                    window.dispatchEvent(new Event("save-request"));
                    break;
                }
                const { save } = await import("@tauri-apps/plugin-dialog");
                const selected = await save({
                    defaultPath: ctx.projectPath
                        ? `${ctx.projectPath}/${getFileName(ctx.activeFile)}`
                        : getFileName(ctx.activeFile),
                });
                if (typeof selected === "string") {
                    const content = await ctx.readLatestContent(ctx.activeFile);
                    await commands.saveFile(selected, content);
                    await commands.openFile(selected, getFileName(selected));
                }
                break;
            }
            case "Save All": {
                for (const file of ctx.openFiles.filter((f) => f.is_dirty)) {
                    if (isBinaryAssetPath(file.path)) continue;
                    const content = await ctx.readLatestContent(file.path);
                    await commands.saveFile(file.path, content);
                }
                break;
            }
            case "Undo":
            case "Redo":
            case "Cut":
            case "Copy":
            case "Paste":
            case "Select All":
            case "Format Document":
            case "Back":
            case "Forward":
            case "Last Edit Location":
            case "Go to Symbol in Workspace...":
            case "Go to Symbol in Editor...":
            case "Go to Line/Column...":
            case "Go to Bracket":
            case "Go to Definition":
            case "Go to Declaration":
            case "Go to Type Definition":
            case "Go to Implementations":
            case "Go to References": {
                const action = EDITOR_ACTION_MAP[label];
                if (action) {
                    window.dispatchEvent(new CustomEvent("shape-editor-action", { detail: { action } }));
                }
                break;
            }
            case "Word Wrap":
                window.dispatchEvent(
                    new CustomEvent("shape-editor-action", { detail: { action: "toggleWordWrap" } }),
                );
                break;
            case "Reset Layout":
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", { detail: { id: "primary-sidebar", value: true } }),
                );
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }),
                );
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", {
                        detail: { id: "secondary-sidebar", value: false },
                    }),
                );
                window.dispatchEvent(new Event("shape-layout-reset"));
                break;
            case "Git Graph":
                window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "graph" }));
                break;
            case "Outline":
                window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "outline" }));
                break;
            case "AI Chat":
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", {
                        detail: { id: "secondary-sidebar", value: true },
                    }),
                );
                break;
            case "Zen Mode":
                if (!isPopoutPath()) {
                    window.dispatchEvent(new Event("shape-toggle-zen-mode"));
                }
                break;
            case "Explorer":
                window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "explorer" }));
                break;
            case "Search":
                window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "search" }));
                break;
            case "Source Control":
                window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "source" }));
                break;
            case "Git Manager":
                void import("@/lib/open-git-window").then(({ openGitWindow }) => openGitWindow());
                break;
            case "Project Statistics":
                void import("@/lib/open-stats-window").then(({ openStatsWindow }) => openStatsWindow());
                break;
            case "Open View...":
            case "Go to File...":
                window.dispatchEvent(new CustomEvent("shape-command-palette", { detail: { mode: "files" } }));
                break;
            case "Problems":
                window.dispatchEvent(new Event("shape-open-problems"));
                break;
            case "Output":
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }),
                );
                window.dispatchEvent(new Event("shape-open-output"));
                break;
            case "Terminal":
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }),
                );
                window.dispatchEvent(
                    new CustomEvent("shape-terminal-shortcut", { detail: { action: "open" } }),
                );
                break;
            case "Command Palette...":
                window.dispatchEvent(new CustomEvent("shape-command-palette"));
                break;
            case "Find in Files":
                window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "search" }));
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", {
                        detail: { id: "primary-sidebar", value: true },
                    }),
                );
                window.dispatchEvent(new CustomEvent("shape-search-mode", { detail: { mode: "search" } }));
                break;
            case "Replace in Files":
                window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "search" }));
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", {
                        detail: { id: "primary-sidebar", value: true },
                    }),
                );
                window.dispatchEvent(new CustomEvent("shape-search-mode", { detail: { mode: "replace" } }));
                break;
            case "New Terminal":
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }),
                );
                window.dispatchEvent(
                    new CustomEvent("shape-terminal-shortcut", { detail: { action: "new" } }),
                );
                break;
            case "Close Terminal":
                window.dispatchEvent(
                    new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: false } }),
                );
                break;
            case "Kill Current Terminal":
                window.dispatchEvent(
                    new CustomEvent("shape-terminal-shortcut", { detail: { action: "close_tab" } }),
                );
                break;
            case "Toggle Full Screen": {
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                const win = getCurrentWindow();
                await win.setFullscreen(!(await win.isFullscreen()));
                break;
            }
            case "Settings":
                void import("@/lib/open-settings").then(({ openSettingsWindow }) => openSettingsWindow());
                break;
            case "Release Notes":
                void commands.openUrlExternal(HELP_LINKS.changelog);
                break;
            case "Documentation":
                void commands.openUrlExternal(HELP_LINKS.documentation);
                break;
            case "Report Issue":
                void commands.openUrlExternal(HELP_LINKS.reportIssue);
                break;
            case "Check for Updates":
            case "Check for Updates...": {
                const { checkForAppUpdates, downloadAndInstallUpdate, getUpdateStatus, relaunchToApplyUpdate } =
                    await import("@/lib/updater");
                const { ask, message } = await import("@tauri-apps/plugin-dialog");
                const status = await checkForAppUpdates({ force: true });
                if (status.kind === "available") {
                    const confirmed = await ask(
                        `Shape ${status.version} is available. Download and install now?`,
                        { title: "Update available", kind: "info" },
                    );
                    if (confirmed) {
                        await downloadAndInstallUpdate();
                        if (getUpdateStatus().kind === "ready") {
                            const restart = await ask("Update installed. Restart Shape now?", {
                                title: "Restart required",
                                kind: "info",
                            });
                            if (restart) await relaunchToApplyUpdate();
                        }
                    }
                } else if (status.kind === "upToDate") {
                    await message("You're on the latest version.", { title: "Check for Updates", kind: "info" });
                } else if (status.kind === "error") {
                    await message(status.message, { title: "Check for Updates", kind: "error" });
                } else if (status.kind === "ready") {
                    const restart = await ask("An update is ready. Restart Shape now?", {
                        title: "Restart required",
                        kind: "info",
                    });
                    if (restart) await relaunchToApplyUpdate();
                }
                break;
            }
            case "View License":
                void commands.openUrlExternal(HELP_LINKS.license);
                break;
            case "Privacy Statement":
                void commands.openUrlExternal(HELP_LINKS.privacy);
                break;
            case "Close Window":
            case "Exit":
                ctx.closeWindow();
                break;
            case "About": {
                const { message } = await import("@tauri-apps/plugin-dialog");
                try {
                    const { getVersion, getName } = await import("@tauri-apps/api/app");
                    await message(`${await getName()}\nVersion: ${await getVersion()}`, {
                        title: "About",
                        kind: "info",
                    });
                } catch {
                    await message("Shape\nVersion: 0.2.0", { title: "About", kind: "info" });
                }
                break;
            }
            case "Onboarding":
            case "Welcome":
                break;
            default:
                console.warn(`[titlebar] Unhandled menu action: "${label}"`);
        }
    };
}

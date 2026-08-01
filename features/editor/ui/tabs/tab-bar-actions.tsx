"use client";

import { useProjectState, commands } from "@/lib/backend";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useEditorSplit } from "@/core/providers/editor";
import { Tooltip } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { reopenLastClosed } from "@/lib/closed-tabs";
import { TokensMenu } from "@/features/editor/ui/main/ui/tokens-menu";
import { useSettings, updateSettingSection } from "@/lib/settings";
import { WORKBENCH_TAB_ACTION_BUTTON_CLASS } from "./workbench-tab-styles";
import { getActivePythonCommand } from "@/features/workbench/status/ui/python-interpreter";

function isPythonFile(path: string | null | undefined): boolean {
    if (!path) return false;
    return /\.pyw?$/i.test(path);
}

export function TabBarActions({ compactOnly = false }: { compactOnly?: boolean }) {
    const { active_file, open_files, project_path } = useProjectState();
    const { splitEnabled, splitRight, closeSplit } = useEditorSplit();
    const settings = useSettings();
    const canSplit = Boolean(active_file);
    const canRunPython = isPythonFile(active_file);

    const toggleSplit = () => {
        if (!canSplit) return;
        if (splitEnabled) closeSplit();
        else splitRight();
    };

    const runPython = () => {
        if (!active_file) return;
        void (async () => {
            const python = await getActivePythonCommand(project_path);
            const quoted = /\s/.test(active_file) ? `"${active_file}"` : active_file;
            window.dispatchEvent(
                new CustomEvent("shape-terminal-run", {
                    detail: { command: `${python} ${quoted}` },
                }),
            );
        })();
    };

    return (
        <div className="flex items-center gap-0.5 shrink-0">
            {canRunPython ? (
                <Tooltip content="Run Python File">
                    <button
                        type="button"
                        className={WORKBENCH_TAB_ACTION_BUTTON_CLASS}
                        onClick={runPython}
                    >
                        <Icon name="play_arrow" size={14} filled />
                    </button>
                </Tooltip>
            ) : null}
            <Tooltip content={settings.editor.compactTabs ? "Show Tabs" : "Compact Tabs"}>
                <button
                    type="button"
                    className={cn(
                        WORKBENCH_TAB_ACTION_BUTTON_CLASS,
                        settings.editor.compactTabs && "text-text-primary",
                    )}
                    onClick={() => updateSettingSection("editor", { compactTabs: !settings.editor.compactTabs })}
                >
                    <Icon
                        name={settings.editor.compactTabs ? "list_alt" : "view_compact"}
                        size={14}
                    />
                </button>
            </Tooltip>
            {compactOnly ? null : (
                <>
            <Tooltip content={splitEnabled ? "Close Split" : "Split Editor Right"}>
                <button
                    type="button"
                    disabled={!canSplit}
                    className={cn(
                        WORKBENCH_TAB_ACTION_BUTTON_CLASS,
                        !canSplit && "opacity-30 cursor-not-allowed",
                        splitEnabled && "text-accent",
                    )}
                    onClick={toggleSplit}
                >
                    <Icon name="vertical_split" size={14} />
                </button>
            </Tooltip>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className={WORKBENCH_TAB_ACTION_BUTTON_CLASS}
                        title="Editor Actions"
                    >
                        <Icon name="more_horiz" size={14} />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom">
                    <DropdownMenuItem
                        disabled={!active_file}
                        onClick={() => window.dispatchEvent(new Event("save-request"))}
                    >
                        Save
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={!open_files.some((f) => f.is_dirty)}
                        onClick={() => window.dispatchEvent(new Event("save-all-request"))}
                    >
                        Save All
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void reopenLastClosed()}>
                        Reopen Closed Editor
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        disabled={!active_file}
                        onClick={() => active_file && commands.revealPath(active_file)}
                    >
                        Reveal Active File in Explorer
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={!active_file}
                        onClick={() => active_file && navigator.clipboard.writeText(active_file)}
                    >
                        Copy Active File Path
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={!canSplit} onClick={() => splitRight()}>
                        Split Right
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!splitEnabled} onClick={() => closeSplit()}>
                        Close Split
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => commands.closeAllFiles()}>
                        Close All
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={!active_file}
                        onClick={() => active_file && commands.closeOtherFiles(active_file)}
                    >
                        Close Others
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={!active_file}
                        onClick={() => active_file && commands.closeToRight(active_file)}
                    >
                        Close to Right
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => commands.closeSaved()}>
                        Close Saved
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() =>
                            import("@/lib/open-settings").then(({ openSettingsWindow }) => openSettingsWindow())
                        }
                    >
                        Settings
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <TokensMenu activePath={active_file} />
                </>
            )}
        </div>
    );
}

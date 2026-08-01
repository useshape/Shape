"use client";

import { useMemo } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { FileIcon } from "@/components/ui/file-icon";
import { useProjectState, commands } from "@/lib/backend";
import { useDiagnostics } from "@/features/diagnostics/store";
import { useAllProgressMessages } from "@/lib/status-progress";
import { getLanguageLabel } from "@/lib/monaco-languages";
import { openLanguageModePicker } from "@/features/editor/ui/main/ui/language-picker";
import { useEditorSplit } from "@/core/providers/editor";
import {
    dispatchEditorAction,
    openStatusPalette,
    useEditorStatus,
} from "../hooks/use-editor-status";
import { GitStatusButton } from "./git-status";
import { StatusItem } from "./status-item";
import { NotificationsMenu } from "./notifications-menu";
import { PythonInterpreterStatus } from "./python-interpreter";

export default function Status() {
    const { splitEnabled, focusedGroup, getGroupActiveFile } = useEditorSplit();
    const { active_file, project_path } = useProjectState();
    const statusFile =
        splitEnabled && focusedGroup === "right" ? getGroupActiveFile("right") : active_file;
    const { totals } = useDiagnostics();
    const progressMessages = useAllProgressMessages();
    const { editorStatus, typescriptVersion } = useEditorStatus();
    const latestProgressMessage = progressMessages[progressMessages.length - 1] ?? null;
    const hasEditor = Boolean(statusFile);

    const relativePath = useMemo(() => {
        if (!statusFile || !project_path) return statusFile || "";
        const normProject = project_path.replace(/\\/g, "/").replace(/\/$/, "");
        const normFile = statusFile.replace(/\\/g, "/");
        if (normFile.toLowerCase().startsWith(`${normProject.toLowerCase()}/`)) {
            return normFile.slice(normProject.length + 1);
        }
        return statusFile.split(/[\\/]/).pop() || statusFile;
    }, [statusFile, project_path]);

    const languageLabel = useMemo(
        () => getLanguageLabel(editorStatus.language || "plaintext"),
        [editorStatus.language],
    );

    const openProblems = () => window.dispatchEvent(new Event("shape-open-problems"));

    const openIndentationPicker = () => {
        openStatusPalette("Select Indentation", [
            {
                id: "indent-spaces",
                label: "Indent Using Spaces",
                run: () => dispatchEditorAction("setInsertSpaces", { value: true }),
            },
            {
                id: "indent-tabs",
                label: "Indent Using Tabs",
                run: () => dispatchEditorAction("setInsertSpaces", { value: false }),
            },
            {
                id: "tab-2",
                label: "Tab Size: 2",
                run: () => dispatchEditorAction("setTabSize", { value: 2 }),
            },
            {
                id: "tab-4",
                label: "Tab Size: 4",
                run: () => dispatchEditorAction("setTabSize", { value: 4 }),
            },
            {
                id: "tab-8",
                label: "Tab Size: 8",
                run: () => dispatchEditorAction("setTabSize", { value: 8 }),
            },
        ]);
    };

    const openEolPicker = () => {
        openStatusPalette("Select End of Line Sequence", [
            { id: "eol-lf", label: "LF", run: () => dispatchEditorAction("setEol", { value: "LF" }) },
            {
                id: "eol-crlf",
                label: "CRLF",
                run: () => dispatchEditorAction("setEol", { value: "CRLF" }),
            },
        ]);
    };

    return (
        <div className="status-bar relative flex h-statusbar w-full select-none items-center bg-background text-text-muted text-xs font-light font-sans px-1 shrink-0">
            <div className="relative z-30 flex items-center h-full min-w-0 space-x-0.5">
                <GitStatusButton />

                {(totals.errors > 0 || totals.warnings > 0) && (
                    <div className="flex items-center">
                        {totals.errors > 0 && (
                            <Tooltip content={`${totals.errors} errors`}>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="hidden md:flex px-1.5 text-error gap-1"
                                    onClick={openProblems}
                                >
                                    <Icon name="error" size={14} filled />
                                    <span className="text-xs tabular-nums">{totals.errors}</span>
                                </Button>
                            </Tooltip>
                        )}
                        {totals.warnings > 0 && (
                            <Tooltip content={`${totals.warnings} warnings`}>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="hidden md:flex px-1.5 text-warning gap-1"
                                    onClick={openProblems}
                                >
                                    <Icon name="warning" size={14} filled />
                                    <span className="text-xs tabular-nums">{totals.warnings}</span>
                                </Button>
                            </Tooltip>
                        )}
                    </div>
                )}

                {latestProgressMessage && (
                    <Tooltip content={progressMessages.join("\n")}>
                        <div className="hidden md:flex items-center gap-1.5 px-2 text-text-secondary max-w-[300px] min-w-0 whitespace-nowrap">
                            <Icon name="sync" size={14} className="animate-spin shrink-0" />
                            <span className="truncate text-sm font-light">{latestProgressMessage}</span>
                            {progressMessages.length > 1 && (
                                <span className="text-2xs text-text-muted shrink-0">
                                    +{progressMessages.length - 1}
                                </span>
                            )}
                        </div>
                    </Tooltip>
                )}
            </div>

            <div className="absolute inset-0 z-10 flex items-center justify-center px-2 pointer-events-none">
                {statusFile && (
                    <button
                        onClick={() => commands.revealPath(statusFile)}
                        className="pointer-events-auto h-full px-3 flex items-center gap-1.5 text-text-secondary font-light truncate max-w-[60%] cursor-pointer hover:text-text-primary transition-colors"
                        title={statusFile}
                    >
                        <FileIcon
                            name={relativePath.split(/[\\/]/).pop() || relativePath}
                            className="w-3.5 h-3.5 shrink-0"
                        />
                        <span className="truncate">{relativePath}</span>
                    </button>
                )}
            </div>

            <div className="relative z-30 ml-auto flex items-center h-full shrink-0 min-w-0">
                {hasEditor && (
                    <>
                        <StatusItem
                            label="Go to Line/Column"
                            onClick={() => {
                                window.dispatchEvent(
                                    new CustomEvent("shape-command-palette", {
                                        detail: { mode: "goto_line", placeholder: "Line : Column" },
                                    }),
                                );
                            }}
                        >
                            {`Ln ${editorStatus.line}, Col ${editorStatus.column}`}
                        </StatusItem>

                        <StatusItem label="Select Indentation" onClick={openIndentationPicker}>
                            <span className="hidden sm:inline">
                                {editorStatus.insertSpaces
                                    ? `Spaces: ${editorStatus.spaces}`
                                    : `Tab Size: ${editorStatus.spaces}`}
                            </span>
                            <span className="sm:hidden">{editorStatus.spaces}</span>
                        </StatusItem>

                        <StatusItem label="Select Encoding">
                            <span className="hidden md:inline">UTF-8</span>
                        </StatusItem>

                        <StatusItem label="Select End of Line Sequence" onClick={openEolPicker}>
                            <span className="hidden md:inline">{editorStatus.eol}</span>
                        </StatusItem>

                        <Tooltip content="Format Document">
                            <button
                                type="button"
                                className="hidden lg:flex h-full px-1.5 items-center text-text-primary hover:bg-panel-hover transition-colors"
                                onClick={() => dispatchEditorAction("format")}
                            >
                                <Icon name="code" size={14} filled />
                            </button>
                        </Tooltip>

                        <StatusItem
                            label="Select Language Mode"
                            onClick={() => {
                                if (statusFile) {
                                    openLanguageModePicker(statusFile, editorStatus.language);
                                }
                            }}
                        >
                            <span className="hidden sm:inline">
                                {languageLabel}
                                {typescriptVersion && editorStatus.language.includes("typescript") && (
                                    <span className="text-text-muted ml-1">TS {typescriptVersion}</span>
                                )}
                            </span>
                            <span className="sm:hidden">{languageLabel.slice(0, 3).toUpperCase()}</span>
                        </StatusItem>

                        <PythonInterpreterStatus
                            language={editorStatus.language}
                            projectPath={project_path}
                        />
                    </>
                )}

                <NotificationsMenu />
            </div>
        </div>
    );
}

"use client";

import { RiArrowDownSLine } from "@remixicon/react";
import { useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { commands, useProjectState } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { CursorMark, ExplorerMark, VsCodeMark, ZedMark } from "./brand-marks";
import { Button } from "@/components/ui/button";

export function OpenInMenu() {
    const { project_path } = useProjectState();

    const open = async (app: "cursor" | "vscode" | "zed" | "explorer") => {
        if (!project_path) {
            notify.error("Open a project first");
            return;
        }
        try {
            await commands.openInApp(app === "vscode" ? "code" : app, project_path);
        } catch (err) {
            notify.error(err instanceof Error ? err.message : `Could not open in ${app}`);
        }
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (t?.closest("textarea, input, [contenteditable='true']")) return;
            if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
            if (e.key.toLowerCase() !== "o") return;
            e.preventDefault();
            void open("cursor");
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [project_path]);

    return (
        <DropdownMenu>
            <Tooltip content="Open in">
                <DropdownMenuTrigger asChild>
                    <Button
                        aria-label="Open in"
                        variant="outline"
                        size="sm"
                        className="px-1.5 text-sm text-text-muted hover:bg-panel-hover hover:text-text-primary"
                    >
                        <CursorMark />
                        <span>Open</span>
                        <Icon icon={RiArrowDownSLine} className="opacity-60" />
                    </Button>
                </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem onClick={() => void open("cursor")}>
                    <CursorMark />
                    <span className="flex-1">Cursor</span>
                    <span className="text-xs text-text-muted">Ctrl+O</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void open("vscode")}>
                    <VsCodeMark />
                    <span className="flex-1">VS Code</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void open("zed")}>
                    <ZedMark />
                    <span className="flex-1">Zed</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void open("explorer")}>
                    <ExplorerMark />
                    <span className="flex-1">Explorer</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

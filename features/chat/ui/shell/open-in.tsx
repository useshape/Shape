"use client";

import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import type { IconModule } from "thesvg";
import androidStudio from "thesvg/android-studio";
import antigravity from "thesvg/google-antigravity";
import cursor from "thesvg/cursor";
import emacs from "thesvg/emacs";
import fleet from "thesvg/jetbrains-fleet";
import goland from "thesvg/goland";
import helix from "thesvg/helix";
import intellij from "thesvg/intellij-idea";
import lapce from "thesvg/lapce";
import neovim from "thesvg/neovim";
import pycharm from "thesvg/pycharm";
import rider from "thesvg/rider";
import sublime from "thesvg/sublime-text";
import trae from "thesvg/trae";
import vim from "thesvg/vim";
import vscode from "thesvg/visual-studio-code";
import webstorm from "thesvg/webstorm";
import windsurf from "thesvg/windsurf";
import windows from "thesvg/windows";
import zed from "thesvg/zed";

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
import { Button } from "@/components/ui/button";

function BrandIcon({ icon }: { icon: IconModule }) {
    const html = icon.variants.dark || icon.variants.default || icon.svg;
    return (
        <span
            aria-hidden
            className="inline-flex size-4 shrink-0 [&_svg]:size-full"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

const OPEN_TARGETS: { id: string; label: string; icon: IconModule }[] = [
    { id: "cursor", label: "Cursor", icon: cursor },
    { id: "code", label: "VS Code", icon: vscode },
    { id: "zed", label: "Zed", icon: zed },
    { id: "windsurf", label: "Windsurf", icon: windsurf },
    { id: "subl", label: "Sublime Text", icon: sublime },
    { id: "idea", label: "IntelliJ IDEA", icon: intellij },
    { id: "webstorm", label: "WebStorm", icon: webstorm },
    { id: "pycharm", label: "PyCharm", icon: pycharm },
    { id: "goland", label: "GoLand", icon: goland },
    { id: "rider", label: "Rider", icon: rider },
    { id: "fleet", label: "Fleet", icon: fleet },
    { id: "studio", label: "Android Studio", icon: androidStudio },
    { id: "trae", label: "Trae", icon: trae },
    { id: "antigravity", label: "Antigravity", icon: antigravity },
    { id: "lapce", label: "Lapce", icon: lapce },
    { id: "nvim", label: "Neovim", icon: neovim },
    { id: "hx", label: "Helix", icon: helix },
    { id: "emacs", label: "Emacs", icon: emacs },
    { id: "vim", label: "Vim", icon: vim },
    { id: "explorer", label: "Explorer", icon: windows },
];

export function OpenInMenu({ path }: { path?: string | null } = {}) {
    const { project_path } = useProjectState();
    const target = path || project_path;

    const open = async (app: string) => {
        if (!target) {
            notify.error("Open a project first");
            return;
        }
        try {
            await commands.openInApp(app, target);
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
    }, [target]);

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
                        <BrandIcon icon={cursor} />
                        <span>Open</span>
                        <Icon icon={ChevronDown20Regular} className="opacity-60" />
                    </Button>
                </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end" className="max-h-80 min-w-48 overflow-y-auto">
                {OPEN_TARGETS.map((app) => (
                    <DropdownMenuItem key={app.id} onClick={() => void open(app.id)}>
                        <BrandIcon icon={app.icon} />
                        <span className="flex-1">{app.label}</span>
                        {app.id === "cursor" ? (
                            <span className="text-xs text-text-muted">Ctrl+O</span>
                        ) : null}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

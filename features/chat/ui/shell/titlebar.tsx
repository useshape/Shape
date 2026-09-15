"use client";

import { RiGitPullRequestLine, RiLayoutBottomLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, ICON_SIZE_MD } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { Breadcrumb, BreadcrumbItem } from "@/components/base/breadcrumb/breadcrumb";
import { getRepoName } from "@/lib/repo-history";
import { useProjectState } from "@/lib/backend";
import { ProjectKindGlyph } from "@/features/detection/ui/kind-glyph";
import { AGENT_CHROME_ACTIONS_SLOT, RunDevButton } from "@/features/agent/chrome";
import { ChatHistoryMenu } from "./history";
import { OpenInMenu } from "./open-in";
import { ProjectQuickPick } from "./project-pick";
import { Button } from "@/components/ui/button";

export function ChatTitlebar({
    title,
    conversationId,
    onSelect,
}: {
    title: string;
    conversationId: string | null;
    recentIds: string[];
    timestamp?: number | null;
    onSelect: (id: string) => void;
}) {
    const { project_path } = useProjectState();
    const repo = project_path ? getRepoName(project_path) : null;
    const [pickOpen, setPickOpen] = useState(false);
    const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
    const [terminalOpen, setTerminalOpen] = useState(false);

    useEffect(() => {
        const find = () => {
            const el = document.getElementById(AGENT_CHROME_ACTIONS_SLOT);
            setActionsSlot(el && el.isConnected ? el : null);
        };
        find();
        const timer = window.setInterval(find, 200);
        const stop = window.setTimeout(() => window.clearInterval(timer), 4000);
        return () => {
            window.clearInterval(timer);
            window.clearTimeout(stop);
        };
    }, []);

    useEffect(() => {
        try {
            setTerminalOpen(localStorage.getItem("shape-agent-terminal-open") === "true");
        } catch {
            /* ignore */
        }
        const onOpen = (e: Event) => {
            const open = (e as CustomEvent<{ open?: boolean }>).detail?.open;
            if (typeof open === "boolean") setTerminalOpen(open);
        };
        window.addEventListener("shape-terminal-open", onOpen as EventListener);
        return () => window.removeEventListener("shape-terminal-open", onOpen as EventListener);
    }, []);

    const toggleTerminal = () => {
        window.dispatchEvent(
            new CustomEvent("shape-layout-toggle", {
                detail: { id: "terminal", value: !terminalOpen },
            }),
        );
    };

    const actions = (
        <div className="flex items-center gap-2">
            <RunDevButton />
            <OpenInMenu />
            <Tooltip content="Pull requests">
                <Button
                    variant="outline"
                    size="sm"
                    aria-label="Pull requests"
                    onClick={() => window.dispatchEvent(new Event("shape-open-pull-requests"))}
                    className="size-7 text-text-muted hover:bg-panel-hover hover:text-text-primary"
                >
                    <Icon icon={RiGitPullRequestLine} size={ICON_SIZE_MD} />
                </Button>
            </Tooltip>
            <Tooltip content={terminalOpen ? "Hide terminal" : "Show terminal"}>
                <button
                    type="button"
                    aria-label={terminalOpen ? "Hide terminal" : "Show terminal"}
                    aria-pressed={terminalOpen}
                    onClick={toggleTerminal}
                    className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary data-[active=true]:text-text-primary"
                    data-active={terminalOpen}
                >
                    <Icon icon={RiLayoutBottomLine} />
                </button>
            </Tooltip>
        </div>
    );

    return (
        <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden">
            <div className="shrink-0 pr-1" data-no-drag>
                <ChatHistoryMenu
                    activeConversationId={conversationId}
                    onSelectConversation={(id) => onSelect(id)}
                    projectPath={project_path}
                    align="start"
                />
            </div>
            <div className="min-w-0 max-w-full" data-no-drag>
            <Breadcrumb className="min-w-0" aria-label="Project">
                {repo ? (
                    <BreadcrumbItem onClick={() => setPickOpen(true)}>
                        <ProjectKindGlyph path={project_path} className="size-5" />
                        {repo}
                    </BreadcrumbItem>
                ) : null}
                <BreadcrumbItem current className="min-w-0 truncate">
                    {title}
                </BreadcrumbItem>
            </Breadcrumb>
            </div>
            <ProjectQuickPick open={pickOpen} onOpenChange={setPickOpen} />
            {actionsSlot && actionsSlot.isConnected ? createPortal(actions, actionsSlot) : null}
        </div>
    );
}

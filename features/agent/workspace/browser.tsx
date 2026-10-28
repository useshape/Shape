"use client";

import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { BrowseStage } from "@/features/chat/ui/blocks/browse-frame";
import { useBrowseFrame } from "@/features/agent/browser/session";
import { commands } from "@/lib/backend";

/** Watch the agent's browser. There is no address bar, tabs, or manual navigation. */
export function BrowserView() {
    const frame = useBrowseFrame();
    const live = !!frame && frame.status !== "stopped";

    return (
        <div className="flex h-full min-h-0 flex-col bg-editor">
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle px-2">
                <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                    {live ? frame.title || frame.url || "The agent is browsing" : "Agent browser"}
                </span>
                {live ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Stop the agent browser"
                        onClick={() => {
                            void commands.agentBrowseStop();
                        }}
                    >
                        <Icon icon={Dismiss20Regular} />
                    </Button>
                ) : null}
            </div>
            {live && frame.image ? (
                <BrowseStage frame={frame} className="min-h-0 flex-1" />
            ) : (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-muted">
                    {live ? "Opening the page…" : "The agent opens pages from chat. You can watch them there and stop it."}
                </div>
            )}
        </div>
    );
}

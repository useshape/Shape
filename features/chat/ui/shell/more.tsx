"use client";

import { MoreHorizontal20Regular } from "@fluentui/react-icons/headless/svg/more-horizontal";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";


import { Icon } from "@/components/ui/icon";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { notify } from "@/features/notifications";

async function downloadDiagnostics() {
    const payload = {
        exportedAt: new Date().toISOString(),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        platform: typeof navigator !== "undefined" ? navigator.platform : "",
        url: typeof window !== "undefined" ? window.location.href : "",
    };
    const json = JSON.stringify(payload, null, 2);
    const src = `data:application/json;base64,${btoa(unescape(encodeURIComponent(json)))}`;
    try {
        const { saveDownload } = await import("@/lib/ui/save-download");
        const saved = await saveDownload(`shape-diagnostics-${Date.now()}.json`, src, "application/json");
        if (saved) notify.success("Diagnostics", "Diagnostic bundle saved.");
    } catch (err) {
        notify.error("Diagnostics", err instanceof Error ? err.message : String(err));
    }
}

export function ChatMoreMenu() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-text-muted hover:text-text-primary">
                    <Icon icon={MoreHorizontal20Regular} />
                </Button>
            </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                    className="gap-2.5"
                    onClick={() => {
                        window.dispatchEvent(
                            new CustomEvent("shape-command-palette", {
                                detail: {
                                    filter: "agents",
                                    placeholder: "Search agents, files, actions...",
                                },
                            }),
                        );
                    }}
                >
                    <Icon icon={Search20Regular} className="text-text-secondary" />
                    Search history…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => void openSettingsWindow({ category: "general" })}
                >
                    Usage
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void downloadDiagnostics()}>
                    Download Diagnostics
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => void openSettingsWindow({ category: "ai", section: "rules" })}
                >
                    Configure Rules
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => void openSettingsWindow({ category: "ai", section: "workflows" })}
                >
                    Configure Workflows
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => void openSettingsWindow({ category: "agents", section: "mcp" })}
                >
                    Configure MCP
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

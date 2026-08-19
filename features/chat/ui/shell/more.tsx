"use client";

import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { openSettingsWindow } from "@/lib/open-settings";
import { openMcpConfig } from "@/lib/mcp-config";
import { notify } from "@/features/notifications";

async function downloadDiagnostics() {
    const payload = {
        exportedAt: new Date().toISOString(),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        platform: typeof navigator !== "undefined" ? navigator.platform : "",
        url: typeof window !== "undefined" ? window.location.href : "",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `shape-diagnostics-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify.success("Diagnostics", "Diagnostic bundle downloaded.");
}

export function ChatMoreMenu() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-text-muted hover:text-text-primary">
                    <Icon name="more_horiz" size={16} />
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
                    <Icon name="search" size={16} className="text-text-secondary" />
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
                    onClick={() => void openSettingsWindow({ category: "ai", section: "rules" })}
                >
                    Configure Workflows
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void openMcpConfig()}>
                    Configure MCP
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

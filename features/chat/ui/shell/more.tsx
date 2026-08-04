"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { openSettingsWindow } from "@/lib/open-settings";
import { openMcpConfig, loadMcpServersFromFile } from "@/lib/mcp-config";
import { openShapeBilling } from "@/lib/shape-auth/store";
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
    const [mcpCount, setMcpCount] = useState(0);

    const refreshMcpCount = useCallback(async () => {
        try {
            const servers = await loadMcpServersFromFile();
            setMcpCount(servers.filter((s) => s.enabled).length);
        } catch {
            setMcpCount(0);
        }
    }, []);

    useEffect(() => {
        void refreshMcpCount();
    }, [refreshMcpCount]);

    return (
        <DropdownMenu onOpenChange={(open) => { if (open) void refreshMcpCount(); }}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-text-muted hover:text-text-primary">
                    <Icon name="more_horiz" size={16} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1">
                <DropdownMenuItem
                    className="gap-2.5"
                    onClick={() => void openSettingsWindow({ category: "general" })}
                >
                    <Icon name="tune" size={16} className="text-text-secondary" />
                    Usage
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2.5" onClick={() => void downloadDiagnostics()}>
                    <Icon name="bug_report" size={16} className="text-text-secondary" />
                    Download Diagnostics
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className="gap-2.5"
                    onClick={() => void openSettingsWindow({ category: "ai", section: "rules" })}
                >
                    <Icon name="list_alt" size={16} className="text-text-secondary" />
                    Configure Rules
                </DropdownMenuItem>
                <DropdownMenuItem
                    className="gap-2.5"
                    onClick={() => void openSettingsWindow({ category: "ai", section: "rules" })}
                >
                    <Icon name="account_tree" size={16} className="text-text-secondary" />
                    Configure Workflows
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="flex items-center justify-between px-2 py-1.5 text-xs text-text-muted">
                    <div className="flex items-center gap-1.5">
                        <span>{mcpCount} MCP{mcpCount === 1 ? "" : "s"}</span>
                        <Tooltip content="Model Context Protocol servers configured in mcp.json">
                            <button type="button" className="text-text-muted hover:text-text-primary">
                                <Icon name="info" size={12} />
                            </button>
                        </Tooltip>
                    </div>
                    <div className="flex items-center gap-0.5">
                        <Tooltip content="Edit MCP configuration">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => void openMcpConfig()}
                            >
                                <Icon name="link" size={14} />
                            </Button>
                        </Tooltip>
                        <Tooltip content="Manage plan & billing">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => openShapeBilling()}
                            >
                                <Icon name="tune" size={14} />
                            </Button>
                        </Tooltip>
                    </div>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

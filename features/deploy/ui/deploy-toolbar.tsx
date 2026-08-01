"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { commands, useProjectState } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { cn } from "@/lib/utils";
import { DEPLOY_TARGETS, detectDeployTarget, runDeployCommand } from "../lib/detect";

export function DeployToolbarButton({
    variant = "icon",
    className,
}: {
    variant?: "icon" | "status";
    className?: string;
}) {
    const { project_path } = useProjectState();
    const [detected, setDetected] = useState<(typeof DEPLOY_TARGETS)[number] | null>(null);

    useEffect(() => {
        if (!project_path) {
            setDetected(null);
            return;
        }
        void detectDeployTarget(project_path, commands.lsDir, commands.readFile).then(setDetected);
    }, [project_path]);

    const deploy = useCallback(
        (command: string) => {
            runDeployCommand(command);
            notify.info("Deploy", "Deploy started — watch Output → Deploy for logs.");
        },
        []
    );

    const openDashboard = useCallback(async (url?: string) => {
        if (url) await commands.openUrlExternal(url);
    }, []);

    const trigger =
        variant === "status" ? (
            <Button
                variant="ghost"
                size="sm"
                className={cn("gap-1 text-text-primary font-light", className)}
                disabled={!project_path}
            >
                <Icon name="rocket_launch" size={14} className="shrink-0" />
                <span>Deploy</span>
                <Icon name="expand_more" size={14} className="shrink-0 opacity-70" />
            </Button>
        ) : (
            <Button variant="ghost" size="icon" className={cn("text-text-muted", className)} disabled={!project_path}>
                <Icon name="rocket_launch" size={16} />
            </Button>
        );

    return (
        <DropdownMenu>
            <Tooltip content={detected ? `Deploy (${detected.label})` : "Deploy project"} side="top">
                <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-52">
                {detected && (
                    <>
                        <DropdownMenuItem onClick={() => deploy(detected.command)}>
                            <Icon name="rocket_launch" size={16} className="size-4 shrink-0 text-accent" />
                            Deploy to {detected.label}
                        </DropdownMenuItem>
                        {detected.dashboardUrl && (
                            <DropdownMenuItem onClick={() => void openDashboard(detected.dashboardUrl)}>
                                <Icon name="open_in_new" size={16} className="size-4 shrink-0 opacity-70" />
                                Open {detected.label} dashboard
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                    </>
                )}
                {DEPLOY_TARGETS.filter((t) => t.id !== "script").map((target) => (
                    <DropdownMenuItem key={target.id} onClick={() => deploy(target.command)}>
                        <Icon name="cloud_upload" size={16} className="size-4 shrink-0 opacity-70" />
                        {target.label}
                        {!detected && target.id === "vercel" ? " (detected on deploy)" : ""}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() =>
                        deploy("npx vercel --yes")
                    }
                >
                    Quick deploy (Vercel)
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

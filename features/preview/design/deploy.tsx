"use client";

import { useEffect, useState } from "react";
import { RiArrowRightSLine, RiCheckLine, RiCloudLine, RiErrorWarningLine } from "@remixicon/react";
import {
    AlertDialog,
    AlertDialogBody,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon, ICON_SIZE_MD, ICON_SIZE_SM } from "@/components/ui/icon";
import { useGitBranch } from "@/features/agent/workbench/hooks/use-git-branch";
import { getRepoName } from "@/lib/workspace/repo-history";

type Stage = "unpublished" | "staged" | "live";

const CHANGE_GROUPS = [
    { label: "8 classes and/or components" },
    { label: "4 page changes" },
    { label: "1 CMS" },
    { label: "5 code and/or settings" },
] as const;

function Changes({
    title,
    count,
    badge,
}: {
    title: string;
    count: number;
    badge: string;
}) {
    return (
        <div className="squircle-2xl bg-panel-hover">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                <p className="min-w-0 truncate text-md font-medium text-text-primary">{title}</p>
                <span className="shrink-0 squircle-2xl bg-blue-500/20 px-2 py-0.5 text-sm text-blue-300">
                    {badge}
                </span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1.5">
                <Icon icon={RiArrowRightSLine} size={ICON_SIZE_MD} className="text-text-secondary!" />
                <span className="text-sm text-text-secondary">{count} changes</span>
            </div>
            <div className="divide-y divide-border border-t border-border">
                {CHANGE_GROUPS.map((group) => (
                    <div key={group.label} className="px-3 py-1.5 text-sm text-text-secondary">
                        {group.label}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function DesignDeploy({
    open,
    onClose,
    projectPath,
}: {
    open: boolean;
    onClose: () => void;
    projectPath: string;
}) {
    const name = getRepoName(projectPath).toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "app";
    const branch = useGitBranch(projectPath) ?? "main";
    const [stage, setStage] = useState<Stage>("unpublished");
    const stagingHost = `${name}-staging.example.com`;
    const productionHost = `${name}.example.com`;

    useEffect(() => {
        if (open) setStage("unpublished");
    }, [open]);

    const title =
        stage === "unpublished" ? "Publish" : stage === "staged" ? "Staging" : "Production";
    const description =
        stage === "unpublished"
            ? `${name} · ${branch}`
            : stage === "staged"
              ? stagingHost
              : productionHost;

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <AlertDialogContent
                sizeClassName="max-w-[440px] bg-surface-4/95 backdrop-blur-xl"
                onOpenAutoFocus={(event) => event.preventDefault()}
            >
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-md">
                        {title}
                    </AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogBody className="space-y-2">
                    {stage === "unpublished" ? (
                        <>
                            <Changes title={`${name} · ${branch}`} count={18} badge="New" />
                            <div className="flex items-center gap-1 text-md text-text-muted">
                                <Icon icon={RiErrorWarningLine} size={ICON_SIZE_MD} />
                                Errors and issues
                            </div>
                        </>
                    ) : null}
                    {stage === "staged" ? (
                        <Changes title={stagingHost} count={30} badge="Staged" />
                    ) : null}
                    {stage === "live" ? (
                        <div className="flex items-center justify-between px-3 py-1.5 bg-panel-hover squircle-2xl">
                            <div className="min-w-0">
                                <p className="truncate text-sm text-text-primary">{productionHost}</p>
                                <p className="text-2xs text-text-muted">Live</p>
                            </div>
                            <Icon icon={RiCheckLine} size={ICON_SIZE_MD} className="text-success" />
                        </div>
                    ) : null}
                </AlertDialogBody>
                <AlertDialogFooter>
                    <AlertDialogCancel asChild>
                        <Button type="button" variant="secondary" size="md" className="w-full bg-panel-hover">
                            Close
                        </Button>
                    </AlertDialogCancel>
                    {stage === "unpublished" ? (
                        <Button type="button" variant="default" size="md" className="w-full" onClick={() => setStage("staged")}>
                            Publish to staging
                        </Button>
                    ) : null}
                    {stage === "staged" ? (
                        <Button type="button" variant="default" size="md" className="w-full" onClick={() => setStage("live")}>
                            Publish to production
                        </Button>
                    ) : null}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

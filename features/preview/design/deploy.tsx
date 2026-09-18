"use client";

import { useEffect, useState } from "react";
import {
    RiCheckLine,
    RiCloudLine,
    RiExternalLinkLine,
    RiFlashlightLine,
    RiGitBranchLine,
    RiLoader4Line,
} from "@remixicon/react";
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
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { PluginLogo } from "@/components/ui/plugin-logo";
import { useGitBranch } from "@/features/workbench/hooks/use-git-branch";
import { cn } from "@/lib/utils";
import { getRepoName } from "@/lib/repo-history";

const PROVIDERS = [
    { id: "vercel", name: "Vercel", toolkit: "vercel", suffix: "vercel.app", region: "iad1", build: "next build" },
    { id: "netlify", name: "Netlify", toolkit: "netlify", suffix: "netlify.app", region: "us-east-1", build: "npm run build" },
    { id: "cloudflare", name: "Cloudflare", toolkit: "cloudflare", suffix: "pages.dev", region: "wnam", build: "npx wrangler pages deploy" },
    { id: "railway", name: "Railway", toolkit: "railway", suffix: "up.railway.app", region: "us-west", build: "npm run start" },
    { id: "render", name: "Render", toolkit: "render", suffix: "onrender.com", region: "oregon", build: "npm run build" },
    { id: "fly", name: "Fly.io", toolkit: "flyio", suffix: "fly.dev", region: "sjc", build: "fly deploy" },
] as const;

type Status = "idle" | "connecting" | "uploading" | "building" | "assigning" | "ready";

const STEPS: Array<Exclude<Status, "idle">> = ["connecting", "uploading", "building", "assigning", "ready"];

const LOGS: Record<Exclude<Status, "idle">, string[]> = {
    connecting: ["Authorizing with provider"],
    uploading: ["Uploading 248 files"],
    building: ["Installing dependencies", "Compiled successfully"],
    assigning: ["Assigning production domain"],
    ready: ["Deployment ready"],
};

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
    const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>(PROVIDERS[0]);
    const [status, setStatus] = useState<Status>("idle");
    const [env, setEnv] = useState<"Production" | "Preview">("Production");
    const url = `https://${name}.${provider.suffix}`;
    const busy = status !== "idle" && status !== "ready";

    useEffect(() => {
        if (!open) setStatus("idle");
    }, [open]);

    useEffect(() => {
        if (status === "idle" || status === "ready") return;
        const index = STEPS.indexOf(status);
        const next = STEPS[index + 1] ?? "ready";
        const timer = window.setTimeout(() => setStatus(next), status === "building" ? 1400 : 600);
        return () => window.clearTimeout(timer);
    }, [status]);

    const log =
        status === "idle"
            ? []
            : STEPS.slice(0, Math.max(0, STEPS.indexOf(status as Exclude<Status, "idle">) + 1)).flatMap((step) => LOGS[step]);

    return (
        <AlertDialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
            <AlertDialogContent sizeClassName="max-w-[440px]" onOpenAutoFocus={(event) => event.preventDefault()}>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-md">
                        Deploy
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        Local preview of the hosting flow. Nothing is published.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogBody className="space-y-3">
                    <div className="flex gap-1">
                        {PROVIDERS.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                title={item.name}
                                disabled={busy}
                                onClick={() => {
                                    setProvider(item);
                                    setStatus("idle");
                                }}
                                className={cn(
                                    "flex size-8 items-center w-full h-15 justify-center rounded-md bg-panel-hover",
                                    provider.id === item.id
                                        ? "bg-scrollbar-hover"
                                        : "hover:bg-scrollbar-hover",
                                )}
                            >
                                <PluginLogo toolkit={item.toolkit} name={item.name} size={16} className="rounded-none" />
                            </button>
                        ))}
                    </div>

                    <div className="flex rounded-lg border border-border p-0.5">
                        {(["Production", "Preview"] as const).map((item) => (
                            <button
                                key={item}
                                type="button"
                                disabled={busy}
                                onClick={() => setEnv(item)}
                                className={cn(
                                    "h-8 flex-1 rounded-md text-sm,",
                                    env === item ? "bg-panel-hover text-text-primary" : "text-text-muted",
                                )}
                            >
                                {item}
                            </button>
                        ))}
                    </div>

                    <div className="pb-2">
                        <p className="truncate text-sm text-text-primary">{url}</p>
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-text-muted">
                            <span className="flex items-center gap-1">
                                <Icon icon={RiGitBranchLine} size={ICON_SIZE_SM} />
                                {branch}
                            </span>
                            <span>{provider.region}</span>
                            <span className="ml-auto flex items-center gap-1">
                                {status === "ready" ? (
                                    <>
                                        <Icon icon={RiCheckLine} size={ICON_SIZE_SM} className="text-success" />
                                        Ready
                                    </>
                                ) : busy ? (
                                    <>
                                        <Icon icon={RiLoader4Line} size={ICON_SIZE_SM} className="animate-spin" />
                                        {status[0].toUpperCase() + status.slice(1)}
                                    </>
                                ) : (
                                    "Not deployed"
                                )}
                            </span>
                        </div>
                    </div>

                    <div className="max-h-24 overflow-y-auto text-md text-text-muted">
                        {(log.length ? log : ["Waiting to deploy"]).map((line) => (
                            <p key={line}>{line}</p>
                        ))}
                    </div>
                </AlertDialogBody>
                <AlertDialogFooter>
                    <AlertDialogCancel asChild>
                        <Button type="button" variant="ghost" size="sm">
                            Close
                        </Button>
                    </AlertDialogCancel>
                    {status === "ready" ? (
                        <Button type="button" variant="secondary" size="sm" disabled>
                            <Icon icon={RiExternalLinkLine} size={ICON_SIZE_SM} />
                            Visit
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="default"
                            size="sm"
                            disabled={busy}
                            onClick={() => setStatus("connecting")}
                        >
                            <Icon icon={status === "idle" ? RiFlashlightLine : RiLoader4Line} size={ICON_SIZE_SM} className={busy ? "animate-spin" : undefined} />
                            {status === "idle" ? "Deploy" : "Deploying…"}
                        </Button>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

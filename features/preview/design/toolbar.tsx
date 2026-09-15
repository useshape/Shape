"use client";

import {
    RiArrowDownSLine,
    RiCheckLine,
    RiCloseLine,
    RiCloudLine,
    RiCodeLine,
    RiMoreLine,
    RiRefreshLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { PluginLogo } from "@/components/ui/plugin-logo";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { ProjectKindGlyph } from "@/features/detection/ui/kind-glyph";
import { useWindowControls } from "@/features/workbench/titlebar/hooks/use-window-controls";
import { WindowControls } from "@/features/workbench/titlebar/ui/window-controls";
import { getRepoName } from "@/lib/repo-history";

const DEPLOY_PROVIDERS = [
    { name: "Vercel", toolkit: "vercel" },
    { name: "Netlify", toolkit: "netlify" },
    { name: "Cloudflare Pages", toolkit: "cloudflare" },
    { name: "Railway", toolkit: "railway" },
    { name: "Render", toolkit: "render" },
    { name: "Fly.io", toolkit: "flyio" },
    { name: "AWS Amplify", toolkit: "awsamplify" },
    { name: "Firebase", toolkit: "firebase" },
    { name: "GitHub Pages", toolkit: "github" },
    { name: "Framer", toolkit: "framer" },
] as const;

export function DesignToolbar({
    onClose,
    projectPath,
    pages,
    activePage,
    onPageChange,
    onReload,
    onOpenCode,
    saved,
}: {
    onClose: () => void;
    projectPath: string;
    pages: Array<{ path: string; label: string }>;
    activePage: string;
    onPageChange: (path: string) => void;
    onReload: () => void;
    onOpenCode: () => void;
    saved: boolean;
}) {
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();
    const projectName = getRepoName(projectPath);

    return (
        <div
            className="relative flex h-titlebar shrink-0 items-stretch border-b border-border bg-panel"
            data-tauri-drag-region
        >
            <div className="relative z-10 flex h-full min-w-0 items-center gap-1 pl-1" data-no-drag>
                <Button variant="ghost" size="icon" aria-label="Close designer" onClick={onClose}>
                    <Icon icon={RiCloseLine} size={ICON_SIZE_SM} />
                </Button>
                <div className="mx-1 h-4 w-px bg-border-subtle" />
                <ProjectKindGlyph path={projectPath} className="size-4" />
                <span className="max-w-44 truncate text-sm font-medium text-text-primary">
                    {projectName}
                </span>
                <span className="flex items-center gap-1 text-xs text-text-muted">
                    <Icon icon={RiCheckLine} size={12} className={saved ? "text-success" : "text-text-muted"} />
                    {saved ? "Saved" : "Saving"}
                </span>
            </div>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="pointer-events-auto flex items-center" data-no-drag>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                                {pages.find((page) => page.path === activePage)?.label ?? "Home"}
                                <Icon icon={RiArrowDownSLine} size={12} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="min-w-52">
                            <DropdownMenuLabel>Pages</DropdownMenuLabel>
                            {pages.map((page) => (
                                <DropdownMenuItem key={page.path} onClick={() => onPageChange(page.path)}>
                                    <span className="min-w-0 flex-1 truncate">{page.label}</span>
                                    <span className="text-xs text-text-muted">{page.path}</span>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className="relative z-10 ml-auto flex h-full items-center gap-0.5 pr-0" data-no-drag>
                <Tooltip content="Reload preview">
                    <Button variant="ghost" size="icon" onClick={onReload} aria-label="Reload preview">
                        <Icon icon={RiRefreshLine} size={ICON_SIZE_SM} />
                    </Button>
                </Tooltip>
                <Tooltip content="Open selected source">
                    <Button variant="ghost" size="icon" onClick={onOpenCode} aria-label="Open selected source">
                        <Icon icon={RiCodeLine} size={ICON_SIZE_SM} />
                    </Button>
                </Tooltip>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="secondary" size="sm" className="ml-1 h-7 gap-1.5">
                            <Icon icon={RiCloudLine} size={ICON_SIZE_SM} />
                            Deploy
                            <Icon icon={RiArrowDownSLine} size={12} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                        <DropdownMenuLabel>Deploy this project</DropdownMenuLabel>
                        <p className="px-2 pb-2 text-xs leading-relaxed text-text-muted">
                            Choose a host. Connections are coming soon.
                        </p>
                        <DropdownMenuSeparator />
                        <div className="grid grid-cols-2 gap-0.5">
                            {DEPLOY_PROVIDERS.map((provider) => (
                                <DropdownMenuItem
                                    key={provider.name}
                                    className="min-w-0"
                                    onSelect={(event) => event.preventDefault()}
                                >
                                    <PluginLogo
                                        toolkit={provider.toolkit}
                                        name={provider.name}
                                        size={16}
                                        className="rounded-none"
                                    />
                                    <span className="truncate">{provider.name}</span>
                                </DropdownMenuItem>
                            ))}
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Designer menu">
                            <Icon icon={RiMoreLine} size={ICON_SIZE_SM} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={onReload}>Reload canvas</DropdownMenuItem>
                        <DropdownMenuItem onClick={onOpenCode}>Open source</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onClose}>Exit designer</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <WindowControls
                    isMaximized={isMaximized}
                    onMinimize={minimize}
                    onToggleMaximize={toggleMaximize}
                    onClose={close}
                />
            </div>
        </div>
    );
}

"use client";

import { lazy, Suspense, useCallback, useEffect, useRef } from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { commands } from "@/lib/backend";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
    getLastDevUrl,
    getPreviewCurrentUrl,
    navigatePreview,
    previewBack,
    previewForward,
    previewReload,
    setPreviewUrlBar,
    usePreviewStore,
} from "@/features/preview/store";
import { ToolBtn } from "./tool";

const PreviewPanel = lazy(() => import("@/features/preview/ui/preview-panel"));

export function BrowserView() {
    const { history, index, urlBar, iframeSrc } = usePreviewStore();
    const inputRef = useRef<HTMLInputElement>(null);
    const canBack = index > 0;
    const canForward = index >= 0 && index < history.length - 1;
    const currentUrl = getPreviewCurrentUrl();

    const go = useCallback(
        (e?: React.FormEvent) => {
            e?.preventDefault();
            void navigatePreview(urlBar || "http://localhost:3000");
        },
        [urlBar],
    );

    useEffect(() => {
        const last = getLastDevUrl();
        if (last && !urlBar) setPreviewUrlBar(last);
    }, [urlBar]);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border-subtle px-1">
                <ToolBtn label="Back" disabled={!canBack} onClick={() => previewBack()}>
                    <Icon name="arrow_back" size={ICON_SIZE_SM} />
                </ToolBtn>
                <ToolBtn label="Forward" disabled={!canForward} onClick={() => previewForward()}>
                    <Icon name="arrow_forward" size={ICON_SIZE_SM} />
                </ToolBtn>
                <ToolBtn label="Reload" onClick={() => previewReload()}>
                    <Icon name="refresh" size={ICON_SIZE_SM} />
                </ToolBtn>
                <ToolBtn label="Bookmark">
                    <Icon name="star_border" size={ICON_SIZE_SM} />
                </ToolBtn>
                <form onSubmit={go} className="mx-1 min-w-0 flex-1">
                    <input
                        ref={inputRef}
                        type="text"
                        value={urlBar}
                        onChange={(e) => setPreviewUrlBar(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        placeholder="Search or enter URL"
                        spellCheck={false}
                        className={cn(
                            "h-6 w-full rounded-md bg-surface-1 px-2 text-2xs text-text-primary",
                            "outline-none placeholder:text-text-muted",
                        )}
                    />
                </form>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="flex size-7 items-center justify-center rounded text-text-muted hover:bg-panel-hover"
                            aria-label="More"
                        >
                            <Icon name="more_horiz" size={ICON_SIZE_SM} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                            onClick={() => {
                                const url = currentUrl || urlBar;
                                if (url) void commands.openUrlExternal(url);
                            }}
                        >
                            Open externally
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => previewReload()}>Hard Reload</DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => {
                                const url = currentUrl || urlBar;
                                if (url) void navigator.clipboard.writeText(url);
                            }}
                        >
                            Copy Current URL
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="min-h-0 flex-1">
                {iframeSrc ? (
                    <Suspense fallback={<div className="h-full bg-panel" />}>
                        <PreviewPanel hideToolbar />
                    </Suspense>
                ) : (
                    <div className="flex h-full flex-col items-center justify-center text-text-muted">
                        <p className="text-sm">Recents</p>
                    </div>
                )}
            </div>
        </div>
    );
}

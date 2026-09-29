"use client";

import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { WindowConsole20Regular } from "@fluentui/react-icons/headless/svg/window-console";



import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";


import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend";
import { useBrowseFrame, type BrowseFrame } from "@/features/agent/browser/session";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PAGE_W = 1280;
const PAGE_H = 720;

function fitPage(width: number, height: number) {
    const scale = Math.min(width / PAGE_W, height / PAGE_H);
    const w = PAGE_W * scale;
    const h = PAGE_H * scale;
    return { left: (width - w) / 2, top: (height - h) / 2, width: w, height: h, scale };
}

export function BrowseStage({
    frame,
    className,
    interactive = false,
    fill = false,
    natural = false,
}: {
    frame: Pick<BrowseFrame, "image" | "x" | "y" | "title" | "url" | "status" | "error">;
    className?: string;
    interactive?: boolean;
    fill?: boolean;
    /** Size the card to the screenshot so nothing is cropped or letterboxed. */
    natural?: boolean;
}) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState({ w: 0, h: 0 });
    const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
    const status = frame.status || (frame.image ? "controlling" : "loading");
    const cursor = pointer ?? { x: frame.x, y: frame.y };

    useEffect(() => {
        const el = hostRef.current;
        if (!el) return;
        const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
        measure();
        const obs = new ResizeObserver(measure);
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const fitted = fitPage(box.w, box.h);
    const place = (percentX: number, percentY: number) => ({
        left: fitted.left + (percentX / 100) * fitted.width,
        top: fitted.top + (percentY / 100) * fitted.height,
    });

    const readPoint = (event: React.PointerEvent<HTMLDivElement>) => {
        const host = hostRef.current;
        if (!host) return null;
        const bounds = host.getBoundingClientRect();
        const rect = fitPage(bounds.width, bounds.height);
        const x = event.clientX - bounds.left - rect.left;
        const y = event.clientY - bounds.top - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
        return { x: (x / rect.width) * 100, y: (y / rect.height) * 100 };
    };

    const spot = (fill || natural) && box.w > 0
        ? { left: (cursor.x / 100) * box.w, top: (cursor.y / 100) * box.h }
        : place(cursor.x, cursor.y);
    if (!frame.image) return null;

    return (
        <div
            ref={hostRef}
            className={cn(
                natural ? "relative w-full" : "relative overflow-hidden bg-editor",
                interactive && status === "controlling" && "cursor-none",
                className,
            )}
            onPointerMove={interactive ? (event) => {
                const next = readPoint(event);
                setPointer(next);
            } : undefined}
            onPointerLeave={interactive ? () => setPointer(null) : undefined}
            onPointerDown={interactive && status === "controlling" ? (event) => {
                const next = readPoint(event);
                if (!next) return;
                setPointer(next);
                void commands.agentBrowsePointer("click", next.x, next.y);
            } : undefined}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={frame.image}
                alt=""
                draggable={false}
                className={cn(
                    natural ? "block h-auto w-full" : "absolute inset-0 h-full w-full",
                    !natural && (fill ? "object-cover" : "object-contain"),
                )}
            />
            {status === "controlling" && frame.image ? (
                <svg
                    className="pointer-events-none absolute z-10 text-text-primary"
                    style={{
                        left: spot.left,
                        top: spot.top,
                        transition: pointer ? "none" : "left 180ms cubic-bezier(.2,.7,.2,1), top 180ms cubic-bezier(.2,.7,.2,1)",
                        filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.45))",
                    }}
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="white"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                    aria-hidden
                >
                    <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />
                </svg>
            ) : null}
        </div>
    );
}

export function BrowseChatCard({
    url,
    title,
    status,
    image,
    x,
    y,
    consoleLines,
    followLive = false,
}: {
    url?: string;
    title?: string;
    status?: string;
    image?: string;
    x?: number;
    y?: number;
    consoleLines?: string[];
    followLive?: boolean;
}) {
    const live = useBrowseFrame();
    const driving = followLive && !!live && (live.status === "controlling" || live.status === "loading");
    const mirror = driving ? live : null;
    const savedStatus = (status as BrowseFrame["status"]) || "stopped";
    const frame = {
        image: mirror?.image || image || "",
        x: mirror?.x ?? x ?? 50,
        y: mirror?.y ?? y ?? 50,
        title: mirror?.title || title || "Browser",
        url: mirror?.url || url || "",
        status: (mirror?.status || (savedStatus === "error" ? "error" : "stopped")) as BrowseFrame["status"],
        error: mirror?.error || "",
    };
    const controlling = frame.status === "controlling" || frame.status === "loading";
    const lines = (mirror?.console?.length ? mirror.console : consoleLines) || [];
    const [consoleOpen, setConsoleOpen] = useState(false);

    if (!frame.image.trim()) return null;

    return (
        <div className="w-full max-w-[300px]">
            <div className="relative">
                <BrowseStage frame={frame} natural className="overflow-hidden rounded-lg border border-border-subtle shadow-md/60" />
                {controlling ? (
                    <button
                        type="button"
                        aria-label="Stop the agent browser"
                        className="absolute right-2 top-2 z-20 flex size-6 items-center justify-center rounded-md bg-surface-1/90 text-text-primary"
                        onClick={() => {
                            void commands.agentBrowseStop();
                            void commands.stopChatMessage();
                        }}
                    >
                        <Icon icon={Dismiss20Regular} />
                    </button>
                ) : null}
                {lines.length ? (
                    <button
                        type="button"
                        className="absolute bottom-2 left-2 z-20 inline-flex items-center gap-1 rounded-md bg-surface-1/90 px-1.5 py-0.5 text-xs text-text-secondary"
                        onClick={() => setConsoleOpen((open) => !open)}
                    >
                        <Icon icon={WindowConsole20Regular} />
                        Console
                    </button>
                ) : null}
            </div>
            {consoleOpen ? (
                <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-surface-3 p-2 font-mono text-2xs text-text-secondary">
                    {lines.join("\n")}
                </pre>
            ) : null}
        </div>
    );
}

export function AgentControlBar() {
    const frame = useBrowseFrame();
    const [confirm, setConfirm] = useState(false);
    if (!frame || frame.status === "stopped") return null;

    return (
        <>
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-2 px-2">
                <span className="min-w-0 flex-1 truncate text-xs text-text-primary">The agent is controlling this tab</span>
                <Button type="button" variant="ghost" size="icon" aria-label="Stop agent control" onClick={() => setConfirm(true)}>
                    <Icon icon={Dismiss20Regular} />
                </Button>
            </div>
            <AlertDialog open={confirm} onOpenChange={setConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Stop agent control?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The agent will stop clicking and running scripts on this page. You stay in the chat, and this tab is yours again.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep control</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const url = frame?.url;
                                void commands.agentBrowseStop();
                                if (url) {
                                    void import("@/features/agent/browser/store").then(({ openBrowserTab }) => openBrowserTab(url));
                                }
                            }}
                        >
                            Stop
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

"use client";

import { Copy20Regular } from "@fluentui/react-icons/headless/svg/copy";
import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { WindowConsole20Regular } from "@fluentui/react-icons/headless/svg/window-console";



import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";


import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend";
import { useBrowseFrame, type BrowseFrame } from "@/features/agent/browser/session";
import { BorderGlow } from "./border-glow";
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
const PAGE_H = 800;

/** Inset browser window on the chat card. Edit these to resize the frame. */
const INSET = {
    wallpaper: "/wallpapers/lake.jpg",
    /** Outer card width. */
    cardMaxWidth: 500,
    /** Wallpaper showing around the window, in px. */
    padX: 30,
    padY: 24,
    /** Window width as a percent of the card, after padding. */
    windowPercent: 100,
    /** Corner radius of the inset window, in px. The glow uses this same value. */
    radius: 25,
    /** Keep the page off the curved sides. Vertical pad stays smaller. */
    pagePadX: 8,
    pagePadY: 3,
};

function usePageEdgeColor(src: string): { color: string | null; failed: boolean } {
    const [color, setColor] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        const url = src.trim();
        setColor(null);
        setFailed(false);
        if (!url) return;
        let cancel = false;
        const img = new Image();
        img.onload = () => {
            if (cancel) return;
            if (!img.naturalWidth) {
                setFailed(true);
                return;
            }
            try {
                const canvas = document.createElement("canvas");
                const strip = 4;
                canvas.width = strip * 2;
                canvas.height = 8;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                if (!ctx) return;
                ctx.drawImage(img, 0, 0, strip, img.naturalHeight, 0, 0, strip, 8);
                ctx.drawImage(img, img.naturalWidth - strip, 0, strip, img.naturalHeight, strip, 0, strip, 8);
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let r = 0;
                let g = 0;
                let b = 0;
                let n = 0;
                for (let i = 0; i < data.length; i += 4) {
                    r += data[i] ?? 0;
                    g += data[i + 1] ?? 0;
                    b += data[i + 2] ?? 0;
                    n += 1;
                }
                if (n > 0) setColor(`rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`);
            } catch {
                // The picture itself loaded. A failed color sample must not hide the frame.
            }
        };
        img.onerror = () => {
            if (!cancel) setFailed(true);
        };
        img.src = url;
        return () => {
            cancel = true;
        };
    }, [src]);
    return { color, failed };
}

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
    showCursor = false,
}: {
    frame: Pick<BrowseFrame, "image" | "x" | "y" | "title" | "url" | "status" | "error">;
    className?: string;
    interactive?: boolean;
    fill?: boolean;
    /** Size the card to the screenshot so nothing is cropped or letterboxed. */
    natural?: boolean;
    /** Draw the agent pointer even after control has stopped. */
    showCursor?: boolean;
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
                    "[image-rendering:auto]",
                )}
            />
            {(showCursor || status === "controlling") && frame.image ? (
                <svg
                    className="pointer-events-none absolute z-10 text-text-primary"
                    style={{
                        left: spot.left,
                        top: spot.top,
                        width: 22,
                        height: 22,
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
    const driving = followLive && !!live && (
        live.status === "controlling" || live.status === "loading" || Boolean(live.image)
    );
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
    const page = usePageEdgeColor(frame.image);
    const pageUrl = frame.url.trim();

    const visible = Boolean(frame.image.trim()) || controlling;
    if (!visible || page.failed || frame.status === "error") return null;

    const pageColor = page.color;
    const copyLink = () => {
        if (!pageUrl) return;
        void navigator.clipboard.writeText(pageUrl);
    };

    return (
        <div
            className="group/browse relative my-2 max-w-full"
            style={{ width: INSET.cardMaxWidth }}
        >
            <div
                className="relative overflow-hidden squircle-2xl"
                style={{
                    backgroundImage: `url(${INSET.wallpaper})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }}
            >
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center overflow-hidden"
                >
                    <div className="flex -translate-y-full gap-1.5 pt-2 opacity-0 transition duration-200 ease-out group-hover/browse:pointer-events-auto group-hover/browse:translate-y-0 group-hover/browse:opacity-100">
                        {pageUrl ? (
                            <button
                                type="button"
                                aria-label="Copy page link"
                                className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-black text-white"
                                onClick={copyLink}
                            >
                                <Icon icon={Copy20Regular} className="icon-lg" />
                            </button>
                        ) : null}
                        {controlling ? (
                            <button
                                type="button"
                                aria-label="Stop the agent browser"
                                className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-black text-white"
                                onClick={() => {
                                    void commands.agentBrowseStop();
                                }}
                            >
                                <Icon icon={Dismiss20Regular} className="icon-lg" />
                            </button>
                        ) : null}
                    </div>
                </div>
                <div style={{ padding: `${INSET.padY}px ${INSET.padX}px` }}>
                    <div className="mx-auto" style={{ width: `${INSET.windowPercent}%` }}>
                        <BorderGlow radius={INSET.radius}>
                            <div
                                className="relative aspect-video"
                                style={{
                                    background: pageColor ?? "#0e0e10",
                                    padding: `${INSET.pagePadY}px ${INSET.pagePadX}px`,
                                }}
                            >
                                {frame.image ? (
                                    <div className="relative h-full w-full overflow-hidden">
                                        <BrowseStage
                                            frame={frame}
                                            fill
                                            showCursor
                                            className="absolute inset-0"
                                        />
                                    </div>
                                ) : null}
                                {lines.length ? (
                                    <button
                                        type="button"
                                        className="absolute bottom-2 left-2 z-20 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-xs text-white"
                                        onClick={() => setConsoleOpen((open) => !open)}
                                    >
                                        <Icon icon={WindowConsole20Regular} />
                                        Console
                                    </button>
                                ) : null}
                            </div>
                        </BorderGlow>
                    </div>
                </div>
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

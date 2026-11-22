"use client";

import { Copy20Regular } from "@fluentui/react-icons/headless/svg/copy";
import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { WindowConsole20Regular } from "@fluentui/react-icons/headless/svg/window-console";



import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";


import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend";
import { useBrowseFrame, useControllingBrowseFrame, type BrowseFrame } from "@/features/agent/browser/session";
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

/** Captured page. The stage scales this to the frame instead of letterboxing it. */
const PAGE_W = 1280;
const PAGE_H = 720;

/** macOS arrow. The tip sits at (11, 10) inside the 32px art. */
const MAC_CURSOR = { size: 22, tipX: 11, tipY: 10, art: 32 };

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
};

/** Scale the 1280×720 capture to the frame's width so the page fills the sides. */
function scalePage(width: number, height: number) {
    const scale = width > 0 ? width / PAGE_W : 0;
    return { left: 0, top: 0, width, height: PAGE_H * scale, frameHeight: height, scale };
}

function useWeightedPoint(x: number, y: number, weighted: boolean) {
    const state = useRef({ x, y, vx: 0, vy: 0 });
    const [pos, setPos] = useState({ x, y });
    useEffect(() => {
        if (!weighted) {
            state.current = { x, y, vx: 0, vy: 0 };
            setPos({ x, y });
            return;
        }
        let frame = 0;
        const step = () => {
            const cursor = state.current;
            cursor.vx = cursor.vx * 0.62 + (x - cursor.x) * 0.16;
            cursor.vy = cursor.vy * 0.62 + (y - cursor.y) * 0.16;
            cursor.x += cursor.vx;
            cursor.y += cursor.vy;
            setPos({ x: cursor.x, y: cursor.y });
            const left = Math.hypot(x - cursor.x, y - cursor.y);
            const speed = Math.hypot(cursor.vx, cursor.vy);
            if (left > 0.15 || speed > 0.06) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [x, y, weighted]);
    return weighted ? pos : { x, y };
}

export function BrowseStage({
    frame,
    className,
    interactive = false,
    fill: _fill = false,
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
    const point = useWeightedPoint(cursor.x, cursor.y, !pointer);

    useEffect(() => {
        const el = hostRef.current;
        if (!el) return;
        const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
        measure();
        const obs = new ResizeObserver(measure);
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const fitted = scalePage(box.w, box.h);

    const readPoint = (event: React.PointerEvent<HTMLDivElement>) => {
        const host = hostRef.current;
        if (!host) return null;
        const bounds = host.getBoundingClientRect();
        const rect = scalePage(bounds.width, bounds.height);
        const x = event.clientX - bounds.left - rect.left;
        const y = event.clientY - bounds.top - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
        return { x: (x / rect.width) * 100, y: (y / rect.height) * 100 };
    };

    const spot = fitted.width > 0
        ? {
            left: fitted.left + (point.x / 100) * fitted.width,
            top: fitted.top + (point.y / 100) * fitted.height,
        }
        : { left: 0, top: 0 };
    if (!frame.image) return null;
    const cursorScale = MAC_CURSOR.size / MAC_CURSOR.art;

    return (
        <div
            ref={hostRef}
            className={cn(
                natural ? "relative w-full" : "relative overflow-hidden",
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
                className={cn(natural ? "block h-auto w-full" : "absolute max-w-none", "[image-rendering:auto]")}
                style={natural || fitted.width <= 0 ? undefined : {
                    left: fitted.left,
                    top: fitted.top,
                    width: fitted.width,
                    height: fitted.height,
                }}
            />
            {(showCursor || status === "controlling") && frame.image && !natural ? (
                <svg
                    className="pointer-events-none absolute z-10"
                    style={{
                        left: spot.left - MAC_CURSOR.tipX * cursorScale,
                        top: spot.top - MAC_CURSOR.tipY * cursorScale,
                        width: MAC_CURSOR.size,
                        height: MAC_CURSOR.size,
                    }}
                    viewBox="0 0 32 32"
                    aria-hidden
                >
                    <g fill="none" fillRule="evenodd" transform="translate(10 7)">
                        <path d="m6.148 18.473 1.863-1.003 1.615-.839-2.568-4.816h4.332l-11.379-11.408v16.015l3.316-3.221z" fill="#fff" />
                        <path d="m6.431 17 1.765-.941-2.775-5.202h3.604l-8.025-8.043v11.188l2.53-2.442z" fill="#000" />
                    </g>
                </svg>
            ) : null}
        </div>
    );
}

function usableImage(src?: string): boolean {
    const value = src?.trim() || "";
    return value.startsWith("data:") || value.startsWith("http") || value.startsWith("blob:") || value.startsWith("asset:");
}

function bytesToUrl(bytes: number[], mime: string): string {
    const blob = new Blob([Uint8Array.from(bytes)], { type: mime || "image/jpeg" });
    return URL.createObjectURL(blob);
}

export function BrowseChatCard({
    url,
    title,
    status,
    image,
    mediaId,
    x,
    y,
    consoleLines,
    followLive = false,
    conversationId,
}: {
    url?: string;
    title?: string;
    status?: string;
    image?: string;
    mediaId?: string;
    x?: number;
    y?: number;
    consoleLines?: string[];
    followLive?: boolean;
    conversationId?: string | null;
}) {
    const live = useBrowseFrame(conversationId);
    const given = usableImage(image) ? image!.trim() : "";
    const [stored, setStored] = useState("");
    useEffect(() => {
        if (!mediaId || given) return;
        let cancelled = false;
        let url = "";
        void commands.readMedia(mediaId).then((payload) => {
            if (cancelled) return;
            url = bytesToUrl(payload.bytes, payload.mime || "image/jpeg");
            setStored(url);
        }).catch(() => undefined);
        return () => {
            cancelled = true;
            if (url) URL.revokeObjectURL(url);
        };
    }, [mediaId, given]);
    const savedImage = given || stored;
    const driving = Boolean(conversationId) && followLive && !!live && (
        live.status === "controlling" || live.status === "loading" || !savedImage
    );
    const mirror = driving ? live : null;
    const savedStatus = (status as BrowseFrame["status"]) || "stopped";
    const frame = {
        image: mirror?.image || savedImage || "",
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
    const pageUrl = frame.url.trim();

    const visible = Boolean(frame.image.trim()) || controlling || Boolean(mediaId);
    if (!visible || frame.status === "error") return null;
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
                            <div className="relative aspect-video overflow-hidden">
                                {frame.image ? (
                                    <BrowseStage
                                        frame={frame}
                                        fill
                                        showCursor
                                        className="absolute inset-0"
                                    />
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
    const frame = useControllingBrowseFrame();
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

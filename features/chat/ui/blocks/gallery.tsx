"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
    RiArrowLeftSLine,
    RiArrowRightSLine,
    RiCheckLine,
    RiCollapseDiagonalLine,
    RiExpandDiagonalLine,
    RiSpace,
} from "@remixicon/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { commands } from "@/lib/backend/commands";
import {
    designPreviewSessionId,
    setPendingDesignPick,
    upsertDesignPreviewSession,
} from "@/lib/agent-preview/store";
import {
    buildBodyPreviewHtml,
    buildReactSandboxHtml,
} from "@/lib/agent-preview/sandbox";

export type DesignPreviewItem = {
    id: string;
    name: string;
    style: string;
    path: string;
    source?: string;
    width: number;
    height: number;
    renderMs?: number;
    kind?: "html" | "png" | "react";
};

function isFramePreview(item: DesignPreviewItem): boolean {
    if (item.kind === "png") return false;
    if (item.kind === "react" || item.kind === "html") return true;
    if (item.source) return true;
    if (item.path.startsWith("data:text/html")) return true;
    return /\.html?$/i.test(item.path);
}

function previewRuntimeUrls() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return {
        bundleSrc: `${origin}/preview/bundle.js`,
        tailwindSrc: `${origin}/preview/tailwind-browser.js`,
    };
}

function previewSrcDoc(item: DesignPreviewItem): string | null {
    const source = item.source?.trim() ?? "";
    if (!source) return null;
    const urls = previewRuntimeUrls();
    const looksReact =
        item.kind === "react"
        || /function\s+App\b|const\s+App\b/.test(source);
    if (looksReact) return buildReactSandboxHtml(source, urls);
    if (/^\s*<(!doctype|html[\s>])/i.test(source)) return source;
    return buildBodyPreviewHtml(source, "", { tailwindSrc: urls.tailwindSrc });
}

function resolveSrc(path: string): string | undefined {
    if (!path) return undefined;
    if (path.startsWith("data:") || path.startsWith("http") || path.startsWith("asset:")) {
        return path;
    }
    // Temp sandbox HTML is not durable; do not hit the asset protocol for missing files.
    if (path.includes("shape-design-sandbox")) return undefined;
    return convertFileSrc(path);
}

function applyLiveTweaks(
    iframe: HTMLIFrameElement | null,
    tweaks: { radius: number; padding: number; gap: number },
) {
    try {
        const doc = iframe?.contentDocument;
        const root = doc?.getElementById("root") ?? doc?.body?.firstElementChild;
        if (!root || !(root instanceof HTMLElement)) return;
        root.style.borderRadius = `${tweaks.radius}px`;
        root.style.padding = `${tweaks.padding}px`;
        root.style.gap = `${tweaks.gap}px`;
        const first = root.firstElementChild;
        if (first instanceof HTMLElement) {
            first.style.borderRadius = `${tweaks.radius}px`;
        }
    } catch {
        /* cross-origin */
    }
}

function IcoPath({ d }: { d: string }) {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d={d} />
        </svg>
    );
}

/**
 * Compact live component card. Variants carousel inside the frame; hover
 * reveals Use / Expand. Dialog chrome is name + arrows + collapse, with a
 * Notion-style inspect pill above the canvas.
 */
export function DesignPreviewGallery({
    previews,
    selectedId,
    pickId,
    status,
}: {
    previews: DesignPreviewItem[];
    selectedId?: string;
    pickId?: string;
    status?: string;
}) {
    const items = useMemo(
        () => previews.filter((p) => Boolean(p.id?.trim()) && (Boolean(p.path?.trim()) || Boolean(p.source?.trim()))).slice(0, 3),
        [previews],
    );
    const pending = status === "pending" && Boolean(pickId);
    const selected = status === "selected" ? selectedId?.trim() || "" : "";
    const initialIndex = Math.max(0, items.findIndex((p) => p.id === selected));
    const [index, setIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [tweaks, setTweaks] = useState({ radius: 8, padding: 12, gap: 8 });
    const [tweakTab, setTweakTab] = useState<"radius" | "padding" | "gap">("radius");
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const dialogIframeRef = useRef<HTMLIFrameElement | null>(null);
    const [frameReady, setFrameReady] = useState(false);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!items.length) return;
        const sessionId = designPreviewSessionId(items);
        upsertDesignPreviewSession(sessionId, items, {
            selectedId: selected || undefined,
        });
        if (pending && pickId) {
            setPendingDesignPick({ pickId, conceptIds: items.map((i) => i.id) });
        } else if (!pending) {
            setPendingDesignPick(null);
        }
    }, [items, pending, pickId, selected]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, items.length - 1));
            if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
        };
        document.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [open, items.length]);

    useEffect(() => {
        setFrameReady(false);
    }, [index, items]);

    const item = items[index];
    if (!item) return null;

    const framed = isFramePreview(item);
    const srcDoc = previewSrcDoc(item);
    const src = srcDoc ? undefined : (item.path ? resolveSrc(item.path) : undefined);
    const chosen = selected === item.id;
    const canPick = pending && !submitting && Boolean(pickId);

    async function choose(conceptId: string, skipped = false) {
        if (!pickId || submitting) return;
        setSubmitting(true);
        try {
            await commands.selectDesignPreview(
                pickId,
                skipped ? undefined : conceptId,
                skipped,
                skipped ? undefined : JSON.stringify(tweaks),
            );
            setOpen(false);
        } catch {
            setSubmitting(false);
        }
    }

    const onFrameReady = (ref: React.RefObject<HTMLIFrameElement | null>) => {
        setFrameReady(true);
        applyLiveTweaks(ref.current, tweaks);
    };

    const frame = (ref: React.RefObject<HTMLIFrameElement | null>, className: string) =>
        framed ? (
            <div className="relative size-full">
                {!frameReady ? <div className="preview-shimmer absolute inset-0 z-10" aria-hidden /> : null}
                <iframe
                    ref={ref}
                    title={item.name || "Component preview"}
                    srcDoc={srcDoc || undefined}
                    src={srcDoc ? undefined : src}
                    className={cn(className, !frameReady && "opacity-0")}
                    sandbox="allow-scripts allow-same-origin"
                    onLoad={() => onFrameReady(ref)}
                />
            </div>
        ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={item.name || "Preview"} className={className} draggable={false} />
        );

    return (
        <div className="my-2 w-full max-w-[340px]">
            <div
                className={cn(
                    "group/screen relative aspect-[16/10] overflow-hidden rounded-xl bg-surface-3",
                    "shadow-[0_1px_0_var(--border-subtle)]",
                    chosen && "ring-2 ring-accent-text",
                )}
            >
                {frame(iframeRef, "absolute inset-0 h-full w-full border-0 bg-transparent")}

                {items.length > 1 ? (
                    <>
                        <button
                            type="button"
                            aria-label="Previous"
                            className="absolute left-1.5 top-1/2 z-1 -translate-y-1/2 rounded-full bg-surface-1/90 p-1 text-text-primary shadow-sm disabled:opacity-30"
                            disabled={index === 0}
                            onClick={() => setIndex((i) => Math.max(0, i - 1))}
                        >
                            <Icon icon={RiArrowLeftSLine} size={ICON_SIZE_SM} />
                        </button>
                        <button
                            type="button"
                            aria-label="Next"
                            className="absolute right-1.5 top-1/2 z-1 -translate-y-1/2 rounded-full bg-surface-1/90 p-1 text-text-primary shadow-sm disabled:opacity-30"
                            disabled={index >= items.length - 1}
                            onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
                        >
                            <Icon icon={RiArrowRightSLine} size={ICON_SIZE_SM} />
                        </button>
                        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-1 flex justify-center gap-1">
                            {items.map((p, i) => (
                                <span
                                    key={p.id}
                                    className={cn(
                                        "h-1.5 rounded-full bg-white/70",
                                        i === index ? "w-4" : "w-1.5 opacity-50",
                                    )}
                                />
                            ))}
                        </div>
                    </>
                ) : null}

                <div className="absolute inset-x-0 top-2 z-2 flex justify-center gap-1 opacity-0 translate-y-1 transition duration-150 group-hover/screen:translate-y-0 group-hover/screen:opacity-100">
                    <div className="flex items-center gap-0.5 rounded-full border border-border-subtle bg-surface-1/95 px-1 py-0.5 shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
                        <Tooltip content="Open">
                            <button
                                type="button"
                                className="flex size-7 items-center justify-center rounded-full text-text-muted hover:bg-panel-hover hover:text-text-primary"
                                onClick={() => setOpen(true)}
                            >
                                <Icon icon={RiExpandDiagonalLine} size={ICON_SIZE_SM} />
                            </button>
                        </Tooltip>
                        {pending ? (
                            <Tooltip content="Use this">
                                <button
                                    type="button"
                                    disabled={!canPick}
                                    className="flex size-7 items-center justify-center rounded-full text-text-muted hover:bg-panel-hover hover:text-text-primary disabled:opacity-40"
                                    onClick={() => choose(item.id)}
                                >
                                    <Icon icon={RiCheckLine} size={ICON_SIZE_SM} />
                                </button>
                            </Tooltip>
                        ) : null}
                    </div>
                </div>
            </div>

            {open && mounted
                ? createPortal(
                      <div
                          className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-6"
                          role="dialog"
                          aria-modal="true"
                          aria-label={item.name || "Component preview"}
                      >
                          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
                          <div className="relative flex max-h-full w-full max-w-[920px] flex-col overflow-hidden rounded-2xl bg-surface-1 p-2 pt-0 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                              <div className="flex h-11 shrink-0 items-center justify-between gap-3 px-1.5">
                                  <span className="truncate text-sm font-semibold text-text-primary">
                                      {item.name || "Component"}
                                  </span>
                                  <div className="flex items-center gap-0.5">
                                      {items.length > 1 ? (
                                          <>
                                              <button
                                                  type="button"
                                                  className="rounded-md p-1.5 text-text-muted hover:bg-panel-hover hover:text-text-primary disabled:opacity-30"
                                                  disabled={index === 0}
                                                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                                              >
                                                  <Icon icon={RiArrowLeftSLine} size={ICON_SIZE_SM} />
                                              </button>
                                              <button
                                                  type="button"
                                                  className="rounded-md p-1.5 text-text-muted hover:bg-panel-hover hover:text-text-primary disabled:opacity-30"
                                                  disabled={index >= items.length - 1}
                                                  onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
                                              >
                                                  <Icon icon={RiArrowRightSLine} size={ICON_SIZE_SM} />
                                              </button>
                                          </>
                                      ) : null}
                                      {pending ? (
                                          <Tooltip content="Use this">
                                              <button
                                                  type="button"
                                                  disabled={!canPick}
                                                  className="rounded-md p-1.5 text-text-muted hover:bg-panel-hover hover:text-text-primary disabled:opacity-30"
                                                  onClick={() => choose(item.id)}
                                              >
                                                  <Icon icon={RiCheckLine} size={ICON_SIZE_SM} />
                                              </button>
                                          </Tooltip>
                                      ) : null}
                                      <button
                                          type="button"
                                          aria-label="Minimize"
                                          onClick={() => setOpen(false)}
                                          className="rounded-md p-1.5 text-text-muted hover:bg-panel-hover hover:text-text-primary"
                                      >
                                          <Icon icon={RiCollapseDiagonalLine} size={ICON_SIZE_SM} />
                                      </button>
                                  </div>
                              </div>
                              <div className="relative min-h-[280px] overflow-hidden rounded-lg bg-surface-3">
                                  <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
                                      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border-subtle bg-surface-1 px-1.5 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
                                          <TabBtn
                                              active={tweakTab === "radius"}
                                              onClick={() => setTweakTab("radius")}
                                              label="Radius"
                                          >
                                              <IcoPath d="M4 20V10a6 6 0 0 1 6-6h10" />
                                          </TabBtn>
                                          <TabBtn
                                              active={tweakTab === "padding"}
                                              onClick={() => setTweakTab("padding")}
                                              label="Padding"
                                          >
                                              <Icon icon={RiSpace} size={ICON_SIZE_SM} />
                                          </TabBtn>
                                          <TabBtn
                                              active={tweakTab === "gap"}
                                              onClick={() => setTweakTab("gap")}
                                              label="Gap"
                                          >
                                              <IcoPath d="M8 6v12M16 6v12" />
                                          </TabBtn>
                                          <div className="mx-1 h-4 w-px bg-border-subtle" />
                                          <input
                                              type="range"
                                              min={0}
                                              max={tweakTab === "padding" ? 48 : 32}
                                              value={
                                                  tweakTab === "radius"
                                                      ? tweaks.radius
                                                      : tweakTab === "padding"
                                                        ? tweaks.padding
                                                        : tweaks.gap
                                              }
                                              onChange={(e) => {
                                                  const n = Number(e.target.value);
                                                  const next =
                                                      tweakTab === "radius"
                                                          ? { ...tweaks, radius: n }
                                                          : tweakTab === "padding"
                                                            ? { ...tweaks, padding: n }
                                                            : { ...tweaks, gap: n };
                                                  setTweaks(next);
                                                  applyLiveTweaks(dialogIframeRef.current, next);
                                              }}
                                              className="h-1 w-24 accent-(--accent)"
                                          />
                                      </div>
                                  </div>
                                  {frame(
                                      dialogIframeRef,
                                      "block h-[min(70vh,560px)] w-full border-0 bg-transparent",
                                  )}
                              </div>
                          </div>
                      </div>,
                      document.body,
                  )
                : null}
        </div>
    );
}

function TabBtn({
    active,
    onClick,
    label,
    children,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <Button
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-7 gap-1 rounded-full px-2.5 text-xs", active && "bg-surface-3")}
            onClick={onClick}
        >
            {children}
            {label}
        </Button>
    );
}

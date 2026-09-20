"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RiCollapseDiagonalLine, RiExpandDiagonalLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

function CursorSvg({ className, style }: { className?: string; style?: React.CSSProperties }) {
    return (
        <svg
            className={className}
            style={style}
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
    );
}

export function AgentScreen({
    src,
    title = "Agent's screen",
}: {
    src: string;
    title?: string;
}) {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        document.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [open]);

    return (
        <div className="my-2 w-full max-w-[340px]">
            <div
                className={cn(
                    "group/screen relative aspect-[16/10] cursor-pointer overflow-hidden rounded-xl bg-surface-3",
                    "shadow-[0_1px_0_var(--border-subtle)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-shadow",
                )}
                onClick={() => setOpen(true)}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
                <CursorSvg className="pointer-events-none absolute text-text-primary" style={{ left: "42%", top: "53%" }} />
                <div className="absolute inset-0 flex items-center justify-center bg-transparent transition-colors duration-150 group-hover/screen:bg-black/18">
                    <span className="translate-y-1 opacity-0 transition duration-150 group-hover/screen:translate-y-0 group-hover/screen:opacity-100">
                        <Button
                            type="button"
                            variant="default"
                            size="sm"
                            className="gap-1"
                            onClick={(e) => {
                                e.stopPropagation();
                                setOpen(true);
                            }}
                        >
                            <Icon icon={RiExpandDiagonalLine} size={ICON_SIZE_SM} />
                            Open
                        </Button>
                    </span>
                </div>
            </div>
            <div className="mt-1.5 truncate px-0.5 text-sm font-medium text-text-secondary">{title}</div>

            {open && mounted
                ? createPortal(
                      <div
                          className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-6"
                          role="dialog"
                          aria-modal="true"
                          aria-label={title}
                      >
                          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
                          <div className="relative flex max-h-full flex-col overflow-hidden rounded-2xl bg-surface-1 p-2 pt-0 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                              <div className="flex h-11 shrink-0 items-center justify-between gap-3 px-1.5">
                                  <span className="truncate text-sm font-semibold text-text-primary">{title}</span>
                                  <button
                                      type="button"
                                      aria-label="Collapse"
                                      onClick={() => setOpen(false)}
                                      className="rounded-md p-1.5 text-text-muted hover:bg-panel-hover hover:text-text-primary"
                                  >
                                      <Icon icon={RiCollapseDiagonalLine} size={ICON_SIZE_SM} />
                                  </button>
                              </div>
                              <div
                                  className="relative min-h-0 overflow-hidden rounded-lg bg-surface-3 [cursor:none]"
                                  onMouseMove={(e) => {
                                      const r = e.currentTarget.getBoundingClientRect();
                                      setCursorPos({ x: e.clientX - r.left, y: e.clientY - r.top });
                                  }}
                                  onMouseLeave={() => setCursorPos(null)}
                              >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                      src={src}
                                      alt=""
                                      className="block h-auto w-auto object-contain"
                                      style={{ maxHeight: "calc(100vh - 150px)", maxWidth: "min(960px, 90vw)" }}
                                      draggable={false}
                                  />
                                  {cursorPos ? (
                                      <CursorSvg
                                          className="pointer-events-none absolute z-10 text-text-primary"
                                          style={{
                                              left: cursorPos.x,
                                              top: cursorPos.y,
                                              filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))",
                                          }}
                                      />
                                  ) : null}
                              </div>
                          </div>
                      </div>,
                      document.body,
                  )
                : null}
        </div>
    );
}

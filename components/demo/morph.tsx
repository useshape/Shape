"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/* Copied from shape/components/ui/morph-menu.tsx */

export function MorphMenu({
  trigger,
  children,
  className,
  openWidth = 280,
  openHeight = 200,
  closedHeight = 32,
  align = "end",
  "aria-label": ariaLabel = "Open menu",
}: {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  openWidth?: number;
  openHeight?: number;
  closedHeight?: number;
  align?: "start" | "end";
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [closedW, setClosedW] = useState<number | null>(null);
  const lockedOpen = useRef({ w: openWidth, h: openHeight });

  useLayoutEffect(() => {
    if (!measureRef.current) return;
    const el = measureRef.current;
    const measure = () => {
      const w = Math.ceil(el.getBoundingClientRect().width);
      if (w > 0) setClosedW((prev) => (prev === w ? prev : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [trigger]);

  useEffect(() => {
    if (open) return;
    lockedOpen.current = { w: openWidth, h: openHeight };
  }, [open, openWidth, openHeight]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ready = closedW != null;
  const wClosed = closedW ?? 96;
  const wOpen = open ? lockedOpen.current.w : openWidth;
  const hOpen = open ? lockedOpen.current.h : openHeight;
  const rClosed = closedHeight / 2;
  const rOpen = 16;

  return (
    <div
      className={cn("relative inline-flex items-end", className)}
      style={{ height: closedHeight, minWidth: wClosed }}
    >
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute inline-flex h-8 items-center gap-1.5 whitespace-nowrap px-4 text-sm font-medium"
      >
        {trigger}
      </span>
      <div
        ref={ref}
        className="t-morph bg-secondary border border-border-subtle absolute bottom-0"
        data-open={open ? "true" : "false"}
        data-align={align}
        data-ready={ready ? "true" : "false"}
        style={
          {
            [align === "end" ? "right" : "left"]: 0,
            "--morph-w-closed": `${wClosed}px`,
            "--morph-h-closed": `${closedHeight}px`,
            "--morph-w-open": `${wOpen}px`,
            "--morph-h-open": `${hOpen}px`,
            "--morph-r-closed": `${rClosed}px`,
            "--morph-r-open": `${rOpen}px`,
          } as CSSProperties
        }
      >
        <div className="t-morph-menu custom-scrollbar" role="menu">
          {children}
        </div>
        <button
          type="button"
          className="t-morph-plus text-sm text-text-secondary"
          aria-expanded={open}
          aria-label={ariaLabel}
          onClick={(e) => {
            e.stopPropagation();
            if (!open) lockedOpen.current = { w: openWidth, h: openHeight };
            setOpen((v) => !v);
          }}
        >
          {trigger}
        </button>
      </div>
    </div>
  );
}

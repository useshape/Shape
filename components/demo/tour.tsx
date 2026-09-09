"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_STEPS, type DemoStepId } from "./steps";

const CLICK_MS = 140;
const HOVER_MS = 220;

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = window.setTimeout(() => resolve(), ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function MacCursor({
  x,
  y,
  visible,
  clicking,
  duration,
}: {
  x: number;
  y: number;
  visible: boolean;
  clicking: boolean;
  duration: number;
}) {
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none absolute z-50 origin-top-left"
      style={{
        transform: `translate(${x}px, ${y}px) scale(${clicking ? 0.86 : 1})`,
        transition: `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.35))",
      }}
      aria-hidden
    >
      <svg width="15" height="20" viewBox="0 0 15 20" fill="none">
        <path
          d="M1.2 1.2 1.2 16.8 5.1 13.1 7.6 19.1 10.1 18.1 7.7 12.2 13.6 12.2 1.2 1.2Z"
          fill="#fff"
          stroke="#111"
          strokeWidth="1.15"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function useDemoTour(
  rootRef: React.RefObject<HTMLElement | null>,
  onTour: (step: DemoStepId, progress: number) => void,
  enabled = true,
) {
  const [cursor, setCursor] = useState({
    x: 72,
    y: 120,
    visible: false,
    clicking: false,
    duration: 500,
  });
  const pos = useRef({ x: 72, y: 120 });
  const jumpToRef = useRef<DemoStepId | null>(null);
  const onTourRef = useRef(onTour);
  onTourRef.current = onTour;

  const jumpTo = useCallback((id: DemoStepId) => {
    jumpToRef.current = id;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ac = new AbortController();
    const { signal } = ac;

    const moveAndActivate = async (target: string) => {
      const root = rootRef.current;
      const el = root?.querySelector<HTMLElement>(`[data-demo-target="${target}"]`);
      if (!root || !el) return;

      const rootBox = root.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const x = box.left - rootBox.left + Math.min(18, box.width / 3);
      const y = box.top - rootBox.top + box.height / 2;
      const dist = Math.hypot(x - pos.current.x, y - pos.current.y);
      const duration = reduced ? 0 : Math.min(860, Math.max(320, dist * 0.85));
      pos.current = { x, y };

      setCursor((c) => ({ ...c, x, y, visible: true, clicking: false, duration }));
      await sleep(duration, signal);
      await sleep(reduced ? 0 : HOVER_MS, signal);
      setCursor((c) => ({ ...c, clicking: true, duration: 80 }));
      await sleep(CLICK_MS, signal);
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      setCursor((c) => ({ ...c, clicking: false, duration: 120 }));
    };

    const run = async () => {
      let i = 0;
      await sleep(500, signal);
      while (!signal.aborted) {
        if (jumpToRef.current) {
          const next = DEMO_STEPS.findIndex((s) => s.id === jumpToRef.current);
          jumpToRef.current = null;
          if (next >= 0) i = next;
        }

        const step = DEMO_STEPS[i];
        onTourRef.current(step.id, 0);

        for (const target of step.clicks) {
          if (signal.aborted) return;
          await moveAndActivate(target);
          await sleep(180, signal);
        }

        const start = performance.now();
        while (performance.now() - start < step.duration) {
          if (signal.aborted) return;
          if (jumpToRef.current) break;
          onTourRef.current(step.id, Math.min(1, (performance.now() - start) / step.duration));
          await sleep(50, signal);
        }

        if (!jumpToRef.current) {
          onTourRef.current(step.id, 1);
          i = (i + 1) % DEMO_STEPS.length;
        }
      }
    };

    void run().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
    });

    return () => ac.abort();
  }, [rootRef, enabled]);

  return { cursor, jumpTo };
}

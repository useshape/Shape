"use client";

import { useEffect, useRef, useState } from "react";

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

/** Feature-only cursor. Does not share state with the hero tour. */
export function usePlayDemo(
  rootRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  onReset: () => void,
) {
  const [cursor, setCursor] = useState({
    x: 72,
    y: 48,
    visible: false,
    clicking: false,
    duration: 480,
  });
  const pos = useRef({ x: 72, y: 48 });
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  useEffect(() => {
    if (!enabled) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ac = new AbortController();
    const { signal } = ac;

    const moveTo = async (x: number, y: number) => {
      const dist = Math.hypot(x - pos.current.x, y - pos.current.y);
      const duration = reduced ? 0 : Math.min(860, Math.max(380, dist * 0.9));
      pos.current = { x, y };
      setCursor({ x, y, visible: true, clicking: false, duration });
      await sleep(duration, signal);
    };

    const clickTarget = async (target: string) => {
      const root = rootRef.current;
      const el = root?.querySelector<HTMLElement>(`[data-demo-target="${target}"]`);
      if (!root || !el) return;
      const rootBox = root.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      await moveTo(
        box.left - rootBox.left + box.width / 2 - 4,
        box.top - rootBox.top + box.height / 2 - 2,
      );
      await sleep(reduced ? 0 : 160, signal);
      setCursor((c) => ({ ...c, clicking: true, duration: 90 }));
      await sleep(120, signal);
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      setCursor((c) => ({ ...c, clicking: false, duration: 120 }));
    };

    const run = async () => {
      await sleep(700, signal);
      while (!signal.aborted) {
        onResetRef.current();
        await sleep(280, signal);
        await clickTarget("run");
        await sleep(7200, signal);
      }
    };

    void run().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
    });

    return () => ac.abort();
  }, [enabled, rootRef]);

  return cursor;
}

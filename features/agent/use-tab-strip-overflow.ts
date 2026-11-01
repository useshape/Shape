"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

export function useTabStripOverflow(ref: RefObject<HTMLElement | null>, extra?: unknown) {
    const [left, setLeft] = useState(false);
    const [right, setRight] = useState(false);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => {
            const overflow = el.scrollWidth > el.clientWidth + 1;
            setLeft(overflow && el.scrollLeft > 1);
            setRight(overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        el.addEventListener("scroll", measure, { passive: true });
        window.addEventListener("resize", measure);
        return () => {
            observer.disconnect();
            el.removeEventListener("scroll", measure);
            window.removeEventListener("resize", measure);
        };
    }, [ref, extra]);

    return { fadeLeft: left, fadeRight: right };
}

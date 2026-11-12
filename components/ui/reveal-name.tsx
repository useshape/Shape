"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Fade and shimmer a label when it first appears or the text changes. */
export function RevealName({
    text,
    className,
    style,
    appear = false,
}: {
    text: string;
    className?: string;
    style?: CSSProperties;
    appear?: boolean;
}) {
    const [shown, setShown] = useState(text);
    const [epoch, setEpoch] = useState(0);
    const [playing, setPlaying] = useState(appear);

    if (text !== shown) {
        setShown(text);
        setEpoch((n) => n + 1);
        setPlaying(true);
    }

    return (
        <span
            key={epoch}
            className={cn("relative inline-block max-w-full", className, playing && "chat-name-reveal")}
            style={style}
            onAnimationEnd={(event) => {
                if (event.animationName !== "chat-name-sheen") return;
                setPlaying(false);
            }}
        >
            {text}
            {playing ? <span aria-hidden className="chat-name-sheen" /> : null}
        </span>
    );
}

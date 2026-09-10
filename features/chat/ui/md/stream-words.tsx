"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

function StreamTokens({ text, streaming }: { text: string; streaming?: boolean }) {
    const tokens = useMemo(() => text.split(/(\s+)/), [text]);
    const wordCount = useMemo(
        () => tokens.filter((t) => t.length > 0 && !/^\s+$/.test(t)).length,
        [tokens],
    );
    const [revealed, setRevealed] = useState(() => (streaming ? 0 : wordCount));
    const revealedRef = useRef(revealed);
    revealedRef.current = revealed;

    useEffect(() => {
        if (!streaming) {
            setRevealed(wordCount);
            return;
        }
        // Never rewind: new tokens fade in; already-shown words stay put.
        if (revealedRef.current > wordCount) {
            setRevealed(wordCount);
            return;
        }
        if (revealedRef.current >= wordCount) return;
        const behind = wordCount - revealedRef.current;
        const step = behind > 24 ? Math.ceil(behind / 6) : 1;
        const t = window.setTimeout(() => {
            setRevealed((n) => Math.min(wordCount, n + step));
        }, 45);
        return () => window.clearTimeout(t);
    }, [streaming, wordCount, revealed]);

    let seen = 0;
    return (
        <>
            {tokens.map((token, i) => {
                if (!token) return null;
                if (/^\s+$/.test(token)) return <React.Fragment key={i}>{token}</React.Fragment>;
                const on = !streaming || seen < revealed;
                seen += 1;
                return (
                    <span key={i} className={on ? "t-stream-w is-in" : "t-stream-w"}>
                        {token}
                    </span>
                );
            })}
        </>
    );
}

function wrapNode(child: React.ReactNode, streaming: boolean, key?: React.Key): React.ReactNode {
    if (child == null || typeof child === "boolean") return child;
    if (typeof child === "string" || typeof child === "number") {
        return <StreamTokens key={key} text={String(child)} streaming={streaming} />;
    }
    if (Array.isArray(child)) {
        return React.Children.map(child, (c, i) => wrapNode(c, streaming, i));
    }
    if (!React.isValidElement(child)) return child;
    const nested = (child.props as { children?: React.ReactNode }).children;
    if (nested == null) return child;
    return React.cloneElement(child, { key: child.key ?? key }, wrapNode(nested, streaming));
}

export function StreamInline({
    children,
    streaming,
}: {
    children?: React.ReactNode;
    streaming?: boolean;
}) {
    if (!streaming) return <>{children}</>;
    return <>{wrapNode(children, true)}</>;
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

function Light({
    kind,
    label,
    onClick,
}: {
    kind: "close" | "min" | "zoom";
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            className={cn("traffic-light", `traffic-light-${kind}`)}
            onClick={onClick}
        />
    );
}

export function TrafficLights({
    isMaximized,
    onMinimize,
    onToggleMaximize,
    onClose,
}: {
    isMaximized: boolean;
    onMinimize: () => void;
    onToggleMaximize: () => void;
    onClose: () => void;
}) {
    const [host, setHost] = useState<HTMLElement | null>(null);
    const [focused, setFocused] = useState(true);

    useEffect(() => {
        setHost(document.body);
        const on = () => setFocused(true);
        const off = () => setFocused(false);
        window.addEventListener("focus", on);
        window.addEventListener("blur", off);
        return () => {
            window.removeEventListener("focus", on);
            window.removeEventListener("blur", off);
        };
    }, []);

    const cluster = (
        <div
            className={cn("traffic-lights", !focused && "is-inactive")}
            data-no-drag
            data-maximized={isMaximized ? "true" : "false"}
        >
            <Light kind="close" label="Close" onClick={onClose} />
            <Light kind="min" label="Minimize" onClick={onMinimize} />
            <Light kind="zoom" label={isMaximized ? "Restore" : "Zoom"} onClick={onToggleMaximize} />
        </div>
    );

    if (!host) return cluster;
    return createPortal(cluster, host);
}

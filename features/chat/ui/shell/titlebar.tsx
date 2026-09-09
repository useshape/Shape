"use client";

import { RiArrowLeftLine, RiArrowRightLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/repo-history";
import type { ReactNode } from "react";
import { AGENT_SIDEBAR_HISTORY_SLOT } from "@/features/agent/chrome";

function NavBtn({
    label,
    disabled,
    onClick,
    children,
}: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Tooltip content={label}>
            <button
                type="button"
                aria-label={label}
                disabled={disabled}
                onClick={onClick}
                className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors",
                    "hover:bg-panel-hover hover:text-text-primary",
                    "disabled:pointer-events-none disabled:text-text-disabled",
                )}
            >
                {children}
            </button>
        </Tooltip>
    );
}

export function ChatHistoryNav({
    conversationId,
    recentIds,
    onSelect,
}: {
    conversationId: string | null;
    recentIds: string[];
    onSelect: (id: string) => void;
}) {
    const idx = conversationId ? recentIds.indexOf(conversationId) : -1;
    const canBack = conversationId
        ? idx >= 0 && idx < recentIds.length - 1
        : recentIds.length > 0;
    const canForward = idx > 0;

    const buttons = (
        <>
            <NavBtn
                label="Back"
                disabled={!canBack}
                onClick={() => {
                    if (!conversationId) {
                        const latest = recentIds[0];
                        if (latest) onSelect(latest);
                        return;
                    }
                    const older = recentIds[idx + 1];
                    if (older) onSelect(older);
                }}
            >
                <Icon icon={RiArrowLeftLine} />
            </NavBtn>
            <NavBtn
                label="Forward"
                disabled={!canForward}
                onClick={() => {
                    const newer = recentIds[idx - 1];
                    if (newer) onSelect(newer);
                }}
            >
                <Icon icon={RiArrowRightLine} />
            </NavBtn>
        </>
    );

    return <div className="flex items-center gap-0.5">{buttons}</div>;
}

export function ChatTitlebar({
    title,
    conversationId,
    recentIds,
    timestamp,
    onSelect,
}: {
    title: string;
    conversationId: string | null;
    recentIds: string[];
    timestamp?: number | null;
    onSelect: (id: string) => void;
}) {
    const [historySlot, setHistorySlot] = useState<HTMLElement | null>(null);
    const [, setTick] = useState(0);
    useEffect(() => {
        if (timestamp == null) return;
        const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
        return () => window.clearInterval(id);
    }, [timestamp]);
    useEffect(() => {
        const find = () => {
            const el = document.getElementById(AGENT_SIDEBAR_HISTORY_SLOT);
            setHistorySlot(el && el.isConnected ? el : null);
        };
        find();
        const onLayout = () => {
            requestAnimationFrame(() => requestAnimationFrame(find));
        };
        window.addEventListener("shape-layout-toggle", onLayout);
        const timer = window.setInterval(find, 200);
        const stop = window.setTimeout(() => window.clearInterval(timer), 4000);
        return () => {
            window.removeEventListener("shape-layout-toggle", onLayout);
            window.clearInterval(timer);
            window.clearTimeout(stop);
        };
    }, []);
    const ago = timestamp != null ? formatTimeAgo(timestamp) : null;
    const historyNav = historySlot ? (
        <ChatHistoryNav
            conversationId={conversationId}
            recentIds={recentIds}
            onSelect={onSelect}
        />
    ) : null;

    return (
        <div className="flex h-full min-w-0 flex-1 items-center gap-0.5">
            <span className="ml-1 flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate text-sm leading-none text-text-secondary">
                    {title}
                </span>
                {ago && ago !== "—" ? (
                    <span className="shrink-0 self-center text-sm leading-none tabular-nums text-text-muted">
                        {ago}
                    </span>
                ) : null}
            </span>
            {historySlot && historySlot.isConnected ? createPortal(historyNav, historySlot) : null}
        </div>
    );
}

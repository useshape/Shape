"use client";

import { useEffect, useRef, useState } from "react";
import { RiArrowUpLine, RiSparkling2Line } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { formatMentionToken } from "@/lib/chat/mentions";
import type { DesignElementSnapshot } from "../bridge";

export function DesignSelectionPrompt({
    selected,
    file,
    open,
    onOpen,
    onClose,
}: {
    selected: DesignElementSnapshot;
    file?: string;
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
}) {
    const label = selected.component?.name || selected.component?.tag || selected.tag;
    const [draft, setDraft] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const rect = selected.rect;

    useEffect(() => {
        setDraft("");
    }, [selected.key, open]);

    useEffect(() => {
        if (!open) return;
        const id = window.requestAnimationFrame(() => inputRef.current?.focus());
        return () => window.cancelAnimationFrame(id);
    }, [open, selected.key]);

    const send = (submit: boolean) => {
        const token = formatMentionToken({
            kind: "design",
            id: selected.key,
            path: file,
            label,
        });
        const prompt = `${token}${draft.trim() ? ` ${draft.trim()}` : ""}`;
        window.dispatchEvent(
            new CustomEvent("shape-chat-insert-prompt", {
                detail: { prompt, send: submit && Boolean(draft.trim()) },
            }),
        );
        if (!submit || !draft.trim()) {
            window.dispatchEvent(new Event("shape-chat-focus-input"));
        }
        onClose();
    };

    const iconLeft = Math.max(8, rect.x + rect.width + 6);
    const iconTop = Math.max(8, rect.y);
    const promptLeft = Math.max(8, rect.x);
    const promptTop = Math.max(8, rect.y + rect.height + 8);

    return (
        <>
            <button
                type="button"
                aria-label="Prompt the agent about this element"
                title="Prompt agent (Ctrl+L)"
                onClick={(event) => {
                    event.stopPropagation();
                    onOpen();
                }}
                className="absolute z-30 flex size-7 items-center justify-center rounded-full border border-border bg-panel text-text-secondary shadow-md hover:text-text-primary"
                style={{ left: iconLeft, top: iconTop }}
            >
                <Icon icon={RiSparkling2Line} size={ICON_SIZE_SM} />
            </button>
            {open ? (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        send(true);
                    }}
                    className="absolute z-30 flex w-[min(420px,calc(100%-1.5rem))] items-center gap-2 rounded-full border border-border bg-panel py-1 pl-3 pr-1 shadow-lg"
                    style={{ left: promptLeft, top: promptTop }}
                >
                    <span className="shrink-0 text-sm font-medium text-accent">{label}</span>
                    <input
                        ref={inputRef}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Describe the change…"
                        className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                        onKeyDown={(event) => {
                            if (event.key === "Escape") {
                                event.preventDefault();
                                onClose();
                                return;
                            }
                            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
                                event.preventDefault();
                                send(true);
                            }
                        }}
                    />
                    <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        aria-label="Send"
                        className="size-8 shrink-0"
                    >
                        <Icon icon={RiArrowUpLine} size={ICON_SIZE_SM} />
                    </Button>
                </form>
            ) : null}
        </>
    );
}

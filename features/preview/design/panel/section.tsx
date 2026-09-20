"use client";

import { RiAddLine } from "@remixicon/react";
import { useState } from "react";
import { IconButton } from "./field";

export function PanelSection({
    title,
    children,
    defaultOpen = true,
    add,
    action,
    onAdd,
    open: openProp,
}: {
    title: string;
    children?: React.ReactNode;
    defaultOpen?: boolean;
    add?: boolean;
    action?: React.ReactNode;
    onAdd?: () => void;
    /** When set with `add`, section stays open only while content exists — title cannot toggle closed. */
    open?: boolean;
}) {
    const [openInternal, setOpenInternal] = useState(defaultOpen);
    const controlled = openProp !== undefined;
    const open = controlled ? openProp : openInternal;
    const canToggle = !add;

    return (
        <section className="border-t border-border">
            <div className="flex h-10 items-center gap-2 px-3">
                {canToggle ? (
                    <button
                        type="button"
                        onClick={() => setOpenInternal((current) => !current)}
                        className="min-w-0 flex-1 text-left text-xs font-medium text-text-primary"
                    >
                        {title}
                    </button>
                ) : (
                    <span className="min-w-0 flex-1 text-left text-xs font-medium text-text-primary">
                        {title}
                    </span>
                )}
                {action}
                {add ? (
                    <IconButton
                        label={`Add ${title}`}
                        icon={RiAddLine}
                        onClick={() => {
                            if (!controlled) setOpenInternal(true);
                            onAdd?.();
                        }}
                    />
                ) : null}
            </div>
            {open ? <div className="space-y-1.5 px-3 pb-2.5">{children}</div> : null}
        </section>
    );
}

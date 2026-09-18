"use client";

import { RiAddLine } from "@remixicon/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
            <div className="flex h-10 items-center px-3">
                {canToggle ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpenInternal((current) => !current)}
                        className="-ml-2 min-w-0 flex-1 justify-start px-2 text-xs font-medium text-text-primary hover:bg-transparent"
                    >
                        {title}
                    </Button>
                ) : (
                    <span className="-ml-2 min-w-0 flex-1 px-2 text-xs font-medium text-text-primary">
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

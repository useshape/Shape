"use client";

import React from "react";
import { FlyoutCard } from "./fields";
import { ADDABLE_FONTS, injectHostFont, normalizeFontName } from "./fonts";
import { firstFontFamily } from "../../design-mode/css";
import { getDesignBridge } from "../../design-mode/store";

export function FontPickerButton({
    family,
    inUse,
    onChange,
}: {
    family: string;
    inUse: string[];
    onChange: (stack: string, name: string) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const [anchor, setAnchor] = React.useState<DOMRect | null>(null);
    const [query, setQuery] = React.useState("");
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const current = firstFontFamily(family);
    const q = query.trim().toLowerCase();

    React.useEffect(() => {
        if (!open) return;
        for (const f of ADDABLE_FONTS) {
            if (f.google) injectHostFont(f.name);
        }
    }, [open]);

    const used = inUse
        .map(normalizeFontName)
        .map((n) => n.replace(/^__nextjs-/, "").replace(/_/g, " ").trim() || n)
        .filter((n, i, arr) => n && arr.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i)
        .filter((n) => !q || n.toLowerCase().includes(q));
    const addable = ADDABLE_FONTS.filter((f) => {
        if (q && !f.name.toLowerCase().includes(q)) return false;
        return !used.some((u) => u.toLowerCase() === f.name.toLowerCase());
    });

    const pick = (name: string, stack: string, google?: boolean) => {
        if (google) {
            injectHostFont(name);
            getDesignBridge()?.injectFont?.(name);
        }
        onChange(stack, name);
        setOpen(false);
        setQuery("");
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                title="Font"
                className="flex h-8 w-full min-w-0 items-center justify-between rounded-md bg-panel-hover px-2 text-left text-xs text-text-primary outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
                style={{ fontFamily: family }}
                onClick={(e) => {
                    setAnchor(e.currentTarget.getBoundingClientRect());
                    setOpen((v) => !v);
                }}
            >
                <span className="truncate">{current}</span>
            </button>
            {open && anchor ? (
                <FlyoutCard
                    title="Font"
                    anchor={anchor}
                    trigger={triggerRef.current}
                    onClose={() => setOpen(false)}
                >
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search fonts"
                        className="h-8 w-full rounded-md bg-panel-hover px-2 text-xs text-text-primary outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
                    />
                    <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">In use</p>
                    <div className="max-h-40 overflow-y-auto">
                        {used.length === 0 ? (
                            <p className="px-1 py-1 text-xs text-text-muted">None detected yet</p>
                        ) : (
                            used.map((name) => (
                                <button
                                    key={name}
                                    type="button"
                                    className="flex h-8 w-full items-center rounded-md px-2 text-left text-xs text-text-primary hover:bg-panel-hover"
                                    style={{ fontFamily: name }}
                                    onClick={() => pick(name, `${name}, ui-sans-serif, system-ui, sans-serif`)}
                                >
                                    {name}
                                </button>
                            ))
                        )}
                    </div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Addable</p>
                    <div className="max-h-48 overflow-y-auto">
                        {addable.map((f) => (
                            <button
                                key={f.name}
                                type="button"
                                className="flex h-8 w-full items-center rounded-md px-2 text-left text-xs text-text-primary hover:bg-panel-hover"
                                style={{ fontFamily: f.stack }}
                                onClick={() => pick(f.name, f.stack, f.google)}
                            >
                                {f.name}
                            </button>
                        ))}
                    </div>
                </FlyoutCard>
            ) : null}
        </>
    );
}

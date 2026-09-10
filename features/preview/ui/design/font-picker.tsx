"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
            <Button
                ref={triggerRef}
                type="button"
                variant="ghost"
                title="Font"
                className="h-8 w-full min-w-0 justify-between rounded-lg border border-border-subtle bg-input-bg px-2 font-normal text-sm text-text-primary hover:border-border"
                style={{ fontFamily: family }}
                onClick={(e) => {
                    setAnchor(e.currentTarget.getBoundingClientRect());
                    setOpen((v) => !v);
                }}
            >
                <span className="truncate">{current}</span>
            </Button>
            {open && anchor ? (
                <FlyoutCard
                    title="Font"
                    anchor={anchor}
                    trigger={triggerRef.current}
                    onClose={() => setOpen(false)}
                >
                    <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search fonts"
                        className="h-7"
                    />
                    <p className="text-xs text-text-muted">In use</p>
                    <div className="max-h-40 overflow-y-auto">
                        {used.length === 0 ? (
                            <p className="px-1.5 py-1 text-sm text-text-muted">None detected yet</p>
                        ) : (
                            used.map((name) => (
                                <Button
                                    key={name}
                                    type="button"
                                    variant="ghost"
                                    className="h-7 w-full justify-start rounded-md px-1.5 font-normal text-sm"
                                    style={{ fontFamily: name }}
                                    onClick={() => pick(name, `${name}, ui-sans-serif, system-ui, sans-serif`)}
                                >
                                    {name}
                                </Button>
                            ))
                        )}
                    </div>
                    <p className="text-xs text-text-muted">Addable</p>
                    <div className="max-h-48 overflow-y-auto">
                        {addable.map((f) => (
                            <Button
                                key={f.name}
                                type="button"
                                variant="ghost"
                                className="h-7 w-full justify-start rounded-md px-1.5 font-normal text-sm"
                                style={{ fontFamily: f.stack }}
                                onClick={() => pick(f.name, f.stack, f.google)}
                            >
                                {f.name}
                            </Button>
                        ))}
                    </div>
                </FlyoutCard>
            ) : null}
        </>
    );
}

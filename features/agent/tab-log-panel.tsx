"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { clearTabLog, subscribeTabLog, tabLogText } from "@/lib/ui/tab-switch-log";

export function TabLogPanel() {
    const text = useSyncExternalStore(subscribeTabLog, tabLogText, tabLogText);
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const show = () => setOpen(true);
        window.addEventListener("shape-show-tab-log", show);
        return () => window.removeEventListener("shape-show-tab-log", show);
    }, []);

    const copy = () => {
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        });
    };

    return (
        <div className="pointer-events-auto fixed bottom-3 left-3 z-[80] flex max-w-[min(100%-1.5rem,36rem)] flex-col items-start gap-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
                Tab log
            </Button>
            {open ? (
                <div className="flex w-[min(100vw-1.5rem,36rem)] flex-col gap-2 rounded-xl border border-border-subtle bg-panel p-2 shadow-md">
                    <pre className="max-h-52 overflow-auto whitespace-pre-wrap font-mono text-xs text-text-secondary">
                        {text}
                    </pre>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={copy}>
                            {copied ? "Copied" : "Copy"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => clearTabLog()}>
                            Clear
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

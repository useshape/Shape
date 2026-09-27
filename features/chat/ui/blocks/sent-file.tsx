"use client";

import { ICON_SIZE_SM, SolarIcon, type SolarIconName } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";

function kindOf(mime: string, name: string): { label: string; icon: SolarIconName } {
    const ext = (name.split(".").pop() || "").toUpperCase();
    const mark = ext || "FILE";
    if (mime.startsWith("image/")) return { label: `Image · ${mark}`, icon: "gallery" };
    if (mime.startsWith("audio/")) return { label: `Audio · ${mark}`, icon: "soundwave" };
    if (mime.startsWith("video/")) return { label: `Video · ${mark}`, icon: "monitor" };
    if (mime.startsWith("text/") || mime.includes("json")) return { label: `Text · ${mark}`, icon: "file-text" };
    return { label: ext ? `File · ${mark}` : "File", icon: "file" };
}

function download(name: string, src: string) {
    const link = document.createElement("a");
    link.href = src;
    link.download = name;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
}

/** A file the agent handed over: icon, title, type, and a download. */
export function SentFileCard({
    name,
    title,
    mime,
    src,
}: {
    name: string;
    title?: string;
    mime: string;
    src: string;
}) {
    const kind = kindOf(mime, name);
    const heading = title?.trim() || name.replace(/\.[^.]+$/, "") || name;
    const canDownload = Boolean(src.trim());

    return (
        <div className="my-2 flex max-w-md items-center gap-3 rounded-2xl border border-border-subtle bg-surface-3 px-3 py-2.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <SolarIcon name={kind.icon} size={18} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-primary">{heading}</span>
                <span className="block truncate text-xs text-text-muted">{kind.label}</span>
            </span>
            <span className="flex shrink-0 items-center">
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!canDownload}
                    className="rounded-r-none"
                    onClick={() => download(name, src)}
                >
                    Download
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={!canDownload}
                            className="rounded-l-none border-l border-border-subtle px-1.5"
                            aria-label="More"
                        >
                            <SolarIcon name="alt-arrow-down" size={ICON_SIZE_SM} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => download(name, src)}>Download</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </span>
        </div>
    );
}

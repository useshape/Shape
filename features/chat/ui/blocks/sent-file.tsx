"use client";

import { Camera20Filled } from "@fluentui/react-icons/headless/svg/camera";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { Document20Regular } from "@fluentui/react-icons/headless/svg/document";
import { DocumentText20Regular } from "@fluentui/react-icons/headless/svg/document-text";
import { Options20Regular } from "@fluentui/react-icons/headless/svg/options";
import { Window20Filled } from "@fluentui/react-icons/headless/svg/window";

import { type IconGlyph, Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";

function kindOf(mime: string, name: string): { label: string; icon: IconGlyph } {
    const ext = (name.split(".").pop() || "").toUpperCase();
    const mark = ext || "FILE";
    if (mime.startsWith("image/")) return { label: `Image · ${mark}`, icon: Camera20Filled };
    if (mime.startsWith("audio/")) return { label: `Audio · ${mark}`, icon: Options20Regular };
    if (mime.startsWith("video/")) return { label: `Video · ${mark}`, icon: Window20Filled };
    if (mime.startsWith("text/") || mime.includes("json")) return { label: `Text · ${mark}`, icon: DocumentText20Regular };
    return { label: ext ? `File · ${mark}` : "File", icon: Document20Regular };
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
                <Icon icon={kind.icon} />
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
                            <Icon icon={ChevronDown20Regular} />
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

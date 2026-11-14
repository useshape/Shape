"use client";

import { ArrowDownload20Regular } from "@fluentui/react-icons/headless/svg/arrow-download";
import { Document20Regular } from "@fluentui/react-icons/headless/svg/document";

import { Icon } from "@/components/ui/icon";
import { saveDownloadOrNotify } from "@/lib/ui/save-download";

function kindLabel(mime: string, name: string): string {
    const ext = (name.split(".").pop() || "").toUpperCase();
    if (mime.startsWith("image/")) return ext ? `Image · ${ext}` : "Image";
    if (mime.startsWith("audio/")) return ext ? `Audio · ${ext}` : "Audio";
    if (mime.startsWith("video/")) return ext ? `Video · ${ext}` : "Video";
    if (mime.startsWith("text/") || mime.includes("json")) return ext ? `Text · ${ext}` : "Text";
    return ext ? `File · ${ext}` : "File";
}

/** A file the agent handed over. The download icon appears on hover. */
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
    const heading = title?.trim() || name.replace(/\.[^.]+$/, "") || name;
    const canDownload = Boolean(src.trim());

    return (
        <div className="group/file my-2 flex max-w-md items-center gap-3 squircle-2xl border border-border bg-surface-3 px-3 py-2">
            <span className="flex size-9 shrink-0 items-center justify-center text-text-secondary">
                <Icon icon={Document20Regular} className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-primary">{heading}</span>
                <span className="block truncate text-xs text-text-muted">{kindLabel(mime, name)}</span>
            </span>
            <button
                type="button"
                aria-label={`Download ${heading}`}
                disabled={!canDownload}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-secondary opacity-0 transition-opacity hover:bg-panel-hover hover:text-text-primary group-hover/file:opacity-100 disabled:pointer-events-none"
                onClick={() => {
                    if (canDownload) void saveDownloadOrNotify(name, src, mime);
                }}
            >
                <Icon icon={ArrowDownload20Regular} />
            </button>
        </div>
    );
}

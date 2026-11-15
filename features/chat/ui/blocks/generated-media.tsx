"use client";

import { ArrowDownload20Regular } from "@fluentui/react-icons/headless/svg/arrow-download";
import { ArrowMaximize20Regular } from "@fluentui/react-icons/headless/svg/arrow-maximize";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend/commands";
import { saveDownloadBytesOrNotify, saveDownloadOrNotify } from "@/lib/ui/save-download";
import { MediaLightbox } from "./lightbox";
import { GeneratingMediaFrame } from "./border-glow";

export type GeneratedMediaKind = "svg" | "image" | "audio";

function defaultName(kind: GeneratedMediaKind, prompt?: string, given?: string): string {
    if (given?.trim()) return given.trim();
    const slug = (prompt || "generated").replace(/[^\w.-]+/g, "-").slice(0, 40);
    if (kind === "svg") return `${slug}.svg`;
    if (kind === "audio") return `${slug}.mp3`;
    return `${slug}.png`;
}

function mimeFor(kind: GeneratedMediaKind, mime?: string): string {
    if (mime) return mime;
    if (kind === "svg") return "image/svg+xml";
    if (kind === "audio") return "audio/mpeg";
    return "image/png";
}

function bytesToUrl(bytes: Uint8Array, mime: string): string {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return URL.createObjectURL(new Blob([copy.buffer], { type: mime }));
}

export function GeneratedMediaCard({
    kind,
    src,
    prompt,
    failed,
    mediaId,
    name,
}: {
    kind: GeneratedMediaKind;
    src?: string;
    prompt?: string;
    failed?: boolean;
    mediaId?: string;
    name?: string;
}) {
    const [resolvedSrc, setResolvedSrc] = useState((src || "").trim());
    const [bytes, setBytes] = useState<Uint8Array | null>(null);
    const [mime, setMime] = useState(mimeFor(kind));
    const [fileName, setFileName] = useState(defaultName(kind, prompt, name));
    const [loading, setLoading] = useState(Boolean(mediaId) && !(src || "").trim());
    const [missing, setMissing] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const given = (src || "").trim();
        if (given) {
            setResolvedSrc(given);
            setLoading(false);
        }
        if (!mediaId) return;
        let cancelled = false;
        setLoading(true);
        void commands
            .readMedia(mediaId)
            .then((payload) => {
                if (cancelled) return;
                const next = Uint8Array.from(payload.bytes);
                const nextMime = payload.mime || mimeFor(kind);
                setBytes(next);
                setMime(nextMime);
                setFileName(defaultName(kind, prompt || payload.prompt || undefined, name || payload.name || undefined));
                if (!given) setResolvedSrc(bytesToUrl(next, nextMime));
                setLoading(false);
            })
            .catch(() => {
                if (cancelled) return;
                setMissing(true);
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [kind, mediaId, name, prompt, src]);

    if (failed || missing) return null;
    if (loading) {
        return <GeneratingMediaFrame />;
    }
    if (!resolvedSrc) return null;

    const download = (as?: "png" | "jpeg") => {
        const base = fileName.replace(/\.[^.]+$/, "") || "image";
        if (!as) {
            if (bytes) {
                void saveDownloadBytesOrNotify(fileName, bytes, mime);
                return;
            }
            void saveDownloadOrNotify(fileName, resolvedSrc, mime);
            return;
        }
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth || 1;
            canvas.height = img.naturalHeight || 1;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            if (as === "jpeg") {
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(img, 0, 0);
            const nextMime = as === "png" ? "image/png" : "image/jpeg";
            const url = canvas.toDataURL(nextMime, 0.92);
            void saveDownloadOrNotify(`${base}.${as === "png" ? "png" : "jpg"}`, url, nextMime);
        };
        img.src = resolvedSrc;
    };

    const preview =
        kind === "audio" ? (
            <audio
                controls
                src={resolvedSrc}
                className="w-full max-w-[360px]"
                preload="metadata"
                aria-label={prompt || "Generated audio"}
                onError={() => setMissing(true)}
            />
        ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={resolvedSrc}
                alt={prompt || ""}
                className={cn(
                    "block h-auto w-full max-w-[360px] cursor-zoom-in rounded-[18px]",
                    kind === "svg" ? "max-h-[420px] object-contain" : "max-h-[420px] object-cover",
                )}
                onClick={() => setOpen(true)}
                onError={() => setMissing(true)}
            />
        );

    return (
        <div className="group/media relative my-2 w-fit max-w-[360px] overflow-hidden rounded-[18px]">
            {preview}
            {kind === "image" || kind === "svg" ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center">
                    <div className="flex -translate-y-full gap-1.5 pt-2 opacity-0 transition duration-200 ease-out group-hover/media:pointer-events-auto group-hover/media:translate-y-0 group-hover/media:opacity-100">
                        <button
                            type="button"
                            aria-label="Expand"
                            className="flex size-7 items-center justify-center rounded-full bg-black/70 text-white"
                            onClick={() => setOpen(true)}
                        >
                            <Icon icon={ArrowMaximize20Regular} />
                        </button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    aria-label="Download"
                                    className="flex size-7 items-center justify-center rounded-full bg-black/70 text-white"
                                >
                                    <Icon icon={ArrowDownload20Regular} />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center">
                                <DropdownMenuItem onClick={() => download()}>Original</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => download("png")}>PNG</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => download("jpeg")}>JPEG</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            ) : (
                <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => download()}>
                    Download
                </Button>
            )}
            <MediaLightbox
                open={open}
                onClose={() => setOpen(false)}
                src={resolvedSrc}
                title={prompt || fileName}
                kind="image"
            />
        </div>
    );
}

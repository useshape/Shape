"use client";

import { ArrowMaximize20Regular } from "@fluentui/react-icons/headless/svg/arrow-maximize";
import React, { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend/commands";
import { saveDownloadBytesOrNotify, saveDownloadOrNotify } from "@/lib/ui/save-download";
import { MediaLightbox } from "./lightbox";
import { ModelPreview } from "./model-preview";

export type GeneratedMediaKind = "svg" | "image" | "audio" | "model";

function defaultName(kind: GeneratedMediaKind, prompt?: string, given?: string): string {
    if (given?.trim()) return given.trim();
    const slug = (prompt || "generated").replace(/[^\w.-]+/g, "-").slice(0, 40);
    if (kind === "model") return `${slug}.glb`;
    if (kind === "svg") return `${slug}.svg`;
    if (kind === "audio") return `${slug}.mp3`;
    return `${slug}.png`;
}

function mimeFor(kind: GeneratedMediaKind, mime?: string): string {
    if (mime) return mime;
    if (kind === "model") return "model/gltf-binary";
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
    const [error, setError] = useState<string | null>(null);
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
            .catch((err) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : String(err));
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [kind, mediaId, name, prompt, src]);

    const label = useMemo(() => {
        if (kind === "svg") return "SVG";
        if (kind === "audio") return "Audio";
        if (kind === "model") return "3D model";
        return "Image";
    }, [kind]);

    if (failed) {
        return <p className="my-2 text-sm text-text-muted">{label} generation failed</p>;
    }
    if (error) {
        return <p className="my-2 text-sm text-text-muted">{error}</p>;
    }
    if (loading) {
        return (
            <div
                className="preview-shimmer my-2 h-[280px] w-full max-w-[360px] overflow-hidden rounded-[18px]"
                aria-hidden
            >
                <span className="preview-shimmer-blob" />
            </div>
        );
    }
    if (!resolvedSrc) return null;

    const download = () => {
        if (bytes) {
            void saveDownloadBytesOrNotify(fileName, bytes, mime);
            return;
        }
        void saveDownloadOrNotify(fileName, resolvedSrc, mime);
    };

    const preview =
        kind === "audio" ? (
            <audio
                controls
                src={resolvedSrc}
                className="w-full max-w-[360px]"
                preload="metadata"
                aria-label={prompt || "Generated audio"}
            />
        ) : kind === "model" ? (
            <ModelPreview src={resolvedSrc} />
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
            />
        );

    return (
        <div className="my-2 flex max-w-[360px] flex-col gap-2">
            <div className="relative">
                {preview}
                {kind === "model" || kind === "image" || kind === "svg" ? (
                    <button
                        type="button"
                        className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-md bg-black/55 text-white hover:bg-black/70"
                        aria-label="Expand"
                        onClick={() => setOpen(true)}
                    >
                        <Icon icon={ArrowMaximize20Regular} />
                    </button>
                ) : null}
            </div>
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={download}>
                Download
            </Button>
            <MediaLightbox
                open={open}
                onClose={() => setOpen(false)}
                src={resolvedSrc}
                title={prompt || fileName}
                kind={kind === "model" ? "model" : "image"}
            />
        </div>
    );
}

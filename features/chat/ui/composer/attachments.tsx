"use client";

import { Camera20Filled } from "@fluentui/react-icons/headless/svg/camera";
import { Code20Regular } from "@fluentui/react-icons/headless/svg/code";
import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { Document20Regular } from "@fluentui/react-icons/headless/svg/document";
import { Options20Regular } from "@fluentui/react-icons/headless/svg/options";
import { WindowConsole20Regular } from "@fluentui/react-icons/headless/svg/window-console";



import React from "react";
import { type IconGlyph, Icon } from "@/components/ui/icon";


import { FileIcon } from "@/components/ui/file-icon";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
const IMAGE_EXTENSIONS = new Set([
    "png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico", "tiff", "tif", "avif", "heic", "heif",
]);

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "flac", "aac", "wma"]);

export type AttachmentKind = "image" | "audio" | "file" | "terminal" | "code";

export type ComposerAttachment = {
    id: string;
    file: File;
    name: string;
    kind: AttachmentKind;
    status: "processing" | "ready" | "error";
    /** Prepared data URL for vision (compressed). */
    dataUrl?: string;
    mimeType: string;
    size: number;
    error?: string;
    /** Normalized 0–1 bar heights for an audio waveform. */
    peaks?: number[];
};

function getFileExtension(name: string): string {
    const parts = name.split(".");
    return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

export function isImageFile(file: File): boolean {
    if (file.type.startsWith("image/")) return true;
    return IMAGE_EXTENSIONS.has(getFileExtension(file.name));
}

export function isAudioFile(file: File): boolean {
    if (file.type.startsWith("audio/")) return true;
    return AUDIO_EXTENSIONS.has(getFileExtension(file.name));
}

export function attachmentKind(file: File): AttachmentKind {
    if (file.type === "text/x-shape-terminal") return "terminal";
    if (file.type === "text/x-shape-code") return "code";
    if (isImageFile(file)) return "image";
    if (isAudioFile(file)) return "audio";
    return "file";
}

function newId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Downscale large images so vision tokens stay cheap. */
async function compressImageFile(file: File): Promise<{ dataUrl: string; mimeType: string }> {
    const ext = getFileExtension(file.name);
    // Keep animated / vector as-is (or read raw).
    if (ext === "gif" || ext === "svg" || file.type === "image/gif" || file.type === "image/svg+xml") {
        const dataUrl = await readAsDataUrl(file);
        return { dataUrl, mimeType: file.type || "image/gif" };
    }

    const bitmap = await createImageBitmap(file);
    const maxEdge = 1280;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        bitmap.close();
        const dataUrl = await readAsDataUrl(file);
        return { dataUrl, mimeType: file.type || "image/jpeg" };
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const preferPng = file.type === "image/png" || ext === "png" || ext === "webp";
    const mimeType = preferPng ? "image/png" : "image/jpeg";
    const dataUrl = canvas.toDataURL(mimeType, preferPng ? undefined : 0.82);
    return { dataUrl, mimeType };
}

function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function createPendingAttachment(file: File, peaks?: number[]): ComposerAttachment {
    return {
        id: newId(),
        file,
        name: file.name,
        kind: attachmentKind(file),
        status: "processing",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        peaks,
    };
}

export function formatAttachmentSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    const mb = bytes / (1024 * 1024);
    return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function Waveform({
    peaks,
    className,
}: {
    peaks: number[];
    className?: string;
}) {
    const bars = peaks.length ? peaks : [0.35, 0.6, 0.4, 0.8, 0.5, 0.7, 0.45, 0.3, 0.55];
    return (
        <span className={cn("flex h-6 items-center gap-0.5", className)} aria-hidden>
            {bars.map((peak, index) => (
                <span
                    key={index}
                    className="w-0.5 rounded-full bg-text-secondary"
                    style={{ height: `${Math.max(15, Math.round(peak * 100))}%` }}
                />
            ))}
        </span>
    );
}

export async function processAttachment(att: ComposerAttachment): Promise<ComposerAttachment> {
    const started = Date.now();
    const minMs = 1800;
    try {
        let result: ComposerAttachment;
        if (att.kind === "image") {
            const { dataUrl, mimeType } = await compressImageFile(att.file);
            let standardized = dataUrl;
            if (dataUrl.startsWith("data:image/jpg;base64,")) {
                standardized = dataUrl.replace("data:image/jpg;base64,", "data:image/jpeg;base64,");
            }
            result = {
                ...att,
                status: "ready",
                dataUrl: standardized,
                mimeType,
            };
        } else {
            result = { ...att, status: "ready" };
        }
        const wait = minMs - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        return result;
    } catch (err) {
        const wait = minMs - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        return {
            ...att,
            status: "error",
            error: err instanceof Error ? err.message : "Failed to process file",
        };
    }
}

function useObjectUrl(file: File | null, dataUrl?: string): string | null {
    const [url, setUrl] = React.useState<string | null>(dataUrl ?? null);

    React.useEffect(() => {
        if (dataUrl) {
            setUrl(dataUrl);
            return;
        }
        if (!file) {
            setUrl(null);
            return;
        }
        const next = URL.createObjectURL(file);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [file, dataUrl]);

    return url;
}

const KIND_ICON: Record<Exclude<AttachmentKind, "file">, IconGlyph> = {
    image: Camera20Filled,
    audio: Options20Regular,
    terminal: WindowConsole20Regular,
    code: Code20Regular,
};

function KindIcon({ kind, name }: { kind: AttachmentKind; name: string }) {
    if (kind === "file") return <FileIcon name={name} className="size-3.5" />;
    const Glyph = KIND_ICON[kind];
    return <Icon icon={Glyph} className="text-text-muted" />;
}

function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
    return (
        <Tooltip content={`Remove ${name}`} side="top">
            <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={onRemove}
                className="absolute -right-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-surface-1 text-text-secondary opacity-0 shadow-sm hover:text-text-primary group-hover:opacity-100"
            >
                <Icon icon={Dismiss20Regular} />
            </button>
        </Tooltip>
    );
}

function fileMark(kind: AttachmentKind, name: string): string | null {
    if (kind !== "audio") return null;
    const ext = getFileExtension(name);
    return (ext || "audio").slice(0, 4).toUpperCase();
}

/** Composer tile. Photos show the picture; everything else is a small card with a mark and the name. */
export function ComposerFileTile({
    kind,
    name,
    src,
    busy,
    failed,
}: {
    kind: AttachmentKind;
    name: string;
    src?: string | null;
    busy?: boolean;
    failed?: boolean;
}) {
    const mark = fileMark(kind, name);
    return (
        <div
            className={cn(
                "relative h-16 w-28 overflow-hidden squircle-xl bg-surface-3",
                failed && "ring-1 ring-error",
            )}
            title={name}
        >
            {kind === "image" && src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="size-full object-cover" draggable={false} />
            ) : (
                <div className="flex h-full flex-col justify-between p-2">
                    <span className="flex h-4 items-center text-2xs font-medium uppercase tracking-wide text-text-muted">
                        {busy ? (
                            <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                        ) : mark ? (
                            mark
                        ) : (
                            <KindIcon kind={kind} name={name} />
                        )}
                    </span>
                    <span className={cn("truncate text-xs text-text-primary", failed && "text-error")}>
                        {failed ? "Failed" : name}
                    </span>
                </div>
            )}
        </div>
    );
}

/** Sent-message chip: icon, name, nothing else. */
export function MessageAttachmentPill({ kind, name }: { kind: AttachmentKind; name: string }) {
    return (
        <span
            className="inline-flex h-7 max-w-52 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-3 px-2 text-xs text-text-primary"
            title={name}
        >
            <KindIcon kind={kind} name={name} />
            <span className="min-w-0 truncate">{name}</span>
        </span>
    );
}

function AttachmentPill({
    attachment,
    onRemove,
}: {
    attachment: ComposerAttachment;
    onRemove: () => void;
}) {
    const preview = useObjectUrl(
        attachment.kind === "image" ? attachment.file : null,
        attachment.dataUrl,
    );
    const busy = attachment.status === "processing";
    const failed = attachment.status === "error";
    return (
        <div className="group relative shrink-0">
            <ComposerFileTile
                kind={attachment.kind}
                name={attachment.name}
                src={preview}
                busy={busy}
                failed={failed}
            />
            <RemoveButton name={attachment.name} onRemove={onRemove} />
        </div>
    );
}

export function ComposerAttachments({
    attachments,
    onRemove,
}: {
    attachments: ComposerAttachment[];
    onRemove: (id: string) => void;
}) {
    if (attachments.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-3 overflow-visible px-3 pt-3">
            {attachments.map((att) => (
                <AttachmentPill
                    key={att.id}
                    attachment={att}
                    onRemove={() => onRemove(att.id)}
                />
            ))}
        </div>
    );
}

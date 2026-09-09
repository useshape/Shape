"use client";

import { RiCloseLine, RiImageLine, RiMusic2Line } from "@remixicon/react";
import React from "react";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { MorphMenu } from "@/components/ui/morph-menu";

const IMAGE_EXTENSIONS = new Set([
    "png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico", "tiff", "tif", "avif", "heic", "heif",
]);

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "flac", "aac", "wma"]);

export type AttachmentKind = "image" | "audio" | "file";

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
    if (isImageFile(file)) return "image";
    if (isAudioFile(file)) return "audio";
    return "file";
}

function newId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Downscale large images so vision tokens stay cheap (native multimodal, no OCR model). */
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

export function createPendingAttachment(file: File): ComposerAttachment {
    return {
        id: newId(),
        file,
        name: file.name,
        kind: attachmentKind(file),
        status: "processing",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
    };
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

function KindIcon({ kind, name }: { kind: AttachmentKind; name: string }) {
    if (kind === "audio") {
        return <Icon icon={RiMusic2Line} className="text-text-muted" />;
    }
    if (kind === "file") {
        return <FileIcon name={name} className="size-4" />;
    }
    return <Icon icon={RiImageLine} className="text-text-muted" />;
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
        <div
            className={cn(
                "group/attach relative inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-full border border-border pl-1 pr-2",
                "animate-in fade-in zoom-in-95 duration-200",
                failed && "border-error/40",
            )}
        >
            <div className="relative flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-3">
                {busy ? (
                    <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                        <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-accent border-t-transparent" />
                    </span>
                ) : attachment.kind === "image" && preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={preview}
                        alt=""
                        className="size-full object-cover animate-in fade-in duration-200"
                        draggable={false}
                    />
                ) : (
                    <KindIcon kind={attachment.kind} name={attachment.name} />
                )}
            </div>
            <span
                className={cn(
                    "min-w-0 truncate text-sm text-text-primary",
                    failed && "text-error",
                    busy && "text-text-muted",
                )}
                title={attachment.error || attachment.name}
            >
                {busy ? "Processing…" : attachment.name}
            </span>
            <Tooltip content={`Remove ${attachment.name}`} side="top">
                <button
                    type="button"
                    aria-label={`Remove ${attachment.name}`}
                    onClick={onRemove}
                    className={cn(
                        "ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-text-muted",
                        "opacity-0 transition-opacity group-hover/attach:opacity-100 focus-visible:opacity-100",
                        "hover:bg-panel-hover hover:text-text-primary",
                    )}
                >
                    <Icon icon={RiCloseLine} />
                </button>
            </Tooltip>
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
        <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
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

/** Compact-mode media pill — same morph pattern as Changes above the composer. */
export function ComposerAttachmentsStrip({
    attachments,
    onRemove,
}: {
    attachments: ComposerAttachment[];
    onRemove: (id: string) => void;
}) {
    if (attachments.length === 0) return null;

    const openH = Math.min(220, 48 + attachments.length * 36);
    const busy = attachments.some((a) => a.status === "processing");

    return (
        <MorphMenu
            variant="morph"
            aria-label="Attachments"
            openWidth={280}
            openHeight={openH}
            closedHeight={32}
            trigger={
                <>
                    <span>Media</span>
                    <span className="tabular-nums text-text-muted">
                        {busy ? "…" : attachments.length}
                    </span>
                </>
            }
        >
            <div className="flex flex-col gap-1 p-2">
                {attachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-1">
                        <AttachmentPill
                            attachment={att}
                            onRemove={() => onRemove(att.id)}
                        />
                    </div>
                ))}
            </div>
        </MorphMenu>
    );
}

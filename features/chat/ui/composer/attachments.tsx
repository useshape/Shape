"use client";

import React from "react";
import { Icon } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

const IMAGE_EXTENSIONS = new Set([
    "png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico", "tiff", "tif", "avif", "heic", "heif",
]);

function getFileExtension(name: string): string {
    const parts = name.split(".");
    return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

export function isImageFile(file: File): boolean {
    if (file.type.startsWith("image/")) return true;
    return IMAGE_EXTENSIONS.has(getFileExtension(file.name));
}

function useObjectUrl(file: File | null): string | null {
    const [url, setUrl] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!file) {
            setUrl(null);
            return;
        }
        const next = URL.createObjectURL(file);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [file]);

    return url;
}

function AttachmentThumb({
    file,
    onRemove,
}: {
    file: File;
    onRemove: () => void;
}) {
    const isImg = isImageFile(file);
    const objectUrl = useObjectUrl(isImg ? file : null);

    return (
        <div className="group/attach relative size-14 shrink-0">
            <div
                className={cn(
                    "size-full overflow-hidden rounded-xl border border-border-subtle bg-panel",
                    "transition-colors duration-150 group-hover/attach:border-border",
                )}
            >
                {isImg && objectUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={objectUrl}
                        alt={file.name}
                        className="size-full object-cover"
                        draggable={false}
                    />
                ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-0.5 px-1">
                        <FileIcon name={file.name} className="size-5" />
                        <span className="max-w-full truncate text-[9px] leading-none text-text-muted">
                            {getFileExtension(file.name) || "file"}
                        </span>
                    </div>
                )}
            </div>

            <Tooltip content={`Remove ${file.name}`} side="top">
                <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={onRemove}
                    className={cn(
                        "absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full",
                        "border border-border-subtle bg-panel text-text-muted",
                        "opacity-0 transition-opacity duration-150",
                        "hover:bg-panel-hover hover:text-text-primary",
                        "group-hover/attach:opacity-100 focus-visible:opacity-100",
                    )}
                >
                    <Icon name="close" size={11} />
                </button>
            </Tooltip>
        </div>
    );
}

export function ComposerAttachments({
    files,
    onRemove,
}: {
    files: File[];
    onRemove: (index: number) => void;
}) {
    if (files.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2 px-3 pt-2.5">
            {files.map((file, i) => (
                <AttachmentThumb
                    key={`${file.name}-${file.size}-${file.lastModified}-${i}`}
                    file={file}
                    onRemove={() => onRemove(i)}
                />
            ))}
        </div>
    );
}

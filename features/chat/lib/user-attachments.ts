import type { ComposerAttachment } from "../ui/composer/attachments";

const ATTACHMENT_BLOCK_RE =
    /<attached_(image|file|asset)\b([^>]*)>([\s\S]*?)<\/attached_\1>/g;
const ATTACHMENT_NAME_RE = /\bname="([^"]*)"/;
const ATTACHMENT_TYPE_RE = /\btype="([^"]*)"/;
const ATTACHMENT_SIZE_RE = /\bsize="(\d+)"/;

export type ParsedUserAttachment = {
    name: string;
    kind: "image" | "file" | "audio";
    mimeType: string;
    size: number;
    /** Present for images (and inlined assets) — used for thumbs / restore. */
    dataUrl?: string;
};

/** Split a stored user message into display text + structured attachments. */
export function parseUserAttachments(content: string): {
    text: string;
    attachments: ParsedUserAttachment[];
} {
    if (!content.includes("<attached_")) {
        return { text: content, attachments: [] };
    }

    const attachments: ParsedUserAttachment[] = [];
    const text = content
        .replace(ATTACHMENT_BLOCK_RE, (_full, tag: string, attrs: string, body: string) => {
            const name = attrs.match(ATTACHMENT_NAME_RE)?.[1] || "attachment";
            const mimeType = attrs.match(ATTACHMENT_TYPE_RE)?.[1] || "application/octet-stream";
            const size = Number(attrs.match(ATTACHMENT_SIZE_RE)?.[1] || "0") || 0;
            const trimmed = body.trim();
            const dataUrl = trimmed.startsWith("data:") ? trimmed : undefined;

            let kind: ParsedUserAttachment["kind"] = "file";
            if (tag === "image" || mimeType.startsWith("image/")) kind = "image";
            else if (mimeType.startsWith("audio/") || tag === "file" && /audio/i.test(mimeType)) {
                kind = "audio";
            }

            attachments.push({ name, kind, mimeType, size, dataUrl });
            return "";
        })
        .trim();

    return { text, attachments };
}

function newId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Rebuild composer chips from a restored user message (no raw tags in the input). */
export async function attachmentsToComposer(
    parsed: ParsedUserAttachment[],
): Promise<ComposerAttachment[]> {
    const out: ComposerAttachment[] = [];
    for (const att of parsed) {
        let file: File;
        if (att.dataUrl) {
            try {
                const res = await fetch(att.dataUrl);
                const blob = await res.blob();
                file = new File([blob], att.name, { type: att.mimeType || blob.type });
            } catch {
                file = new File([], att.name, { type: att.mimeType });
            }
        } else {
            file = new File([], att.name, { type: att.mimeType });
        }
        out.push({
            id: newId(),
            file,
            name: att.name,
            kind: att.kind === "audio" ? "audio" : att.kind === "image" ? "image" : "file",
            status: "ready",
            dataUrl: att.kind === "image" ? att.dataUrl : undefined,
            mimeType: att.mimeType,
            size: att.size || file.size,
        });
    }
    return out;
}

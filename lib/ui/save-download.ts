import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";

export function extensionOf(name: string, mime?: string): string {
    const fromName = name.split(".").pop()?.trim().toLowerCase();
    if (fromName && fromName !== name.toLowerCase() && /^[a-z0-9]{1,8}$/.test(fromName)) {
        return fromName;
    }
    const fromMime = mime?.split("/")[1]?.split("+")[0]?.split(";")[0]?.trim().toLowerCase();
    if (fromMime && /^[a-z0-9]{1,8}$/.test(fromMime)) return fromMime;
    return "bin";
}

export function bytesFromDataUrl(src: string): Uint8Array {
    const comma = src.indexOf(",");
    if (!src.startsWith("data:") || comma < 0) {
        throw new Error("Not a data URL");
    }
    const header = src.slice(5, comma);
    const body = src.slice(comma + 1);
    if (header.includes(";base64")) {
        const binary = atob(body);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
    const decoded = decodeURIComponent(body);
    return new TextEncoder().encode(decoded);
}

async function bytesFromSrc(src: string): Promise<Uint8Array> {
    const trimmed = src.trim();
    if (trimmed.startsWith("data:")) return bytesFromDataUrl(trimmed);
    const res = await fetch(trimmed);
    if (!res.ok) throw new Error(`Could not read file (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
}

export async function saveDownload(name: string, src: string, mime?: string): Promise<boolean> {
    const ext = extensionOf(name, mime);
    const { save } = await import("@tauri-apps/plugin-dialog");
    const selected = await save({
        defaultPath: name,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (typeof selected !== "string") return false;
    const bytes = await bytesFromSrc(src);
    await commands.saveFileBytes(selected, Array.from(bytes));
    return true;
}

export async function saveDownloadOrNotify(name: string, src: string, mime?: string): Promise<void> {
    try {
        const saved = await saveDownload(name, src, mime);
        if (saved) notify.success("Saved", name);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        notify.error("Save failed", message);
    }
}

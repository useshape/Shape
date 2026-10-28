"use client";

export const IMAGE_MODELS = [
    { id: "klein", label: "Klein" },
    { id: "klein9", label: "Klein 9" },
    { id: "mini", label: "Mini" },
] as const;

export type ImageModelId = (typeof IMAGE_MODELS)[number]["id"];

export type ImageComposerPrefs = {
    model: ImageModelId;
    count: number;
};

const KEY = "shape:image-composer";

let current: ImageComposerPrefs = { model: "klein", count: 1 };
const listeners = new Set<() => void>();

function clampCount(value: number) {
    if (!Number.isFinite(value)) return 1;
    return Math.min(4, Math.max(1, Math.round(value)));
}

function isModel(value: string): value is ImageModelId {
    return IMAGE_MODELS.some((model) => model.id === value);
}

function load() {
    if (typeof window === "undefined") return;
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<ImageComposerPrefs>;
        if (raw.model && isModel(raw.model)) current = { ...current, model: raw.model };
        if (typeof raw.count === "number") current = { ...current, count: clampCount(raw.count) };
    } catch {
        /* ignore */
    }
}

if (typeof window !== "undefined") load();

function emit() {
    for (const listener of listeners) listener();
}

export function subscribeImageComposer(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getImageComposerPrefs(): ImageComposerPrefs {
    return current;
}

export function setImageComposerPrefs(patch: Partial<ImageComposerPrefs>) {
    const next: ImageComposerPrefs = {
        model: patch.model && isModel(patch.model) ? patch.model : current.model,
        count: patch.count === undefined ? current.count : clampCount(patch.count),
    };
    if (next.model === current.model && next.count === current.count) return;
    current = next;
    try {
        localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
        /* ignore */
    }
    emit();
}

/** Model-facing instruction. The visible bubble stays the user's prompt. */
export function imageGenerationPrefix(prefs: ImageComposerPrefs, mediaId?: string | null) {
    const count = clampCount(prefs.count);
    const noun = count === 1 ? "image" : "images";
    const reference = mediaId?.trim() ? ` Use media_id=${mediaId.trim()} as the reference.` : "";
    return `Generate ${count} ${noun} with @${prefs.model}.${reference}`;
}

"use client";

import { useSyncExternalStore } from "react";

/** Live state of one design-review persona, fed by `agent-persona` events. */
export type PersonaLive = {
    reviewId: string;
    personaId: string;
    name: string;
    profile: string;
    goal: string;
    status: "running" | "done" | "failed" | "stopped";
    step: number;
    steps: number;
    url: string;
    title: string;
    image: string;
    note: string;
    report: Record<string, unknown> | null;
};

type Payload = Partial<PersonaLive> & { reviewId?: string; personaId?: string };

const reviews = new Map<string, Map<string, PersonaLive>>();
const listeners = new Set<() => void>();
let listening = false;
let version = 0;

function emit() {
    version += 1;
    for (const listener of listeners) listener();
}

function apply(payload: Payload) {
    const { reviewId, personaId } = payload;
    if (!reviewId || !personaId) return;
    const review = reviews.get(reviewId) ?? new Map<string, PersonaLive>();
    const prev = review.get(personaId);
    const status =
        payload.status === "done" || payload.status === "failed" || payload.status === "stopped"
            ? payload.status
            : "running";
    review.set(personaId, {
        reviewId,
        personaId,
        name: payload.name || prev?.name || "Persona",
        profile: payload.profile || prev?.profile || "",
        goal: payload.goal || prev?.goal || "",
        status,
        step: typeof payload.step === "number" ? payload.step : prev?.step ?? 0,
        steps: typeof payload.steps === "number" ? payload.steps : prev?.steps ?? 0,
        url: payload.url || prev?.url || "",
        title: payload.title || prev?.title || "",
        image: payload.image || prev?.image || "",
        note: payload.note || prev?.note || "",
        report: (payload.report as Record<string, unknown> | undefined) ?? prev?.report ?? null,
    });
    reviews.set(reviewId, review);
    emit();
}

export function ensurePersonaListener() {
    if (listening || typeof window === "undefined") return;
    listening = true;
    void import("@tauri-apps/api/event")
        .then(({ listen }) => listen<Payload>("agent-persona", (event) => apply(event.payload || {})))
        .catch(() => {
            listening = false;
        });
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    ensurePersonaListener();
    return () => {
        listeners.delete(listener);
    };
}

function getVersion() {
    return version;
}

/** Live personas for one review, in launch order. */
export function usePersonaReview(reviewId: string | undefined): PersonaLive[] {
    useSyncExternalStore(subscribe, getVersion, getVersion);
    if (!reviewId) return [];
    const review = reviews.get(reviewId);
    return review ? Array.from(review.values()) : [];
}

"use client";

import { ActionLine } from "./action-line";

export function ReviewDebatePanel({
    status,
}: {
    content: string;
    model?: string;
    status?: string;
}) {
    const state = (status || "done").toLowerCase();
    if (state === "running") {
        return <ActionLine action="Reviewing" />;
    }
    if (state === "cancelled") {
        return <ActionLine action="Review cancelled" />;
    }
    if (state === "error" || state === "failed") {
        return <ActionLine action="Review failed" />;
    }
    return <ActionLine action="Reviewed" />;
}

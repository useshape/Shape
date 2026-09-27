"use client";

import { useMemo, useState } from "react";
import { ICON_SIZE_SM, SolarIcon, type SolarIconName } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { PluginLogo } from "@/components/ui/plugin-logo";
import { cn } from "@/lib/utils";
import { Collapse } from "./collapse";

type Fact = { label: string; value: string };
type Row = { title: string; meta: string };

const TITLE_KEYS = ["title", "name", "subject", "summary", "text", "message", "headline"];
const SKIP_KEYS = new Set([
    "id", "slug", "toolkit", "logo", "icon", "successful", "success", "error", "errors",
    "logs", "logid", "requestid", "response",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function scalar(value: unknown): string | null {
    if (typeof value === "string") {
        const text = value.replace(/\s+/g, " ").trim();
        if (!text || text.length > 80) return text.length > 80 ? null : text;
        return text;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return null;
}

function labelize(key: string): string {
    return key
        .replace(/[_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function unwrap(value: unknown): unknown {
    const record = asRecord(value);
    if (!record) return value;
    for (const key of ["data", "result", "response", "payload"]) {
        if (record[key] && typeof record[key] === "object") return record[key];
    }
    return value;
}

function rowFrom(value: unknown): Row | null {
    const record = asRecord(value);
    if (!record) {
        const text = scalar(value);
        return text ? { title: text, meta: "" } : null;
    }
    let title = "";
    for (const key of TITLE_KEYS) {
        const text = scalar(record[key]);
        if (text) {
            title = text;
            break;
        }
    }
    if (!title) {
        const first = Object.values(record).map(scalar).find(Boolean);
        title = first || "Item";
    }
    const meta = Object.entries(record)
        .filter(([key]) => !TITLE_KEYS.includes(key.toLowerCase()))
        .map(([, v]) => scalar(v))
        .filter((v): v is string => Boolean(v))
        .slice(0, 2)
        .join(" · ");
    return { title, meta };
}

export function summarizePluginPayload(raw: string): {
    title: string | null;
    facts: Fact[];
    rows: Row[];
    progress: { done: number; total: number } | null;
    attention: number;
} {
    const empty = { title: null, facts: [] as Fact[], rows: [] as Row[], progress: null, attention: 0 };
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "Awaiting approval" || /^(Rejected|Cancelled)$/i.test(trimmed)) return empty;
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return empty;
    }
    const root = unwrap(parsed);
    const record = asRecord(root);
    if (!record) {
        if (Array.isArray(root)) {
            return { ...empty, rows: root.map(rowFrom).filter((r): r is Row => Boolean(r)).slice(0, 8) };
        }
        return empty;
    }

    let title: string | null = null;
    for (const key of TITLE_KEYS) {
        const text = scalar(record[key]);
        if (text) {
            title = text;
            break;
        }
    }

    const facts: Fact[] = [];
    let rows: Row[] = [];
    let done: number | null = null;
    let total: number | null = null;
    let attention = 0;

    for (const [key, value] of Object.entries(record)) {
        const lower = key.toLowerCase();
        if (TITLE_KEYS.includes(lower) || SKIP_KEYS.has(lower)) continue;
        if (Array.isArray(value)) {
            const next = value.map(rowFrom).filter((r): r is Row => Boolean(r));
            if (next.length > rows.length) rows = next;
            if (/attention|unread|overdue|alert|pending/.test(lower)) attention = Math.max(attention, next.length);
            continue;
        }
        const text = scalar(value);
        if (!text) continue;
        if (/attention|unread|overdue/.test(lower)) {
            const n = Number(text);
            if (Number.isFinite(n)) attention = Math.max(attention, n);
        }
        if (/^(done|completed|finished)$/.test(lower)) {
            const n = Number(text);
            if (Number.isFinite(n)) done = n;
        }
        if (/^(total|count|goal)$/.test(lower)) {
            const n = Number(text);
            if (Number.isFinite(n)) total = n;
        }
        if (facts.length < 4) facts.push({ label: labelize(key), value: text });
    }

    const progress =
        done != null && total != null && total > 0
            ? { done, total }
            : null;

    return { title, facts, rows: rows.slice(0, 8), progress, attention };
}

/** Small mark beside the plugin logo: what this call is doing. */
function taskIcon(slug: string | undefined, label: string): SolarIconName {
    const text = `${slug || ""} ${label}`.toLowerCase();
    if (/comment|reply|message|send|post|mail/.test(text)) return "letter";
    if (/create|add|new|open/.test(text)) return "add-circle";
    if (/list|search|find|get|fetch/.test(text)) return "magnifier";
    if (/update|edit|patch/.test(text)) return "pen";
    if (/delete|remove|close/.test(text)) return "trash-bin-trash";
    if (/assign|user|member/.test(text)) return "user";
    return "bolt";
}

function factIcon(label: string): SolarIconName | null {
    const text = label.toLowerCase();
    if (/team|user|from|assignee|owner/.test(text)) return "users-group-rounded";
    if (/priority|urgent/.test(text)) return "bolt";
    if (/date|due|sent|when|time/.test(text)) return "calendar";
    if (/channel|chat/.test(text)) return "chat-round-line";
    if (/state|status/.test(text)) return "check-circle";
    if (/repo|pull|pr|branch/.test(text)) return "git-pull-request";
    if (/project/.test(text)) return "folder";
    return null;
}

export function PluginActivityCard({
    toolkit,
    slug,
    label,
    body,
    status,
    pending,
    busy,
    onAllow,
    onReject,
}: {
    toolkit: string;
    slug?: string;
    label: string;
    body: string;
    status: string;
    pending?: boolean;
    busy?: boolean;
    onAllow?: () => void;
    onReject?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const summary = useMemo(() => summarizePluginPayload(body), [body]);
    const title = summary.title || label;
    const toolkitName = toolkit.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const failed = status === "error" || status === "rejected" || status === "cancelled";
    const statusWord =
        status === "rejected" ? "Rejected" : status === "cancelled" ? "Cancelled" : status === "error" ? "Failed" : null;
    const canExpand = summary.rows.length > 0 || summary.facts.length > 0;
    const attention = summary.attention || (summary.rows.length > 2 ? summary.rows.length : 0);
    const progressPct = summary.progress
        ? Math.max(0, Math.min(100, Math.round((summary.progress.done / summary.progress.total) * 100)))
        : null;

    const meta = summary.facts.slice(0, 3);

    return (
        <div className={cn("my-1 overflow-hidden squircle-[20px] bg-surface-3", failed && "opacity-80")}>
            <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="relative shrink-0">
                    <PluginLogo toolkit={toolkit} name={toolkitName} slug={slug} size={28} />
                    <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-surface-1 text-text-secondary">
                        <SolarIcon name={taskIcon(slug, label)} size={10} />
                    </span>
                </span>
                <button
                    type="button"
                    onClick={() => canExpand && setOpen((v) => !v)}
                    className={cn("flex min-w-0 flex-1 flex-col text-left", canExpand ? "cursor-pointer" : "cursor-default")}
                >
                    <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="truncate text-sm text-text-primary">{title}</span>
                        {statusWord ? <span className="shrink-0 text-xs text-error">{statusWord}</span> : null}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-text-muted">
                        <span className="shrink-0 truncate">{toolkitName}</span>
                        {meta.map((fact) => {
                            const icon = factIcon(fact.label);
                            return (
                                <span key={fact.label} className="inline-flex min-w-0 items-center gap-1">
                                    {icon ? <SolarIcon name={icon} size={12} className="shrink-0" /> : null}
                                    <span className="truncate">{fact.value}</span>
                                </span>
                            );
                        })}
                    </span>
                </button>
                {pending ? (
                    <span className="flex shrink-0 items-center gap-1">
                        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onReject}>
                            Skip
                        </Button>
                        <Button type="button" variant="default" size="sm" disabled={busy} onClick={onAllow}>
                            Allow
                        </Button>
                    </span>
                ) : (
                    <button
                        type="button"
                        onClick={() => canExpand && setOpen((v) => !v)}
                        className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary"
                    >
                        {summary.progress ? (
                            <span className="tabular-nums text-text-muted">
                                {summary.progress.done}/{summary.progress.total}
                            </span>
                        ) : attention > 0 ? (
                            <span>{attention} need attention</span>
                        ) : null}
                        {canExpand ? (
                            <SolarIcon
                                name="alt-arrow-down"
                                size={ICON_SIZE_SM}
                                className={cn("text-text-muted transition-transform duration-200", open && "rotate-180")}
                            />
                        ) : null}
                    </button>
                )}
            </div>
            {progressPct != null ? (
                <div className="mx-3 mb-2.5 h-1 overflow-hidden rounded-full bg-surface-4">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${progressPct}%` }} />
                </div>
            ) : null}
            <Collapse open={open && !pending}>
                {summary.rows.length ? (
                    <div className="flex flex-col gap-1 px-3 pb-2.5">
                        {summary.rows.map((row, index) => (
                            <div key={`${row.title}-${index}`} className="flex min-w-0 items-baseline gap-2 text-xs">
                                <span className="min-w-0 flex-1 truncate text-text-primary">{row.title}</span>
                                {row.meta ? <span className="shrink-0 truncate text-text-muted">{row.meta}</span> : null}
                            </div>
                        ))}
                    </div>
                ) : null}
            </Collapse>
        </div>
    );
}

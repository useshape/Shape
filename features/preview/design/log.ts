import { commands } from "@/lib/backend";

export type DesignLogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/** Stable for the lifetime of the Shape window — include this when pasting logs. */
export const DESIGN_LOG_SESSION =
    typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);

let opSeq = 0;

function safeJson(value: unknown): string {
    try {
        return JSON.stringify(value, (_k, v) => {
            if (typeof v === "bigint") return v.toString();
            if (v instanceof Error) {
                return { name: v.name, message: v.message, stack: v.stack };
            }
            return v;
        }, 2);
    } catch {
        try {
            return String(value);
        } catch {
            return "[unserializable]";
        }
    }
}

function flattenFields(fields?: Record<string, unknown>): string[] {
    if (!fields) return [];
    const lines: string[] = [];
    for (const [key, raw] of Object.entries(fields)) {
        if (raw === undefined) continue;
        if (raw === null || typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
            lines.push(`${key}: ${raw === null ? "null" : String(raw)}`);
            continue;
        }
        const rendered = safeJson(raw);
        if (!rendered.includes("\n")) {
            lines.push(`${key}: ${rendered}`);
            continue;
        }
        lines.push(`${key}:`);
        for (const line of rendered.split("\n")) lines.push(`  ${line}`);
    }
    return lines;
}

/**
 * Paste-friendly block for the Shape/dev terminal.
 * Copy from `── shape/design` through `── end` when reporting a bug.
 */
export function formatDesignLog(
    level: DesignLogLevel,
    event: string,
    fields?: Record<string, unknown>,
): string {
    const header = `── shape/design ${level} ${event}  ·  session=${DESIGN_LOG_SESSION}  t=${new Date().toISOString()}`;
    const body = flattenFields(fields);
    return [header, ...body, "── end"].join("\n");
}

function emitToTerminal(level: DesignLogLevel, block: string) {
    // Always mirror to the webview console so DevTools can capture it too.
    const cons =
        level === "ERROR"
            ? console.error
            : level === "WARN"
              ? console.warn
              : level === "DEBUG"
                ? console.debug
                : console.info;
    cons(block);
    void commands.designModeLog(level, block).catch(() => {
        // Backend unavailable (tests / non-Tauri) — console above is enough.
    });
}

/**
 * Writes design-mode diagnostics to the Tauri/dev terminal (not the project PTY).
 * Prefer a short `event` name (`apply:failed`, `select`, `bridge:ready`) plus structured fields.
 */
export function designLog(level: DesignLogLevel, event: string, fields?: Record<string, unknown>) {
    emitToTerminal(level, formatDesignLog(level, event, fields));
}

export type DesignOp = {
    id: string;
    name: string;
    info: (event: string, fields?: Record<string, unknown>) => void;
    warn: (event: string, fields?: Record<string, unknown>) => void;
    error: (event: string, fields?: Record<string, unknown>) => void;
    debug: (event: string, fields?: Record<string, unknown>) => void;
    done: (fields?: Record<string, unknown>) => void;
    fail: (fields?: Record<string, unknown>) => void;
};

/** Correlate a multi-step action (apply, bridge inject, export) under one `op=` id. */
export function beginDesignOp(name: string, fields?: Record<string, unknown>): DesignOp {
    const id = (++opSeq).toString(36);
    const withOp = (extra?: Record<string, unknown>) => ({ op: id, ...extra });
    designLog("INFO", `${name}:start`, withOp(fields));
    return {
        id,
        name,
        info: (event, extra) => designLog("INFO", event, withOp(extra)),
        warn: (event, extra) => designLog("WARN", event, withOp(extra)),
        error: (event, extra) => designLog("ERROR", event, withOp(extra)),
        debug: (event, extra) => designLog("DEBUG", event, withOp(extra)),
        done: (extra) => designLog("INFO", `${name}:done`, withOp(extra)),
        fail: (extra) => designLog("ERROR", `${name}:failed`, withOp(extra)),
    };
}

/** Summarize a pending edit for logs — keep it small enough to paste. */
export function summarizePendingEdit(edit: {
    id?: string;
    label?: string;
    tag?: string;
    className?: string;
    selector?: string;
    styles?: Record<string, unknown>;
    text?: string | null;
    source?: {
        fileName?: string;
        lineNumber?: number;
        columnNumber?: number;
        componentName?: string;
        mapped?: boolean;
        generated?: { fileName?: string } | null;
    } | null;
}) {
    const styleKeys = edit.styles
        ? Object.keys(edit.styles).filter((k) => {
              const v = edit.styles![k];
              return v != null && String(v).trim() !== "";
          })
        : [];
    return {
        id: edit.id,
        label: edit.label,
        tag: edit.tag,
        className: edit.className ? String(edit.className).slice(0, 120) : undefined,
        selector: edit.selector ? String(edit.selector).slice(0, 160) : undefined,
        styleKeys,
        textPreview: edit.text != null ? String(edit.text).slice(0, 80) : undefined,
        source: edit.source
            ? {
                  file: edit.source.fileName
                      ? `${edit.source.fileName.split(/[/\\]/).pop()}:${edit.source.lineNumber ?? "?"}:${edit.source.columnNumber ?? 1}`
                      : undefined,
                  component: edit.source.componentName,
                  mapped: edit.source.mapped ?? false,
                  generated: edit.source.generated?.fileName?.split(/[/\\]/).pop() ?? null,
              }
            : null,
    };
}

const BRIDGE_LEVELS = new Set<DesignLogLevel>(["DEBUG", "INFO", "WARN", "ERROR"]);

/** Forward a `shape-design-log` postMessage from the preview bridge into the terminal. */
export function ingestDesignBridgeLog(data: {
    level?: unknown;
    event?: unknown;
    fields?: unknown;
}) {
    const raw = String(data.level || "INFO").toUpperCase();
    const level = (BRIDGE_LEVELS.has(raw as DesignLogLevel) ? raw : "INFO") as DesignLogLevel;
    const event = String(data.event || "bridge");
    const fields =
        data.fields && typeof data.fields === "object" && !Array.isArray(data.fields)
            ? (data.fields as Record<string, unknown>)
            : {};
    designLog(level, event, { ...fields, via: "bridge" });
}

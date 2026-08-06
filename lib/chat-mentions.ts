import { commands } from "@/lib/backend/commands";
import { listDesignPreviewSessions } from "@/lib/design-preview-store";
import { hostnameOf } from "@/lib/favicon";
import { lookupMentionToken, registerMentionToken } from "@/lib/mention-registry";
import { getPreviewCurrentUrl } from "@/features/preview/store";

export type MentionKind =
    | "file"
    | "folder"
    | "codebase"
    | "selection"
    | "design"
    | "docs"
    | "terminal"
    | "chat"
    | "branch"
    | "browser";

export type ChatMention = {
    kind: MentionKind;
    path?: string;
    label: string;
    /** Design concept id when kind === "design"; chat id when kind === "chat" */
    id?: string;
};

/** Resolve `@browser:current` to the Preview panel URL when available. */
export function resolveBrowserMentionPath(path: string | undefined): string | null {
    if (!path || path === "current") {
        return getPreviewCurrentUrl();
    }
    return path;
}

/** Explicit typed tokens + bare paths / design names (no spaces). */
const MENTION_PATTERN =
    /@(?:(file|folder|design|docs|terminal|chat|branch|browser):([^\s]+)|(codebase|selection)\b|((?:[\w.-]+\/)*[\w.-]+\/?))/g;

function normalizeDesignKey(value: string): string {
    return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

/** Slug for typed mention tokens (no spaces; overlay must match textarea). */
export function slugifyMentionLabel(value: string): string {
    return value
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9._/-]+/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "item";
}

function unslugMentionLabel(value: string): string {
    return value.replace(/-/g, " ").trim() || value;
}

function pathBasename(path: string): string {
    const norm = path.replace(/\\/g, "/").replace(/\/+$/, "");
    const parts = norm.split("/").filter(Boolean);
    return parts[parts.length - 1] || path;
}

/** Short chip label for composer / messages (basename, not full path). */
export function mentionDisplayLabel(mention: ChatMention): string {
    if (mention.kind === "codebase") return "Codebase";
    if (mention.kind === "selection") return "Selection";
    if (mention.kind === "design") return mention.label || mention.id || "Design";
    if (mention.kind === "chat") {
        if (mention.label && mention.label !== mention.path && mention.label !== mention.id) {
            return mention.label;
        }
        const raw = mention.path || mention.id || mention.label || "Chat";
        if (/^[0-9a-f-]{8,}$/i.test(raw) || /^\d+$/.test(raw)) {
            return mention.label && !/^[0-9a-f-]{8,}$/i.test(mention.label)
                ? mention.label
                : "Chat";
        }
        return unslugMentionLabel(raw);
    }
    if (mention.kind === "browser") {
        const resolved = resolveBrowserMentionPath(mention.path) || mention.path || mention.label || "";
        if (!resolved || resolved === "current") return "Current page";
        return hostnameOf(resolved) || mention.label || "Browser";
    }
    if (mention.kind === "terminal") {
        return mention.label && mention.label !== mention.path
            ? mention.label
            : unslugMentionLabel(mention.path || "Terminal");
    }
    if (mention.kind === "branch") {
        return mention.label && mention.label !== mention.path
            ? mention.label
            : unslugMentionLabel(mention.path || "Branch");
    }
    if (mention.kind === "file" || mention.kind === "folder" || mention.kind === "docs") {
        if (mention.label && !mention.label.includes("/")) return mention.label;
        if (mention.path) return pathBasename(mention.path);
        return mention.label;
    }
    if (mention.path) return pathBasename(mention.path);
    return mention.label;
}

/**
 * Insert short tokens into the composer (`@favicon.ico`) and register the full
 * path so send-time resolution still works.
 */
export function formatMentionToken(mention: ChatMention): string {
    let token: string;
    if (mention.kind === "codebase") token = "@codebase";
    else if (mention.kind === "selection") token = "@selection";
    else if (mention.kind === "design") {
        const label = (mention.label || mention.id || "design").trim();
        token = `@${label.replace(/\s+/g, "-")}`;
    } else if (mention.kind === "folder") {
        const base = pathBasename(mention.path ?? mention.label);
        token = `@${base.endsWith("/") ? base : `${base}/`}`;
    } else if (mention.kind === "file" || mention.kind === "docs") {
        const base = pathBasename(mention.path ?? mention.label);
        token = `@${base}`;
    } else if (mention.kind === "chat") {
        token = `@chat:${slugifyMentionLabel(mention.label || "Chat")}`;
    } else if (mention.kind === "terminal") {
        token = `@terminal:${slugifyMentionLabel(mention.label || "Terminal")}`;
    } else if (mention.kind === "branch") {
        token = `@branch:${slugifyMentionLabel(mention.label || mention.path || "main")}`;
    } else if (mention.kind === "browser") {
        const resolved = resolveBrowserMentionPath(mention.path) || mention.path || "";
        const host =
            hostnameOf(resolved) ||
            (resolved === "current" || !resolved ? "current" : slugifyMentionLabel(mention.label || "page"));
        token = `@browser:${host}`;
    } else {
        token = `@${mention.kind}:${mention.path ?? mention.label}`;
    }
    registerMentionToken(token, {
        ...mention,
        label: mentionDisplayLabel(mention),
    });
    return token;
}

function resolveDesignMention(token: string): ChatMention | null {
    const key = normalizeDesignKey(token);
    const sessions = listDesignPreviewSessions();
    for (const session of sessions) {
        for (const item of session.items) {
            const id = item.id || "";
            const nameKey = normalizeDesignKey(item.name || "");
            if (key === normalizeDesignKey(id) || key === nameKey) {
                return {
                    kind: "design",
                    id: item.id,
                    path: item.path,
                    label: item.name || item.id,
                };
            }
        }
    }
    return null;
}

function labelForTypedMention(kind: MentionKind, path: string): string {
    if (kind === "chat") return unslugMentionLabel(path);
    if (kind === "browser") return hostnameOf(path) || path;
    if (kind === "terminal") return unslugMentionLabel(path);
    if (kind === "branch") return unslugMentionLabel(path);
    return path;
}

export function parseMentionTokens(text: string): ChatMention[] {
    const mentions: ChatMention[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(MENTION_PATTERN.source, "g");
    while ((match = re.exec(text)) !== null) {
        const rawToken = match[0];
        const registered = lookupMentionToken(rawToken);
        if (registered?.kind) {
            mentions.push({
                kind: registered.kind as MentionKind,
                path: registered.path,
                label: registered.label,
                id: registered.id,
            });
            continue;
        }

        if (match[3]) {
            const kind = match[3] as MentionKind;
            mentions.push({
                kind,
                label: kind === "codebase" ? "Codebase" : "Selection",
            });
            continue;
        }

        if (match[1] && match[2]) {
            const kind = match[1] as MentionKind;
            const path = match[2];
            if (kind === "design") {
                const resolved = resolveDesignMention(path);
                mentions.push(
                    resolved ?? {
                        kind: "design",
                        id: path,
                        path,
                        label: path.replace(/-/g, " "),
                    },
                );
                continue;
            }
            mentions.push({
                kind,
                path,
                id: kind === "chat" ? path : undefined,
                label: labelForTypedMention(kind, path),
            });
            continue;
        }

        const bare = match[4];
        if (!bare) continue;
        if (bare === "codebase" || bare === "selection") continue;

        const design = resolveDesignMention(bare);
        if (design) {
            mentions.push(design);
            continue;
        }

        // Basename-only token: keep label short; path may be resolved via registry above.
        const isFolder = bare.endsWith("/");
        const clean = bare.replace(/\/$/, "") || bare;
        mentions.push({
            kind: isFolder ? "folder" : "file",
            path: clean,
            label: pathBasename(clean),
        });
    }
    return mentions;
}

/** Ranges of @mentions in the composer for highlight overlays. */
export function mentionRanges(
    text: string,
): { start: number; end: number; mention: ChatMention }[] {
    const ranges: { start: number; end: number; mention: ChatMention }[] = [];
    const re = new RegExp(MENTION_PATTERN.source, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        const token = match[0];
        const parsed = parseMentionTokens(token);
        if (!parsed[0]) continue;
        ranges.push({
            start: match.index,
            end: match.index + token.length,
            mention: parsed[0],
        });
    }
    return ranges;
}

export function stripMentionTokens(text: string): string {
    return text.replace(MENTION_PATTERN, "").replace(/\s+/g, " ").trim();
}

/**
 * Collapse long `@path/to/file` tokens to `@file` while registering the full path
 * for send-time resolution. Safe to run on every keystroke.
 */
export function shortenMentionTokensInText(text: string): string {
    const re = new RegExp(MENTION_PATTERN.source, "g");
    return text.replace(re, (token) => {
        const parsed = parseMentionTokens(token)[0];
        if (!parsed) return token;
        if (
            parsed.kind !== "file" &&
            parsed.kind !== "docs" &&
            parsed.kind !== "folder"
        ) {
            return token;
        }
        const fullPath = (parsed.path || token.replace(/^@/, "")).replace(/\/$/, "");
        if (!fullPath.includes("/")) return token;
        const short = formatMentionToken({
            ...parsed,
            path: parsed.kind === "folder" ? `${fullPath}/` : fullPath,
            label: pathBasename(fullPath),
        });
        return short;
    });
}

export type SelectionSnapshot = {
    path: string;
    startLine: number;
    endLine: number;
    text: string;
};

function escapeXmlAttr(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function selectionMentionBlock(selection: SelectionSnapshot): string | null {
    const text = selection.text?.trim();
    if (!text) return null;
    const range =
        selection.startLine === selection.endLine
            ? `${selection.startLine}`
            : `${selection.startLine}-${selection.endLine}`;
    return `<mention_context type="selection" path="${escapeXmlAttr(selection.path || "")}" range="${range}">\n${text}\n</mention_context>`;
}

/** Detect design concept names written in plain prose (no @ required). */
export function findDesignMentionsInProse(text: string): ChatMention[] {
  const resolved = resolveDesignSelectionFromProse(text);
  return resolved ? [resolved] : [];
}

/**
 * Resolve an explicit design pick from user prose.
 * Prefers "make/go with/pick X" and "option N" over incidental name mentions
 * (e.g. complaining about Field Radar while asking for Operator Ledger).
 */
export function resolveDesignSelectionFromProse(text: string): ChatMention | null {
  const sessions = listDesignPreviewSessions();
  if (sessions.length === 0) return null;

  const items = sessions.flatMap((s) =>
    s.items.map((item) => ({
      sessionId: s.id,
      item,
      selectedId: s.selectedId,
    })),
  );
  if (items.length === 0) return null;

  const matchItem = (raw: string): ChatMention | null => {
    const needle = normalizeDesignKey(raw);
    if (needle.length < 2) return null;
    const ranked = [...items].sort(
      (a, b) => (b.item.name?.length ?? 0) - (a.item.name?.length ?? 0),
    );
    for (const row of ranked) {
      const name = row.item.name?.trim();
      if (!name) continue;
      const nk = normalizeDesignKey(name);
      if (nk === needle || nk.startsWith(needle) || needle.startsWith(nk)) {
        return {
          kind: "design",
          id: row.item.id,
          path: row.item.path,
          label: row.item.name,
        };
      }
    }
    return null;
  };

  const explicit =
    /\b(?:go with|pick|choose|select|make|use|build)\s+(?:the\s+)?(?:option\s*)?#?(\d+)\b/i.exec(text) ||
    /\b(?:option|design|concept)\s*#?\s*(\d+)\b/i.exec(text);
  if (explicit) {
    const n = Number.parseInt(explicit[1], 10);
    // Prefer the most recent session's items for numbered picks.
    const latest = sessions[sessions.length - 1];
    const hit = latest?.items[n - 1];
    if (hit && n >= 1) {
      return {
        kind: "design",
        id: hit.id,
        path: hit.path,
        label: hit.name,
      };
    }
  }

  const named =
    /\b(?:go with|pick|choose|select|make|use|build)\s+(?:the\s+)?([A-Za-z][\w\s-]{1,48}?)(?:[.!?,]|$)/i.exec(
      text,
    );
  if (named) {
    const hit = matchItem(named[1]);
    if (hit) return hit;
  }

  // Exact whole-name mention as a short message ("Operator Ledger", "1")
  const trimmed = text.trim();
  if (trimmed.length <= 60) {
    const asNumber = /^(\d+)$/.exec(trimmed);
    if (asNumber) {
      const n = Number.parseInt(asNumber[1], 10);
      const latest = sessions[sessions.length - 1];
      const hit = latest?.items[n - 1];
      if (hit) {
        return {
          kind: "design",
          id: hit.id,
          path: hit.path,
          label: hit.name,
        };
      }
    }
    const hit = matchItem(trimmed);
    if (hit) return hit;
  }

  return null;
}

async function readMentionContext(
    mention: ChatMention,
    projectPath: string | null,
): Promise<string | null> {
    if (mention.kind === "codebase") {
        if (!projectPath) return null;
        return '<mention_context type="codebase">Search the codebase for files and symbols relevant to the user request.</mention_context>';
    }

    if (mention.kind === "selection") {
        return null;
    }

    if (mention.kind === "design") {
        const resolved =
            resolveDesignMention(mention.id || mention.label || mention.path || "") ??
            mention;
        const id = resolved.id ?? resolved.path ?? resolved.label;
        return `<mention_context type="design" id="${escapeXmlAttr(id)}" name="${escapeXmlAttr(resolved.label || id)}">The user referenced design concept "${escapeXmlAttr(resolved.label || id)}" (id=${escapeXmlAttr(id)}). Prefer this concept for subsequent design and implementation work. If they are choosing among previews, treat this as their selection.</mention_context>`;
    }

    if (
        mention.kind === "docs" ||
        mention.kind === "terminal" ||
        mention.kind === "chat" ||
        mention.kind === "branch" ||
        mention.kind === "browser"
    ) {
        const path = mention.path ?? mention.label;
        const label = mentionDisplayLabel(mention);
        if (mention.kind === "browser") {
            const resolved = resolveBrowserMentionPath(path);
            if (resolved) {
                const isLocal =
                    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?/i.test(resolved);
                return `<mention_context type="browser" path="${escapeXmlAttr(resolved)}" label="${escapeXmlAttr(hostnameOf(resolved) || resolved)}">The user referenced the ${isLocal ? "local preview page" : "website"} ${escapeXmlAttr(hostnameOf(resolved) || resolved)} (${escapeXmlAttr(resolved)}). ${isLocal ? "This is the URL currently open in the Shape Preview panel." : "Use the visit_url tool to fetch its content and styling if you need to recreate or reference it."}</mention_context>`;
            }
            if (path && path !== "current") {
                return `<mention_context type="browser" path="${escapeXmlAttr(path)}" label="${escapeXmlAttr(label)}">The user referenced the website ${escapeXmlAttr(label)} (${escapeXmlAttr(path)}). Use the visit_url tool to fetch its content and styling if you need to recreate or reference it.</mention_context>`;
            }
            return `<mention_context type="browser" path="current" label="Current page">The user referenced the Preview panel current page, but no local preview URL is loaded yet. Ask them for the localhost URL or open Preview.</mention_context>`;
        }
        if (mention.kind === "chat") {
            return `<mention_context type="chat" path="${escapeXmlAttr(path)}" label="${escapeXmlAttr(label)}">The user referenced a past chat titled "${escapeXmlAttr(label)}".</mention_context>`;
        }
        return `<mention_context type="${mention.kind}" path="${escapeXmlAttr(path)}" label="${escapeXmlAttr(label)}">${escapeXmlAttr(label)}</mention_context>`;
    }

    if (!projectPath) return null;

    const sep = projectPath.includes("\\") ? "\\" : "/";
    const rel = mention.path?.replace(/\//g, sep) ?? "";
    const fullPath = `${projectPath.replace(/[\\/]+$/, "")}${sep}${rel}`;

    if (mention.kind === "folder") {
        try {
            const entries = await commands.lsDir(fullPath);
            const listing = entries
                .slice(0, 80)
                .map((e) => `${e.is_dir ? "[dir]" : "[file]"} ${e.name}`)
                .join("\n");
            return `<mention_context type="folder" path="${mention.path}">\n${listing}\n</mention_context>`;
        } catch {
            return null;
        }
    }

    try {
        const content = await commands.readFile(fullPath);
        const trimmed = content.length > 4000 ? `${content.slice(0, 4000)}\n…(truncated)` : content;
        return `<mention_context type="file" path="${mention.path}">\n${trimmed}\n</mention_context>`;
    } catch {
        return null;
    }
}

export async function buildMessageWithMentions(
    text: string,
    projectPath: string | null,
    selectionContext?: SelectionSnapshot | null,
): Promise<string> {
    const mentions = parseMentionTokens(text);

    const body = stripMentionTokens(text);
    const blocks: string[] = [];

    for (const mention of mentions) {
        if (mention.kind === "selection") {
            const block = selectionContext ? selectionMentionBlock(selectionContext) : null;
            if (block) blocks.push(block);
            continue;
        }
        const block = await readMentionContext(mention, projectPath);
        if (block) blocks.push(block);
    }

    if (blocks.length === 0) return body;
    if (!body) return blocks.join("\n\n");
    return `${blocks.join("\n\n")}\n\n${body}`;
}

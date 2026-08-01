import { commands } from "@/lib/backend/commands";
import { listDesignPreviewSessions } from "@/lib/design-preview-store";

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
    /** Design concept id when kind === "design" */
    id?: string;
};

/** Explicit typed tokens + bare paths / design names (no spaces). */
const MENTION_PATTERN =
    /@(?:(file|folder|design|docs|terminal|chat|branch|browser):([^\s]+)|(codebase|selection)\b|((?:[\w.-]+\/)*[\w.-]+\/?))/g;

function normalizeDesignKey(value: string): string {
    return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

export function formatMentionToken(mention: ChatMention): string {
    if (mention.kind === "codebase") return "@codebase";
    if (mention.kind === "selection") return "@selection";
    if (mention.kind === "design") {
        const label = (mention.label || mention.id || "design").trim();
        return `@${label.replace(/\s+/g, "-")}`;
    }
    if (mention.kind === "folder") {
        const path = mention.path ?? mention.label;
        return `@${path.endsWith("/") ? path : `${path}/`}`;
    }
    if (mention.kind === "file" || mention.kind === "docs") {
        return `@${mention.path ?? mention.label}`;
    }
    return `@${mention.kind}:${mention.path ?? mention.label}`;
}

/** Friendly label for chips / overlays (basename, design name, etc.). */
export function mentionDisplayLabel(mention: ChatMention): string {
    if (mention.kind === "codebase") return "Codebase";
    if (mention.kind === "selection") return "Selection";
    if (mention.kind === "design") return mention.label || mention.id || "Design";
    if (mention.path) {
        const base = mention.path.replace(/\\/g, "/").split("/").pop();
        return base || mention.label;
    }
    return mention.label;
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

export function parseMentionTokens(text: string): ChatMention[] {
    const mentions: ChatMention[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(MENTION_PATTERN.source, "g");
    while ((match = re.exec(text)) !== null) {
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
                label: path,
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

        mentions.push({
            kind: bare.endsWith("/") ? "folder" : "file",
            path: bare.replace(/\/$/, "") || bare,
            label: bare.replace(/\/$/, "") || bare,
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
        return `<mention_context type="${mention.kind}" path="${escapeXmlAttr(path)}">${escapeXmlAttr(path)}</mention_context>`;
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
        const trimmed = content.length > 8000 ? `${content.slice(0, 8000)}\n…(truncated)` : content;
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

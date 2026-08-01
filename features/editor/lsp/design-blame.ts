/**
 * Design-aware blame hover: plain-language UI token history (not raw git noise).
 */

import { commands } from "@/lib/backend";
import type { BlameLine } from "@/lib/backend/types";
import { getSettings } from "@/lib/settings";
import { tokenAtOffset } from "@/features/editor/lib/class-attribute";
import { getTailwindControlKind } from "@/features/editor/ui/tailwind-controls/lib/spacing";
import { findDesignPropertyAtOffset } from "@/features/editor/lib/design-source-map";

function toRelativePath(filePath: string, projectPath: string): string {
    const normFile = filePath.replace(/\\/g, "/");
    const normProject = projectPath.replace(/\\/g, "/").replace(/\/$/, "");
    if (normFile.startsWith(normProject)) {
        return normFile.slice(normProject.length).replace(/^\//, "");
    }
    return normFile;
}

function relativeTime(ts: string): string {
    const n = Number(ts);
    if (!Number.isFinite(n)) return ts;
    const diff = Date.now() - n * 1000;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return mins <= 1 ? "just now" : `${mins} minutes ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days < 45) return days === 1 ? "yesterday" : `${days} days ago`;
    return new Date(n * 1000).toLocaleDateString();
}

function describeToken(token: string): string {
    const kind = getTailwindControlKind(token);
    if (kind === "padding") return "Padding";
    if (kind === "gap") return "Gap";
    if (kind === "flex") return "Layout";
    if (/^rounded/.test(token)) return "Corner radius";
    if (/^(text|bg|border|ring|fill|stroke)-/.test(token)) return "Color";
    if (/^(w|h|min-|max-|size-)/.test(token)) return "Size";
    if (/^(m|p|gap)/.test(token)) return "Spacing";
    return "UI token";
}

function formatHover(token: string, info: BlameLine): string {
    const what = describeToken(token);
    const when = relativeTime(info.date);
    const summary = (info.summary || "").trim() || "Updated styles";
    const short = summary.length > 72 ? `${summary.slice(0, 70)}…` : summary;
    return [
        `**${what}** · \`${token}\``,
        "",
        `Last changed **${when}** by **${info.author}**`,
        short,
    ].join("\n");
}

const blameCache = new Map<string, { at: number; lines: BlameLine[] }>();
const CACHE_MS = 60_000;

async function getBlame(repoPath: string, filePath: string): Promise<BlameLine[]> {
    const rel = toRelativePath(filePath, repoPath);
    const key = `${repoPath}:${rel}`;
    const hit = blameCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.lines;
    try {
        const lines = await commands.gitBlameFile(repoPath, rel);
        blameCache.set(key, { at: Date.now(), lines });
        return lines;
    } catch {
        return [];
    }
}

let registered = false;

export function ensureDesignBlameHover(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monaco: any,
    getFilePath: () => string,
    getRepoPath: () => string | null,
): void {
    if (registered) return;
    registered = true;

    const langs = ["typescriptreact", "javascriptreact", "typescript", "javascript", "css"];
    for (const lang of langs) {
        monaco.languages.registerHoverProvider(lang, {
            async provideHover(model: { getValue: () => string; getOffsetAt: (p: { lineNumber: number; column: number }) => number }, position: { lineNumber: number; column: number }) {
                if (getSettings().designBlame?.enable === false) return null;
                const repo = getRepoPath();
                if (!repo) return null;
                const text = model.getValue();
                const offset = model.getOffsetAt(position);
                const tok = tokenAtOffset(text, offset);
                const designHit = findDesignPropertyAtOffset(text, offset);
                const token =
                    tok?.value ||
                    (designHit?.classToken?.value ?? null);
                if (!token) return null;

                const lines = await getBlame(repo, getFilePath());
                const info = lines.find((l) => l.line === position.lineNumber);
                if (!info) return null;

                return {
                    contents: [{ value: formatHover(token, info) }],
                };
            },
        });
    }
}

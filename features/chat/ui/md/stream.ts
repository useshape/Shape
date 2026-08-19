/** Remove stray thinking tags that leaked into plain text. */
export function stripOrphanThinkTags(text: string): string {
    return text
        .replace(/<\/?redacted_thinking[^>]*>\s*/gi, "")
        .replace(/<\/?thinking[^>]*>\s*/gi, "")
        .replace(/<\/?reasoning[^>]*>\s*/gi, "")
        .replace(/<\/?think[^>]*>\s*/gi, "");
}

/** True when a fenced/JSON blob is a leaked model tool invocation, not user-facing code. */
export function looksLikeLeakedToolCode(body: string): boolean {
    const t = body.trim();
    if (!t) return false;
    if (/"tool_code"\s*:/.test(t)) return true;
    if (/\bprint\s*\(\s*[a-zA-Z_][\w]*\s*\(/.test(t)) return true;
    if (/^\s*tool_code\s*$/m.test(t) && /\bprint\s*\(/.test(t)) return true;
    if (/^\s*functions\.[a-zA-Z_][\w.]*\s*\(/.test(t)) return true;
    if (/<(?:tool_call|function_call|minimax:tool_call|tool_code)\b/i.test(t)) return true;
    return false;
}

/**
 * XML / sentinel tags that models leak into `content` instead of structured
 * tool_calls. Cover Shape catalog families (Claude, GPT, Gemini/Auto, Grok,
 * DeepSeek) plus common OpenRouter proxies. Do NOT include intentional Shape
 * UI tags (`edit`, `terminal_command`, `todos`, …) — those are parsed separately.
 */
export const LEAKED_TOOL_XML_TAGS = [
    // Shape-internal tool UI that must never render as prose
    "list_terminals",
    "terminal_input",
    "terminal_read",
    "tool_result",
    "tool_code",
    "new_path",
    "file_content",
    "analysis",
    // Anthropic / Claude / MiniMax / generic OpenRouter
    "tool_call",
    "tool_calls",
    "function_call",
    "function_calls",
    "function_response",
    "tool_response",
    "minimax:tool_call",
    "invoke",
    "parameter",
    // GLM
    "arg_key",
    "arg_value",
    // Qwen2.5 oddball wrapper
    "tools",
    // Gemini CLI / Google
    "pre_dispatch_explanation",
] as const;

/** Shape UI wrappers. Strip even when they contain markdown fences (edit_file excerpts). */
const STRIP_ACROSS_FENCES = [
    "tool_result",
    "terminal_read",
    "terminal_input",
    "list_terminals",
] as const;

/** Apply `fn` only to prose outside fenced code blocks (preserve legitimate examples). */
function mapOutsideCodeFences(text: string, fn: (prose: string) => string): string {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts
        .map((part, index) => {
            if (index % 2 === 1) return part;
            return fn(part);
        })
        .join("");
}

/**
 * Strip provider/model tool-call grammars that leaked into assistant text.
 * Surveyed shapes: DeepSeek DSML, Qwen/Hermes/GLM `<tool_call>`, MiniMax,
 * Kimi/Llama/Gemma `<|…|>` sentinels, Gemini `<function_calls>` / `tool_code`,
 * Mistral `[TOOL_CALLS]`, plus Shape terminal UI chunks.
 */
export function stripLeakedToolMarkup(text: string): string {
    const fw = "\uFF5C"; // fullwidth ｜ used by DeepSeek DSML

    let s = text;
    for (const tag of STRIP_ACROSS_FENCES) {
        const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        s = s.replace(new RegExp(`<${esc}\\b[^>]*>[\\s\\S]*?<\\/${esc}>`, "gi"), "");
    }

    s = mapOutsideCodeFences(s, (prose) => {
        let p = prose;

        for (const tag of LEAKED_TOOL_XML_TAGS) {
            const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            // Complete paired blocks.
            p = p.replace(new RegExp(`<${esc}\\b[^>]*>[\\s\\S]*?<\\/${esc}>`, "gi"), "");
            // Self-closing / empty open tags.
            p = p.replace(new RegExp(`<${esc}\\b[^>]*\\/?>`, "gi"), "");
            // Incomplete open still streaming → eat remainder of this prose segment.
            p = p.replace(new RegExp(`<${esc}\\b[^>]*>[\\s\\S]*$`, "gi"), "");
            // Stray closers.
            p = p.replace(new RegExp(`<\\/${esc}>`, "gi"), "");
        }

        // DeepSeek DSML (fullwidth bars, double/single/no leading bar).
        // e.g. <｜｜DSML｜｜tool_calls>…</｜｜DSML｜｜tool_calls>
        //      <｜DSML｜invoke name="x">…</｜DSML｜invoke>
        const dsmlOpen = new RegExp(
            `<${fw}{0,2}DSML${fw}{1,2}[\\w.]*?>[\\s\\S]*?<\\/${fw}{0,2}DSML${fw}{1,2}[\\w.]*?>`,
            "gi",
        );
        p = p.replace(dsmlOpen, "");
        p = p.replace(new RegExp(`<${fw}{0,2}DSML${fw}{1,2}[\\w.]*?>[\\s\\S]*$`, "gi"), "");
        p = p.replace(new RegExp(`<\\/?${fw}{0,2}DSML${fw}{1,2}[\\w.]*?>`, "gi"), "");
        // ASCII-pipe proxy variant: < | DSML | tool_calls>
        p = p.replace(/<\s*\|\s*DSML\s*\|\s*[\w.]*?>[\s\S]*?<\/\s*\|\s*DSML\s*\|\s*[\w.]*?>/gi, "");
        p = p.replace(/<\/?\s*\|\s*DSML\s*\|\s*[\w.]*?>/gi, "");

        // Kimi / Llama / Gemma / OpenAI-compat special tokens.
        p = p.replace(
            /<\|(?:tool_calls_section_begin|tool_calls_section_end|tool_call_section_begin|tool_call_section_end|tool_call_begin|tool_call_end|tool_call_argument_begin|tool_call|tool_response|python_tag)\|>/gi,
            "",
        );
        // Broader catch for unknown <|…tool…|> sentinels (keep short).
        p = p.replace(/<\|[^|]{0,48}tool[^|]{0,48}\|>/gi, "");

        // Mistral sentinel + JSON payload on the same/following lines.
        p = p.replace(/\[TOOL_CALLS\]\s*\[[\s\S]*?\](?=\s*(?:\n|$))/g, "");
        p = p.replace(/\[TOOL_CALLS\][^\n]*(?:\n\[(?:ARGS|CALL_ID)\][^\n]*)*/g, "");

        // DeepSeek / Hermes `_execute` textual tool dumps.
        p = p.replace(/(?:^|\n)_execute\s*\n(?:tool_name|name)\s*:[^\n]*(?:\n[a-z_]+\s*:[^\n]*)*/gi, "\n");

        // Qwen Hermes bare function= / parameter= lines without outer wrapper.
        p = p.replace(/<\/?function\s*=[^>]*>/gi, "");
        p = p.replace(/<\/?parameter\s*=[^>]*>/gi, "");

        return p;
    });

    return s.replace(/\n{3,}/g, "\n\n");
}

/**
 * Strip Gemini/OpenRouter-style tool leaks that models sometimes paste as
 * markdown JSON instead of issuing a real tool call, e.g.
 * ```json
 * { "tool_code": "print(render_design_previews(...))" }
 * ```
 * Also strips cross-model XML / sentinel tool grammars from prose.
 */
export function stripLeakedToolCode(text: string): string {
    let s = text;

    // Complete fenced blocks whose body looks like a tool leak.
    s = s.replace(/```[\w-]*\s*\n([\s\S]*?)```/g, (full, body: string) =>
        looksLikeLeakedToolCode(body) ? "" : full,
    );

    // Incomplete fence still streaming (common mid-tool-arg dump).
    s = s.replace(/```[\w-]*\s*\n([\s\S]*)$/g, (full, body: string) =>
        looksLikeLeakedToolCode(body) ? "" : full,
    );

    // Bare JSON objects: { "tool_code": "..." }
    s = s.replace(/\{\s*"tool_code"\s*:[\s\S]*$/g, (match) => {
        // Only strip if it looks like the start of a tool dump (not normal prose).
        return /print\s*\(|render_design_previews|concepts\s*=/.test(match) ? "" : match;
    });

    // Bare print(tool_name(...)) dumps without JSON wrapper (Gemini).
    s = s.replace(/(?:^|\n)\s*print\s*\(\s*[a-zA-Z_][\w]*\s*\([\s\S]*$/g, "\n");

    // MiniMax-Text-01 style: functions.name({...}) after a function_call fence remnant.
    s = s.replace(/(?:^|\n)\s*functions\.[a-zA-Z_][\w.]*\s*\(\{[\s\S]*$/g, "\n");

    s = stripLeakedToolMarkup(s);

    return s.replace(/\n{3,}/g, "\n\n");
}

/** Repair cumulative-stream glitches and obvious duplicate phrases in assistant text. */
export function repairStreamGlitches(text: string): string {
    if (text.length < 24) return text;

    for (let len = Math.min(120, Math.floor(text.length / 2)); len >= 20; len--) {
        for (let i = 0; i + len * 2 <= text.length; i++) {
            const a = text.slice(i, i + len);
            const b = text.slice(i + len, i + len * 2);
            if (a === b) {
                return text.slice(0, i + len) + text.slice(i + len * 2);
            }
        }
    }

    for (let start = 20; start < text.length - 20; start++) {
        const maxLen = Math.min(start, text.length - start);
        for (let len = maxLen; len >= 20; len--) {
            if (text.slice(0, len) === text.slice(start, start + len)) {
                return text.slice(0, start) + text.slice(start + len);
            }
        }
    }

    const glued = text.match(/([a-z])([A-Z][a-z]{4,})/);
    if (glued && glued.index !== undefined) {
        const splitAt = glued.index + 1;
        const prefix = text.slice(0, splitAt);
        const suffix = text.slice(splitAt);
        for (let checkLen = 16; checkLen <= Math.min(80, prefix.length); checkLen++) {
            const tail = prefix.slice(-checkLen);
            if (suffix.startsWith(tail)) {
                return prefix + suffix.slice(tail.length);
            }
        }
    }

    return text;
}

/** Normalize assistant markdown before ReactMarkdown. */
export function looksLikeProseMarkdown(text: string): boolean {
    return /(^|\n)#{1,6}\s+\S/.test(text)
        || /(^|\n)[-*+]\s+\S/.test(text)
        || /(^|\n)\d+\.\s+\S/.test(text);
}

function demoteIndentedMarkdown(text: string): string {
    return text
        .split("\n")
        .map((line) => {
            const m = /^( {4,}|\t+)(.*)$/.exec(line);
            if (!m) return line;
            const inner = m[2];
            if (/^(#{1,6}\s|[-*+]\s|\d+\.\s)/.test(inner)) return inner;
            return line;
        })
        .join("\n");
}

function unwrapOuterProseFence(text: string): string {
    const trimmed = text.trim();
    const outer = /^```(?:[\w-]*)?\s*\n([\s\S]*?)\n```\s*$/.exec(trimmed);
    if (outer && looksLikeProseMarkdown(outer[1])) {
        return outer[1];
    }
    return text;
}

function stripRawHtml(text: string): string {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts
        .map((part, index) => {
            if (index % 2 === 1) return part;
            return part
                .replace(/<img[^>]*>/gi, "")
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/?(h[1-6]|p|div|span|a|ul|ol|li|strong|em|b|i|section|article|header|footer)[^>]*>/gi, (tag) =>
                    tag.startsWith("</") ? "\n" : "",
                );
        })
        .join("");
}

const MAX_DISPLAY_CHARS = 48_000;

function truncateForDisplay(text: string): string {
    if (text.length <= MAX_DISPLAY_CHARS) return text;
    return `${text.slice(0, MAX_DISPLAY_CHARS)}\n\n… (response truncated for display)`;
}

/** Normalize assistant markdown before ReactMarkdown. */
export function preprocessChatMarkdown(
    text: string,
    options?: { trim?: boolean; streaming?: boolean },
): string {
    let s = stripOrphanThinkTags(text);
    s = stripLeakedToolCode(s);
    s = stripRawHtml(s);
    s = unwrapOuterProseFence(s);
    s = demoteIndentedMarkdown(s);
    if (!options?.streaming) {
        s = repairStreamGlitches(s);
        s = truncateForDisplay(s);
    }
    s = s.replace(/^[•●▪◦]\s+/gm, "- ");
    s = s.replace(/^\s*[-*_]{3,}\s*$/gm, "");
    s = s.replace(/\n{3,}/g, "\n\n");
    if (options?.streaming) {
        s = balanceMarkdownFences(s);
        // Re-strip after fence balancing in case a closed fence still looks like a leak.
        s = stripLeakedToolCode(s);
    }
    if (options?.trim !== false) {
        s = s.trim();
    }
    return s;
}

/** Close an unclosed fenced code block so streaming markdown does not swallow the rest as mono code. */
function balanceMarkdownFences(text: string): string {
    const fenceCount = (text.match(/^```/gm) || []).length;
    if (fenceCount % 2 !== 0) {
        return `${text}\n\`\`\``;
    }
    return text;
}

/**
 * Token estimate for text the user has not sent yet.
 *
 * o200k (the GPT-4o / GPT-5 tokenizer) first cuts text with a fixed pattern:
 * a word with its leading space, a contraction, up to three digits, a
 * punctuation run with the line breaks after it, or a whitespace run. Most
 * of those pieces are already one token. The extra counts below are only for
 * pieces that regularly split again: an acronym glued to a word
 * (`XMLHttp` → `XML` + `Http`), a backslash before a name, a `?` or `@`
 * before a letter, a very long letter run, and CJK, which this pattern
 * swallows whole and which is closer to one token per character.
 *
 * Ordinary words stay one token even when they are long
 * (`authentication`, `configuration`). A rare string past 18 letters is
 * counted a bit high of a normal word and still low of a random string.
 * That is deliberate: fitting the rare string makes normal prose worse.
 *
 * Family scales cover tokenizers that pack fewer characters than this.
 * Credits use the same markup as billing: provider USD × 1.4, then ÷ $0.02.
 */

/** Same suffix group as the o200k pattern, without a case-insensitive flag. */
const CONTRACTION = "(?:'(?:[sS]|[tT]|[rR][eE]|[vV][eE]|[mM]|[lL][lL]|[dD]))?";

/**
 * Partition used by tiktoken o200k_base. Order matters: the first alternative
 * that matches at the current character wins, and the pieces cover the string.
 */
const CHUNK_SRC = [
    `[^\\r\\n\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]*[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]+${CONTRACTION}`,
    `[^\\r\\n\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]+[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]*${CONTRACTION}`,
    "\\p{N}{1,3}",
    " ?[^\\s\\p{L}\\p{N}]+[\\r\\n/]*",
    "\\s*[\\r\\n]+",
    "\\s+(?!\\S)",
    "\\s+",
].join("|");

/**
 * Prefixes that stay their own token in front of a word.
 * `@`, `!`, and `%` do this even for a one-letter word. The others do it
 * once the word is longer than two letters (`?id` is one token, `?lang` is two).
 * `=`, `$`, space, `(`, `/`, `.`, and `-` usually stay on the word.
 */
const ALWAYS_OWN = new Set(["@", "!", "%"]);
const OWN_WHEN_LONG = new Set(["?", "&", "#", "+", "*", "|", "~", "^"]);

function isCjk(char: string): boolean {
    const code = char.codePointAt(0) ?? 0;
    return (
        (code >= 0x3040 && code <= 0x30ff) ||
        (code >= 0x3400 && code <= 0x9fff) ||
        (code >= 0xac00 && code <= 0xd7af) ||
        (code >= 0xf900 && code <= 0xfaff)
    );
}

function isLetter(char: string): boolean {
    return /\p{L}/u.test(char);
}

export function estimateTokens(text: string): number {
    if (!text) return 0;
    const chunks = text.match(new RegExp(CHUNK_SRC, "gu"));
    if (!chunks) return Math.max(1, [...text].length);
    let tokens = 0;
    let covered = 0;
    for (const chunk of chunks) {
        tokens += estimateChunk(chunk);
        covered += chunk.length;
    }
    if (covered < text.length) tokens += text.length - covered;
    return Math.max(1, tokens);
}

function estimateChunk(chunk: string): number {
    const chars = [...chunk];
    let cjk = 0;
    for (const char of chars) if (isCjk(char)) cjk += 1;
    if (cjk > 0) return cjk;
    if (/^\p{N}+$/u.test(chunk)) return 1;
    if (/^\s+$/u.test(chunk)) return 1;
    if (/\p{L}/u.test(chunk)) return wordTokens(chars);
    return punctTokens(chars);
}

function wordTokens(chars: string[]): number {
    let start = 0;
    let extra = 0;
    const first = chars[0] ?? "";
    const second = chars[1] ?? "";
    if (first && !isLetter(first) && isLetter(second)) {
        start = 1;
        const rest = chars.length - start;
        if (first === "\\" && rest >= 2) extra += 1;
        else if (ALWAYS_OWN.has(first)) extra += 1;
        else if (OWN_WHEN_LONG.has(first) && rest > 2) extra += 1;
    }
    let end = chars.length;
    const tail = chars.slice(start).join("");
    const contraction = tail.match(/'(?:[sS]|[tT]|[rR][eE]|[vV][eE]|[mM]|[lL][lL]|[dD])$/);
    if (contraction) end -= contraction[0].length;
    const letters = chars.slice(start, end);
    let tokens = 1 + camelSplits(letters);
    if (letters.length > 18) {
        tokens = Math.max(tokens, 2 + Math.floor((letters.length - 18) / 5));
    }
    return tokens + extra;
}

/** `XMLHttp` and `HTTPRequest` split before the last capital of an acronym. */
function camelSplits(letters: string[]): number {
    let splits = 0;
    for (let i = 1; i < letters.length - 1; i++) {
        if (isUpper(letters[i - 1] ?? "") && isUpper(letters[i] ?? "") && isLower(letters[i + 1] ?? "")) {
            splits += 1;
        }
    }
    return splits;
}

function punctTokens(chars: string[]): number {
    let symbols = 0;
    for (const char of chars) {
        const code = char.codePointAt(0) ?? 0;
        if (code > 0xffff) symbols += 1;
    }
    if (symbols > 0) return symbols;
    let body = chars;
    if (body[0] === " ") body = body.slice(1);
    while (body.length > 0 && /[\r\n/]/.test(body[body.length - 1] ?? "")) body = body.slice(0, -1);
    if (body.length <= 3) return 1;
    return Math.ceil(body.length / 3);
}

function isUpper(char: string): boolean {
    return char !== char.toLowerCase() && char === char.toUpperCase();
}

function isLower(char: string): boolean {
    return char !== char.toUpperCase() && char === char.toLowerCase();
}

/** Mistral and Llama tokenizers pack fewer characters per token than o200k. */
export function familyScale(modelId: string): number {
    const id = modelId.toLowerCase();
    if (id.includes("mistral") || id.includes("devstral")) return 1.12;
    if (id.includes("llama")) return 1.08;
    return 1;
}

/** Same cutoff as the desktop tightener. Shorter messages are sent as typed. */
export const PROMPT_OPTIMIZE_WORDS = 40;

export function shouldOptimizePrompt(text: string, enabled: boolean): boolean {
    if (!enabled) return false;
    if (text.includes("data:image") || text.includes("<attached_file")) return false;
    const words = text.split(/\s+/).filter(Boolean).length;
    return words >= PROMPT_OPTIMIZE_WORDS;
}

const CREDIT_USD = 0.02;
const COST_MARKUP = 1.4;
const IMAGE_TOKENS = 765;

/**
 * What a code turn sends besides the draft. Counted from the harness, not from a sample prompt.
 * System prompt 1,079. Family overlays below. Workspace and terminal tool schemas are 3,480
 * o200k tokens. The repo map budget is 768, plus a short runtime header.
 */
const SYSTEM_TOKENS = 1079;
const CODE_TOOL_TOKENS = 3480;
const PROJECT_CONTEXT_TOKENS = 768 + 150;
const TALK_SYSTEM_TOKENS = 347;

function familyTokens(modelId: string): number {
    const id = modelId.toLowerCase();
    if (id.includes("claude") || id.includes("anthropic")) return 312;
    if (id.includes("gpt") || id.includes("openai")) return 535;
    if (id.includes("deepseek")) return 470;
    if (id.includes("glm") || id.includes("z-ai") || id.includes("zai")) return 303;
    if (id.includes("gemini") || id.includes("google")) return 192;
    if (id.includes("grok") || id.includes("x-ai") || id.includes("xai")) return 175;
    if (id.includes("qwen")) return 161;
    return 117;
}

/** A change makes a tool call, then a follow-up call that sends the prompt again. */
function modelCalls(text: string, talk: boolean): number {
    if (talk) return 1;
    const lower = text.toLowerCase();
    const change = [
        "fix", "implement", "refactor", "add ", "create", "build", "edit", "update", "change",
        "write", "remove", "delete", "install", "wire", "rename", "replace", "debug", "generate",
        "go ahead", "build it", "start building", "proceed",
    ].some((word) => lower.includes(word));
    return change ? 2 : 1;
}

/** Reply plus thinking. High is not the full budget; that cap is rarely spent. */
function replyTokens(effort: string | undefined): number {
    switch (effort) {
        case "super":
        case "max":
        case "ultra":
            return 1200;
        case "high":
        case "medium":
            return 700;
        default:
            return 250;
    }
}

export function estimateSendCredits(input: {
    text: string;
    history?: string;
    modelId: string;
    inputCost: number;
    outputCost: number;
    imageCount?: number;
    fileBytes?: number;
    reasoningEffort?: string;
    talk?: boolean;
}): { tokens: number; credits: number | null; label: string } {
    const talk = input.talk ?? false;
    const draftTokens = Math.ceil(estimateTokens(input.text || "") * familyScale(input.modelId));
    const historyTokens = input.history ? Math.ceil(estimateTokens(input.history) * familyScale(input.modelId)) : 0;
    const imageTokens = (input.imageCount ?? 0) * IMAGE_TOKENS;
    const fileTokens = Math.min(2_000, Math.ceil((input.fileBytes ?? 0) / 4));
    const standing =
        (talk ? TALK_SYSTEM_TOKENS : SYSTEM_TOKENS + PROJECT_CONTEXT_TOKENS) +
        familyTokens(input.modelId) +
        CODE_TOOL_TOKENS;
    const calls = modelCalls(input.text || "", talk);
    const inputTokens = Math.max(1, (standing + historyTokens + draftTokens) * calls + imageTokens + fileTokens);
    const outputTokens = replyTokens(input.reasoningEffort) * calls;
    if (input.inputCost <= 0 && input.outputCost <= 0) {
        return { tokens: inputTokens, credits: null, label: "Included" };
    }
    const usd =
        (inputTokens / 1_000_000) * input.inputCost +
        (outputTokens / 1_000_000) * input.outputCost;
    const credits = (usd * COST_MARKUP) / CREDIT_USD;
    return { tokens: inputTokens, credits, label: formatCredits(credits) };
}

function formatCredits(credits: number): string {
    if (!Number.isFinite(credits) || credits <= 0) return "Included";
    if (credits < 0.01) return "About <0.01% usage";
    if (credits < 10) return `About ${credits.toFixed(credits < 1 ? 2 : 1)}% usage`;
    return `About ${Math.round(credits)}% usage`;
}

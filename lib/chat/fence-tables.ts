/** JSON array of objects used by ```filter-table``` / ```records``` fences. */
export function parseKeyedRows(code: string): Record<string, string>[] | null {
    const trimmed = code.trim();
    if (!trimmed) return null;
    try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (!Array.isArray(parsed)) return null;
        const rows: Record<string, string>[] = [];
        for (const item of parsed) {
            if (!item || typeof item !== "object" || Array.isArray(item)) return null;
            const row: Record<string, string> = {};
            for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
                row[k] = v == null ? "" : String(v);
            }
            rows.push(row);
        }
        return rows;
    } catch {
        return null;
    }
}

const KNOWN_MODEL_PREFIX =
    /^(anthropic|openai|google|x-ai|deepseek|z-ai|qwen|minimax|moonshotai|openrouter)\//i;

/** Only known provider model ids get a brand mark — never invent logos. */
export function tableCellModelId(value: string): string | null {
    const t = value.trim();
    if (!KNOWN_MODEL_PREFIX.test(t)) return null;
    return t;
}

/** Maps short display tokens → full mention (path, kind, etc.) for resolve-on-send. */
export type RegisteredMention = {
    kind: string;
    path?: string;
    label: string;
    id?: string;
};

const byToken = new Map<string, RegisteredMention>();

function keyOf(token: string): string {
    return token.replace(/^@/, "").replace(/\/$/, "").toLowerCase();
}

export function registerMentionToken(token: string, mention: RegisteredMention): void {
    const k = keyOf(token);
    if (!k) return;
    byToken.set(k, { ...mention });
}

export function lookupMentionToken(tokenOrPath: string): RegisteredMention | null {
    const k = keyOf(tokenOrPath);
    if (!k) return null;
    return byToken.get(k) ?? null;
}

export function clearMentionRegistry(): void {
    byToken.clear();
}

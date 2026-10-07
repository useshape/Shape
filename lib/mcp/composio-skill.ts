import { shapeApiFetch } from "@/lib/cloud/api";
import { getShapeAccessToken } from "@/lib/cloud/store";

export type ComposioSkillHint = {
    name: string;
    description: string;
    body: string;
};

/** In-memory only. Never written to the user's Skills list or to mcp.json. */
const cache = new Map<string, { at: number; body: string }>();
const TTL_MS = 10 * 60 * 1000;

export async function fetchComposioSkillHint(query: string): Promise<string | undefined> {
    const key = query.trim().toLowerCase();
    if (!key) return undefined;
    const token = getShapeAccessToken();
    if (!token) return undefined;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.body || undefined;
    try {
        const data = await shapeApiFetch<{ skills: ComposioSkillHint[] }>(
            `/plugins/skills?query=${encodeURIComponent(query.trim())}`,
            { token },
        );
        const body = (data.skills ?? [])
            .map((skill) => skill.body?.trim() || skill.description?.trim() || "")
            .filter(Boolean)
            .slice(0, 2)
            .join("\n\n")
            .slice(0, 1200);
        cache.set(key, { at: Date.now(), body });
        return body || undefined;
    } catch {
        return undefined;
    }
}

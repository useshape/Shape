import { ShapeApiError, shapeApiFetch } from "@/lib/cloud/api";
import { getShapeAccessToken } from "@/lib/cloud/store";

export type PluginRow = {
    id: string;
    name: string;
    description: string;
    category: string;
    toolkit: string;
    connected: boolean;
    logo: string | null;
};

export type PluginToolHint = {
    slug: string;
    name: string;
    description: string;
};

type PluginsCache = {
    plugins: PluginRow[];
    configured: boolean;
    at: number;
};

const TTL_MS = 10 * 60 * 1000;
let pluginsCache: PluginsCache | null = null;
const toolsCache = new Map<string, { tools: PluginToolHint[]; at: number }>();

function tokenOrThrow(): string {
    const token = getShapeAccessToken();
    if (!token) throw new ShapeApiError("Sign in to Shape to use plugins.", 401);
    return token;
}

export function peekPluginsCache(): { plugins: PluginRow[]; configured: boolean } | null {
    if (!pluginsCache) return null;
    return { plugins: pluginsCache.plugins, configured: pluginsCache.configured };
}

export function invalidatePluginsCache(toolkit?: string) {
    pluginsCache = null;
    if (toolkit) toolsCache.delete(toolkit.toLowerCase());
    else toolsCache.clear();
}

export async function fetchPlugins(opts?: { force?: boolean }): Promise<{
    plugins: PluginRow[];
    configured: boolean;
}> {
    const now = Date.now();
    if (!opts?.force && pluginsCache && now - pluginsCache.at < TTL_MS) {
        return { plugins: pluginsCache.plugins, configured: pluginsCache.configured };
    }
    const data = await shapeApiFetch<{ plugins: PluginRow[]; configured: boolean }>("/plugins", {
        token: tokenOrThrow(),
    });
    pluginsCache = { plugins: data.plugins, configured: data.configured, at: now };
    return data;
}

export async function fetchPluginTools(
    toolkit: string,
    opts?: { force?: boolean },
): Promise<PluginToolHint[]> {
    const key = toolkit.toLowerCase();
    const now = Date.now();
    const hit = toolsCache.get(key);
    if (!opts?.force && hit && now - hit.at < TTL_MS) return hit.tools;
    const data = await shapeApiFetch<{ tools: PluginToolHint[] }>(
        `/plugins/tools?toolkit=${encodeURIComponent(toolkit)}`,
        { token: tokenOrThrow() },
    );
    const tools = data.tools ?? [];
    toolsCache.set(key, { tools, at: now });
    return tools;
}

export async function startPluginConnect(toolkit: string): Promise<{ redirectUrl: string }> {
    return shapeApiFetch("/plugins/connect", {
        method: "POST",
        token: tokenOrThrow(),
        body: JSON.stringify({ toolkit }),
    });
}

export async function disconnectPlugin(toolkit: string): Promise<void> {
    await shapeApiFetch("/plugins/disconnect", {
        method: "POST",
        token: tokenOrThrow(),
        body: JSON.stringify({ toolkit }),
    });
    invalidatePluginsCache(toolkit);
}

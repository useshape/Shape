import { commands } from "@/lib/backend";
import type { McpServerConfig, McpStatusEntry } from "@/lib/backend/types";
import { getSettings, updateSettingSection, type McpServerConfig as StoredMcp } from "@/lib/settings";
import { fetchComposioSkillHint } from "@/lib/mcp/composio-skill";
import { loadMcpServersFromFile } from "@/lib/mcp/config";

export type McpOrigin = "file" | "ui";

export type ListedMcpServer = StoredMcp & { origin: McpOrigin };

function asStored(server: StoredMcp): StoredMcp {
    return {
        id: server.id,
        name: server.name,
        transport: server.transport,
        command: server.command,
        args: server.args,
        env: server.env,
        url: server.url,
        auth: server.auth,
        enabled: server.enabled,
        disabledTools: server.disabledTools,
        oauthClientId: server.oauthClientId,
    };
}

export function uiMcpServers(): ListedMcpServer[] {
    return getSettings().ai.mcpServers.map((server) => ({ ...asStored(server), origin: "ui" }));
}

export function saveUiMcpServers(servers: StoredMcp[]): void {
    updateSettingSection("ai", { mcpServers: servers.map(asStored) });
}

/** File servers and UI servers. Same id in both places keeps the file copy. */
export async function listMcpServers(): Promise<ListedMcpServer[]> {
    const file = (await loadMcpServersFromFile()).map((server) => ({
        ...asStored(server),
        origin: "file" as const,
    }));
    const fileIds = new Set(file.map((server) => server.id));
    return [...file, ...uiMcpServers().filter((server) => !fileIds.has(server.id))];
}

async function withSkillHints(servers: ListedMcpServer[]): Promise<McpServerConfig[]> {
    return Promise.all(
        servers.map(async (server) => {
            const hint = await Promise.race<string | undefined>([
                fetchComposioSkillHint(server.name),
                new Promise((resolve) => setTimeout(() => resolve(undefined), 2000)),
            ]);
            const stored = asStored(server);
            return hint ? { ...stored, skillHint: hint } : stored;
        }),
    );
}

/** Push both sources to the running agent. Does not write mcp.json. */
export async function syncActiveMcpServers(): Promise<McpStatusEntry[]> {
    const servers = await listMcpServers();
    return commands.syncMcpServers(await withSkillHints(servers));
}

export async function addUiMcpServer(server: StoredMcp): Promise<void> {
    const existing = await listMcpServers();
    if (existing.some((item) => item.id === server.id)) {
        throw new Error(`“${server.id}” is already added.`);
    }
    saveUiMcpServers([...uiMcpServers(), asStored(server)]);
    await syncActiveMcpServers();
}

export async function removeUiMcpServer(id: string): Promise<void> {
    saveUiMcpServers(uiMcpServers().filter((server) => server.id !== id));
    try {
        await commands.mcpClearOAuth(id);
    } catch {
        /* no token stored */
    }
    await syncActiveMcpServers();
}

export function updateUiMcpServer(id: string, patch: Partial<StoredMcp>): void {
    saveUiMcpServers(
        uiMcpServers().map((server) => (server.id === id ? asStored({ ...server, ...patch, id }) : server)),
    );
}

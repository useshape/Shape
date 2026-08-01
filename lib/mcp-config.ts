"use client";

import { commands } from "@/lib/backend";
import type { McpServerConfig } from "@/lib/settings";

const DEFAULT_MCP_JSON = `{
  "mcpServers": {}
}
`;

export async function getMcpConfigPath(): Promise<string> {
    return commands.getMcpConfigPath();
}

export async function ensureMcpConfigFile(): Promise<string> {
    return commands.ensureMcpConfig();
}

type RawMcpEntry = {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    disabled?: boolean;
    transport?: "stdio" | "http";
    url?: string;
    auth?: "none" | "oauth";
};

export function parseMcpJson(content: string): McpServerConfig[] {
    const parsed = JSON.parse(content) as {
        mcpServers?: Record<string, RawMcpEntry>;
    };

    const servers = parsed.mcpServers ?? {};
    return Object.entries(servers).map(([name, cfg]) => ({
        id: name,
        name,
        transport: cfg.transport ?? (cfg.url ? "http" : "stdio"),
        command: cfg.command ?? "",
        args: cfg.args ?? [],
        env: cfg.env ?? {},
        url: cfg.url,
        auth: cfg.auth ?? (cfg.url ? "oauth" : "none"),
        enabled: cfg.disabled !== true,
    }));
}

export async function loadMcpServersFromFile(): Promise<McpServerConfig[]> {
    const path = await ensureMcpConfigFile();
    try {
        const content = await commands.readFile(path);
        return parseMcpJson(content);
    } catch {
        return [];
    }
}

export async function saveMcpServers(servers: McpServerConfig[]): Promise<void> {
    const path = await ensureMcpConfigFile();
    const mcpServers: Record<string, RawMcpEntry> = {};
    for (const s of servers) {
        mcpServers[s.id] = {
            transport: s.transport,
            command: s.command || undefined,
            args: s.args.length ? s.args : undefined,
            env: Object.keys(s.env).length ? s.env : undefined,
            url: s.url,
            auth: s.auth,
            disabled: !s.enabled,
        };
    }
    const content = JSON.stringify({ mcpServers }, null, 2);
    await commands.saveFile(path, content);
}

export async function mergePluginConfig(
    pluginId: string,
    config: { mcpServers?: Record<string, RawMcpEntry> },
): Promise<McpServerConfig[]> {
    const existing = await loadMcpServersFromFile();
    const incoming = config.mcpServers ?? {};
    const merged = new Map(existing.map((s) => [s.id, s]));
    for (const [id, cfg] of Object.entries(incoming)) {
        merged.set(id, {
            id,
            name: id,
            transport: cfg.transport ?? (cfg.url ? "http" : "stdio"),
            command: cfg.command ?? "",
            args: cfg.args ?? [],
            env: cfg.env ?? {},
            url: cfg.url,
            auth: cfg.auth ?? (cfg.url ? "oauth" : "none"),
            enabled: cfg.disabled !== true,
        });
    }
    const list = Array.from(merged.values());
    await saveMcpServers(list);
    return list;
}

export async function openMcpConfig(): Promise<void> {
    const path = await ensureMcpConfigFile();
    try {
        await commands.readFile(path);
    } catch {
        await commands.createFile(path);
        await commands.saveFile(path, DEFAULT_MCP_JSON);
    }
    await commands.openFile(path, "mcp.json");
}

import type { McpServerConfig } from "@/lib/settings";

type RawEntry = {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    disabled?: boolean;
    transport?: "stdio" | "http";
    url?: string;
    auth?: "none" | "oauth";
    disabledTools?: string[];
    oauthClientId?: string;
    name?: string;
};

function slugId(name: string): string {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return slug || "mcp";
}

function hostId(url: string): string {
    try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        return slugId(host);
    } catch {
        return "mcp";
    }
}

export function serverFromEntry(id: string, cfg: RawEntry): McpServerConfig {
    const url = cfg.url?.trim() || undefined;
    const transport = cfg.transport ?? (url ? "http" : "stdio");
    return {
        id,
        name: cfg.name?.trim() || id,
        transport,
        command: cfg.command ?? "",
        args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
        env: cfg.env && typeof cfg.env === "object" ? cfg.env : {},
        url,
        auth: cfg.auth ?? (url ? "oauth" : "none"),
        enabled: cfg.disabled !== true,
        disabledTools: cfg.disabledTools ?? [],
        oauthClientId: cfg.oauthClientId,
    };
}

/** Paste a URL, one server object, or an mcp.json document. */
export function parseMcpPaste(input: string): { servers: McpServerConfig[]; error?: string } {
    const text = input.trim();
    if (!text) return { servers: [], error: "Paste a server URL or JSON config." };
    if (/^https?:\/\//i.test(text) && !text.startsWith("{") && !text.startsWith("[")) {
        const id = hostId(text);
        return {
            servers: [
                serverFromEntry(id, {
                    url: text,
                    transport: "http",
                    auth: "oauth",
                    name: id,
                }),
            ],
        };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { servers: [], error: "That is not a URL or JSON config." };
    }
    if (!parsed || typeof parsed !== "object") {
        return { servers: [], error: "Config must be a JSON object." };
    }
    const record = parsed as Record<string, unknown>;
    if (record.mcpServers && typeof record.mcpServers === "object") {
        const servers = Object.entries(record.mcpServers as Record<string, RawEntry>).map(
            ([id, cfg]) => serverFromEntry(id, cfg ?? {}),
        );
        if (servers.length === 0) return { servers: [], error: "No servers in that config." };
        return { servers };
    }
    if (typeof record.url === "string" || typeof record.command === "string") {
        const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "";
        const id = name
            ? slugId(name)
            : typeof record.url === "string"
              ? hostId(record.url)
              : "mcp";
        return { servers: [serverFromEntry(id, record as RawEntry)] };
    }
    return { servers: [], error: "Config needs a url, a command, or mcpServers." };
}

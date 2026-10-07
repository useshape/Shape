import { describe, expect, it } from "vitest";
import { parseMcpJson } from "@/lib/mcp/config";
import { parseMcpPaste } from "@/lib/mcp/parse";

describe("mcp-config", () => {
    it("parses empty config", () => {
        expect(parseMcpJson('{"mcpServers": {}}')).toEqual([]);
    });

    it("parses server entries", () => {
        const json = JSON.stringify({
            mcpServers: {
                test: {
                    command: "node",
                    args: ["server.js"],
                    env: { FOO: "bar" },
                },
            },
        });
        const servers = parseMcpJson(json);
        expect(servers).toHaveLength(1);
        expect(servers[0]).toMatchObject({
            id: "test",
            name: "test",
            command: "node",
            args: ["server.js"],
            env: { FOO: "bar" },
            enabled: true,
        });
    });

    it("parses a pasted URL into a UI server shape", () => {
        const parsed = parseMcpPaste("https://mcp.example.com/sse");
        expect(parsed.error).toBeUndefined();
        expect(parsed.servers[0]).toMatchObject({
            id: "mcp-example-com",
            transport: "http",
            auth: "oauth",
            url: "https://mcp.example.com/sse",
        });
    });

    it("parses one server object without treating it as mcp.json", () => {
        const parsed = parseMcpPaste(JSON.stringify({
            name: "Local",
            command: "npx",
            args: ["-y", "some-mcp"],
        }));
        expect(parsed.servers[0]).toMatchObject({
            id: "local",
            transport: "stdio",
            command: "npx",
            auth: "none",
        });
    });

    it("marks disabled servers", () => {
        const json = JSON.stringify({
            mcpServers: {
                off: { command: "node", disabled: true },
            },
        });
        expect(parseMcpJson(json)[0]?.enabled).toBe(false);
    });
});

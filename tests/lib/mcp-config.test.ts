import { describe, expect, it } from "vitest";
import { parseMcpJson } from "@/lib/mcp-config";

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

    it("marks disabled servers", () => {
        const json = JSON.stringify({
            mcpServers: {
                off: { command: "node", disabled: true },
            },
        });
        expect(parseMcpJson(json)[0]?.enabled).toBe(false);
    });
});

import { describe, expect, it } from "vitest";
import {
    extractWwwAuthenticateParam,
    humanizeToolName,
    isPublicNoAuthError,
    loopbackRedirectUri,
    parseOAuthCallbackParams,
    serverIdFromOAuthState,
    truncateOAuthScopes,
} from "@/lib/mcp/oauth";

describe("mcp-oauth helpers", () => {
    it("builds RFC 8252 loopback redirect URIs", () => {
        expect(loopbackRedirectUri(54321)).toBe("http://127.0.0.1:54321/callback");
        expect(loopbackRedirectUri(3118, "localhost")).toBe("http://localhost:3118/callback");
    });

    it("parses authorization code callbacks", () => {
        expect(
            parseOAuthCallbackParams(
                "http://127.0.0.1:9999/callback?code=abc&state=neon%3Ax",
            ),
        ).toEqual({
            code: "abc",
            state: "neon:x",
            error: undefined,
            errorDescription: undefined,
        });
    });

    it("parses OAuth error callbacks", () => {
        expect(
            parseOAuthCallbackParams(
                "/callback?error=access_denied&error_description=Nope",
            ),
        ).toMatchObject({
            error: "access_denied",
            errorDescription: "Nope",
        });
    });

    it("extracts server id from OAuth state", () => {
        expect(serverIdFromOAuthState("neon:nonce123")).toBe("neon");
        expect(serverIdFromOAuthState("github")).toBeNull();
    });

    it("truncates oversized scope lists", () => {
        const many = Array.from({ length: 80 }, (_, i) => `scope.long.name.${i}`).join(" ");
        expect(truncateOAuthScopes(many).length).toBeLessThanOrEqual(400);
        expect(truncateOAuthScopes("openid offline_access read write")).toBe(
            "openid offline_access read write",
        );
        expect(
            truncateOAuthScopes(
                `${"x".repeat(500)} openid offline_access`,
            ),
        ).toBe("openid offline_access");
    });

    it("humanizes MCP tool names", () => {
        expect(humanizeToolName("mcp__neon__run_sql")).toBe("Run Sql");
        expect(humanizeToolName("list-projects")).toBe("List Projects");
    });

    it("extracts WWW-Authenticate params (quoted and bare)", () => {
        expect(
            extractWwwAuthenticateParam(
                'Bearer realm="mcp", resource_metadata="https://ex/.well-known/oauth-protected-resource"',
                "resource_metadata",
            ),
        ).toBe("https://ex/.well-known/oauth-protected-resource");
        expect(
            extractWwwAuthenticateParam(
                "Bearer resource_metadata=https://ex/prm, error=invalid_token",
                "resource_metadata",
            ),
        ).toBe("https://ex/prm");
    });

    it("detects public no-auth probe errors", () => {
        expect(isPublicNoAuthError("PUBLIC_NO_AUTH: Server did not request authentication.")).toBe(
            true,
        );
        expect(isPublicNoAuthError("OAuth registration failed")).toBe(false);
    });
});

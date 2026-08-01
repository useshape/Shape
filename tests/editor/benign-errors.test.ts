import { describe, expect, it } from "vitest";
import { isBenignLspError, isBenignMonacoError, isSuppressedLog } from "@/lib/editor/benign-errors";

describe("benign-errors", () => {
    it("detects IndentGuidesOverlay null left errors", () => {
        const err = new TypeError("Cannot read properties of null (reading 'left')");
        err.stack = "at IndentGuidesOverlay.prepareRender (monaco-editor.js:1:1)";
        expect(isBenignMonacoError(err)).toBe(true);
    });

    it("ignores unrelated errors", () => {
        expect(isBenignMonacoError(new Error("Something else"))).toBe(false);
    });

    it("detects json language client dispose noise", () => {
        expect(isBenignLspError("json Language Client client: couldn't create connection to server.")).toBe(true);
        expect(isBenignLspError("Pending response rejected since connection got disposed")).toBe(true);
    });

    it("suppresses combined console args", () => {
        expect(isSuppressedLog(["json Language Client client:", "couldn't create connection to server."])).toBe(true);
    });

    it("suppresses LSP close errors with stack traces", () => {
        const err = new Error("Connection to server got closed. Server will not be restarted.");
        err.stack = "at TauriLspMessageWriter.end (features/editor/lsp/tauri-transport.ts:126:14)";
        expect(isSuppressedLog([err])).toBe(true);
    });
});

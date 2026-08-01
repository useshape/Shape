import { describe, expect, it } from "vitest";
import { formatCommandError, formatGitError } from "@/lib/format-error";

describe("formatCommandError", () => {
    it("handles empty input", () => {
        expect(formatCommandError("")).toEqual({
            title: "Error",
            message: "An unknown error occurred.",
        });
    });

    it("extracts error line", () => {
        const result = formatCommandError("error: failed to push\nhint: try git pull");
        expect(result.message).toBe("failed to push");
        expect(result.hint).toBe("try git pull");
    });

    it("extracts fatal line as title", () => {
        const result = formatCommandError("fatal: not a git repository");
        expect(result.title).toBe("not a git repository");
        expect(result.message).toBe("not a git repository");
    });

    it("uses fallback title when no fatal", () => {
        const result = formatCommandError("something went wrong", "Build Failed");
        expect(result.title).toBe("Build Failed");
    });

    it("handles multiline git output", () => {
        const raw = `remote: Permission denied
error: failed to push some refs
hint: Updates were rejected`;
        const result = formatGitError(raw);
        expect(result.title).toBe("Git Error");
        expect(result.message).toBe("failed to push some refs");
        expect(result.hint).toContain("Updates were rejected");
    });

    it("maps GitHub admin permission errors", () => {
        const result = formatCommandError("gh: Must have admin rights to Repository. (HTTP 403)");
        expect(result.title).toBe("Permission denied");
        expect(result.message).toContain("admin access");
    });

    it("maps in-progress log messages", () => {
        const result = formatCommandError(
            "job 88532738715 is still in progress; logs will be available when it is complete",
        );
        expect(result.title).toBe("Run still in progress");
        expect(result.message).toContain("Logs will appear");
    });
});

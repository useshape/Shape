import { describe, expect, it } from "vitest";
import {
    SHAPE_ERRORS,
    classifyAiError,
    classifyIdeError,
    errorDocsUrl,
    getError,
} from "@/lib/errors/catalog";

describe("error catalog", () => {
    it("resolves known codes", () => {
        expect(getError(SHAPE_ERRORS.OFFLINE).code).toBe(1001);
        expect(getError(SHAPE_ERRORS.OFFLINE).name).toBe("Offline");
    });

    it("falls back to unknown", () => {
        expect(getError(99999).code).toBe(SHAPE_ERRORS.UNKNOWN);
    });

    it("builds docs urls with the numeric code", () => {
        expect(errorDocsUrl(1001)).toMatch(/\/docs\/help\/errors\/1001$/);
    });

    it("classifies AI error strings", () => {
        expect(classifyAiError("OpenRouter API error").code).toBe(SHAPE_ERRORS.AI_PROVIDER);
        expect(classifyAiError("Please sign in").code).toBe(SHAPE_ERRORS.AUTH_REQUIRED);
        expect(classifyAiError("credit limit").code).toBe(SHAPE_ERRORS.AI_CREDITS);
        expect(
            classifyAiError(
                'OpenRouter API error 403 Forbidden: {"error":"Billing could not be confirmed for a recent request.","code":2004}',
            ).code,
        ).toBe(SHAPE_ERRORS.AI_BILLING_HOLD);
        expect(classifyAiError("network timeout").code).toBe(SHAPE_ERRORS.AI_NETWORK);
        expect(classifyAiError("Missing build attestation").code).toBe(SHAPE_ERRORS.UNOFFICIAL_BUILD);
        expect(classifyAiError("429 Too Many Requests").code).toBe(SHAPE_ERRORS.AI_RATE_LIMITED);
        expect(classifyAiError("rate limit exceeded").code).toBe(SHAPE_ERRORS.AI_RATE_LIMITED);
    });

    it("includes unofficial build error", () => {
        expect(getError(SHAPE_ERRORS.UNOFFICIAL_BUILD).code).toBe(3000);
    });

    it("includes sign-in, rate limit, and update codes", () => {
        expect(getError(SHAPE_ERRORS.SIGN_IN_FAILED).code).toBe(1003);
        expect(getError(SHAPE_ERRORS.AI_RATE_LIMITED).code).toBe(2100);
        expect(getError(SHAPE_ERRORS.UPDATE_FAILED).code).toBe(4500);
    });

    it("includes IDE workspace range", () => {
        expect(getError(SHAPE_ERRORS.WORKSPACE_ACCESS).code).toBe(4000);
        expect(getError(SHAPE_ERRORS.GIT_FAILED).code).toBe(4100);
        expect(getError(SHAPE_ERRORS.LANGUAGE_SERVER).code).toBe(4200);
        expect(getError(SHAPE_ERRORS.INDEX_SEARCH).code).toBe(4300);
        expect(getError(SHAPE_ERRORS.TERMINAL).code).toBe(4400);
        expect(getError(SHAPE_ERRORS.UPDATE_FAILED).code).toBe(4500);
    });

    it("classifies IDE error strings", () => {
        expect(classifyIdeError("failed to push origin").code).toBe(SHAPE_ERRORS.GIT_FAILED);
        expect(classifyIdeError("language server crashed").code).toBe(SHAPE_ERRORS.LANGUAGE_SERVER);
        expect(classifyIdeError("ripgrep not installed").code).toBe(SHAPE_ERRORS.INDEX_SEARCH);
        expect(classifyIdeError("Access is denied (os error 5)").code).toBe(SHAPE_ERRORS.WORKSPACE_ACCESS);
        expect(classifyIdeError("pty spawn failed").code).toBe(SHAPE_ERRORS.TERMINAL);
    });
});

import { describe, expect, it } from "vitest";
import {
    isLocalPreviewUrl,
    normalizePreviewUrl,
    previewUrlsEqual,
} from "@/features/preview/store";

describe("preview store urls", () => {
    it("accepts localhost and loopback only", () => {
        expect(isLocalPreviewUrl("http://localhost:3000")).toBe(true);
        expect(isLocalPreviewUrl("http://127.0.0.1:5173")).toBe(true);
        expect(isLocalPreviewUrl("https://example.com")).toBe(false);
        expect(isLocalPreviewUrl("http://192.168.1.1:3000")).toBe(false);
    });

    it("normalizes bare hosts and rewrites 0.0.0.0", () => {
        expect(normalizePreviewUrl("localhost:3000")).toBe("http://localhost:3000/");
        expect(normalizePreviewUrl("http://0.0.0.0:3000")).toBe("http://localhost:3000/");
    });

    it("treats trailing-slash variants as equal", () => {
        expect(previewUrlsEqual("http://localhost:3000", "http://localhost:3000/")).toBe(true);
        expect(previewUrlsEqual("http://localhost:3000/foo", "http://localhost:3000/foo/")).toBe(true);
        expect(previewUrlsEqual("http://localhost:3000/foo", "http://localhost:3000/bar")).toBe(false);
    });
});

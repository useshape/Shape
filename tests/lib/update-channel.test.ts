import { describe, expect, it } from "vitest";
import { normalizeUpdateChannel } from "@/lib/settings/store";

describe("normalizeUpdateChannel", () => {
    it("keeps stable and nightly", () => {
        expect(normalizeUpdateChannel("stable")).toBe("stable");
        expect(normalizeUpdateChannel("nightly")).toBe("nightly");
    });

    it("migrates legacy pre-release names to nightly", () => {
        expect(normalizeUpdateChannel("pre")).toBe("nightly");
        expect(normalizeUpdateChannel("preview")).toBe("nightly");
        expect(normalizeUpdateChannel("prerelease")).toBe("nightly");
    });

    it("falls back to stable", () => {
        expect(normalizeUpdateChannel(undefined)).toBe("stable");
        expect(normalizeUpdateChannel("beta")).toBe("stable");
    });
});

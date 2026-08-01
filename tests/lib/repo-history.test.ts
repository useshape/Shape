import { describe, expect, it, vi } from "vitest";
import {
    cleanPath,
    formatTimeAgo,
    getRepoName,
    upsertRepoHistory,
    loadRepoHistory,
    clearRepoHistory,
} from "@/lib/repo-history";

describe("repo-history", () => {
    it("extracts repo name from path", () => {
        expect(getRepoName("C:/Users/dev/my-app")).toBe("my-app");
        expect(getRepoName("C:/Users/dev/my-app/")).toBe("my-app");
    });

    it("cleans windows user paths", () => {
        expect(cleanPath("C:/Users/alice/projects/app")).toBe("~/projects/app");
    });

    it("formats time ago", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));
        expect(formatTimeAgo(Date.now() - 30_000)).toBe("just now");
        expect(formatTimeAgo(Date.now() - 5 * 60_000)).toBe("5m ago");
        expect(formatTimeAgo(Date.now() - 3 * 60 * 60_000)).toBe("3h ago");
        expect(formatTimeAgo(Date.now() - 2 * 24 * 60 * 60_000)).toBe("2d ago");
        vi.useRealTimers();
    });

    it("upserts and dedupes paths", () => {
        clearRepoHistory();
        upsertRepoHistory("C:/a");
        upsertRepoHistory("C:/b");
        upsertRepoHistory("C:/a");
        const history = loadRepoHistory();
        expect(history[0]?.path).toBe("C:/a");
        expect(history).toHaveLength(2);
    });

    it("caps history at fifteen entries", () => {
        clearRepoHistory();
        for (let i = 0; i < 20; i++) {
            upsertRepoHistory(`C:/repo-${i}`);
        }
        expect(loadRepoHistory()).toHaveLength(15);
    });
});

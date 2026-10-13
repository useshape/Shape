import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
const token = vi.hoisted(() => vi.fn(() => "token"));

vi.mock("@/lib/cloud/api", () => ({
    shapeApiFetch: fetchMock,
    ShapeApiError: class ShapeApiError extends Error {
        status: number;
        constructor(message: string, status = 500) {
            super(message);
            this.status = status;
        }
    },
}));

vi.mock("@/lib/cloud/store", () => ({
    getShapeAccessToken: token,
}));

import { fetchPlugins, peekPluginsCache, subscribePlugins } from "@/lib/plugins/api";

function canva(connected: boolean) {
    return {
        id: "canva",
        name: "Canva",
        description: "Designs",
        category: "Design",
        toolkit: "canva",
        connected,
        logo: null,
    };
}

beforeEach(() => {
    fetchMock.mockReset();
    token.mockReset();
    token.mockReturnValue("token");
});

describe("plugin catalog", () => {
    it("refetches when the window is focused again", async () => {
        fetchMock.mockResolvedValueOnce({ plugins: [canva(false)], configured: true });
        const updates: boolean[] = [];
        subscribePlugins(() => {
            updates.push(Boolean(peekPluginsCache()?.plugins.some((plugin) => plugin.connected)));
        });

        await fetchPlugins({ force: true });
        expect(peekPluginsCache()?.plugins[0]?.connected).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        fetchMock.mockResolvedValueOnce({ plugins: [canva(true)], configured: true });
        window.dispatchEvent(new Event("focus"));

        await vi.waitFor(() => {
            expect(peekPluginsCache()?.plugins[0]?.connected).toBe(true);
        });
        expect(updates).toContain(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

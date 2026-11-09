import { beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.fn(async () => "C:/tmp/out.glb");
const saveFileBytes = vi.fn(async () => undefined);

vi.mock("@tauri-apps/plugin-dialog", () => ({
    save: (...args: unknown[]) => save(...args),
}));

vi.mock("@/lib/backend", () => ({
    commands: {
        saveFileBytes: (...args: unknown[]) => saveFileBytes(...args),
    },
}));

vi.mock("@/features/notifications", () => ({
    notify: { success: vi.fn(), error: vi.fn() },
}));

describe("saveDownload", () => {
    beforeEach(() => {
        save.mockClear();
        saveFileBytes.mockClear();
    });

    it("writes original GLB bytes", async () => {
        const { saveDownloadBytes } = await import("@/lib/ui/save-download");
        const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02]);
        const ok = await saveDownloadBytes("sword.glb", bytes, "model/gltf-binary");
        expect(ok).toBe(true);
        expect(save).toHaveBeenCalled();
        expect(saveFileBytes).toHaveBeenCalledWith("C:/tmp/out.glb", [0x67, 0x6c, 0x54, 0x46, 0x02]);
    });
});

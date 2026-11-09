import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveDownloadBytesOrNotify = vi.fn();
const saveDownloadOrNotify = vi.fn();
const readMedia = vi.fn();

vi.mock("@/lib/ui/save-download", () => ({
    saveDownloadBytesOrNotify: (...args: unknown[]) => saveDownloadBytesOrNotify(...args),
    saveDownloadOrNotify: (...args: unknown[]) => saveDownloadOrNotify(...args),
}));

vi.mock("@/lib/backend/commands", () => ({
    commands: {
        readMedia: (...args: unknown[]) => readMedia(...args),
    },
}));

vi.mock("@/features/chat/ui/blocks/model-preview", () => ({
    ModelPreview: ({ src }: { src: string }) => <div data-model-preview="" data-src={src} />,
}));

vi.mock("@/features/chat/ui/blocks/lightbox", () => ({
    MediaLightbox: () => null,
}));

import { GeneratedMediaCard } from "@/features/chat/ui/blocks/generated-media";

function mount(node: React.ReactElement) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(node);
    });
    return { host, root };
}

function unmount(root: Root, host: HTMLDivElement) {
    act(() => root.unmount());
    host.remove();
}

describe("GeneratedMediaCard models", () => {
    let root: Root;
    let host: HTMLDivElement;

    beforeEach(() => {
        saveDownloadBytesOrNotify.mockReset();
        saveDownloadOrNotify.mockReset();
        readMedia.mockReset();
        URL.createObjectURL = vi.fn(() => "blob:model") as typeof URL.createObjectURL;
    });

    afterEach(() => {
        unmount(root, host);
    });

    it("shows an error when stash read fails", async () => {
        readMedia.mockRejectedValue(new Error("Unknown media_id 'x'."));
        ({ root, host } = mount(<GeneratedMediaCard kind="model" mediaId="x" prompt="sword" />));
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(host.textContent).toContain("Unknown media_id");
    });

    it("downloads GLB bytes from read_media", async () => {
        const bytes = [0x67, 0x6c, 0x54, 0x46];
        readMedia.mockResolvedValue({
            id: "m1",
            mime: "model/gltf-binary",
            kind: "model",
            path: "C:/media/m1.glb",
            name: "sword.glb",
            prompt: "sword",
            parentId: null,
            bytes,
        });
        ({ root, host } = mount(
            <GeneratedMediaCard kind="model" mediaId="m1" name="sword.glb" prompt="sword" />,
        ));
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
        const button = [...host.querySelectorAll("button")].find((el) => el.textContent === "Download");
        expect(button).toBeTruthy();
        await act(async () => {
            button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(saveDownloadBytesOrNotify).toHaveBeenCalled();
        const args = saveDownloadBytesOrNotify.mock.calls[0];
        expect(args[0]).toBe("sword.glb");
        expect(Array.from(args[1] as Uint8Array)).toEqual(bytes);
    });
});

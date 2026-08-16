import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider, TOAST_STACK_CLASS } from "@/components/ui/notification";
import { notificationStore, notify } from "@/features/notifications";

vi.mock("@/lib/backend", () => ({
    commands: {
        openUrlExternal: vi.fn(),
    },
}));

function mountProvider() {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(
            <NotificationProvider>
                <div />
            </NotificationProvider>,
        );
    });
    return { host, root };
}

function unmount(root: Root, host: HTMLDivElement) {
    act(() => root.unmount());
    host.remove();
}

describe("notification popups", () => {
    let root: Root;
    let host: HTMLDivElement;

    beforeEach(() => {
        notificationStore.clearAll();
        ({ root, host } = mountProvider());
    });

    afterEach(() => {
        unmount(root, host);
        notificationStore.clearAll();
    });

    it("pops up a toast with title and description", () => {
        act(() => {
            notify.warn("Couldn't apply", "Open a project to write these edits to source.");
        });

        const toast = document.querySelector("[data-toast-stack] [role='status']");
        expect(toast).toBeTruthy();
        expect(toast?.textContent).toContain("Couldn't apply");
        expect(toast?.textContent).toContain("Open a project to write these edits to source.");
    });

    it("sits at the bottom above the status bar, not the screen center", () => {
        act(() => {
            notify.success("Applied to source", "page.tsx");
        });

        const stack = document.querySelector("[data-toast-stack]");
        expect(stack).toBeTruthy();
        expect(stack?.className).toBe(TOAST_STACK_CLASS);
        expect(stack?.className).toContain("bottom-[calc(var(--statusbar-height)+12px)]");
        expect(stack?.className).not.toContain("items-center");
        expect(stack?.className).not.toContain("inset-0");
    });

    it("stacks multiple popups as cards", () => {
        act(() => {
            notify.info("First");
            notify.info("Second");
            notify.info("Third");
        });

        const toasts = document.querySelectorAll("[data-toast-stack] [role='status']");
        expect(toasts).toHaveLength(3);
        expect(document.body.textContent).toContain("First");
        expect(document.body.textContent).toContain("Third");
    });

    it("dismisses a popup from the close button", async () => {
        act(() => {
            notify.info("Temp");
        });
        const close = document.querySelector("[data-toast-stack] [aria-label='Dismiss notification']");
        expect(close).toBeTruthy();
        act(() => {
            (close as HTMLButtonElement).click();
        });
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 420));
        });
        expect(document.querySelector("[data-toast-stack] [role='status']")).toBeNull();
    });
});

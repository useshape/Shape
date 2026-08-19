import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationStore, notify, notifyGitError } from "@/features/notifications";

describe("notifications", () => {
    beforeEach(() => {
        notificationStore.clearAll();
    });

    it("adds info notification", () => {
        const id = notificationStore.add("Hello", "info", "details");
        const snapshot = notificationStore.getSnapshot();
        expect(snapshot.notifications).toHaveLength(1);
        expect(snapshot.notifications[0]).toMatchObject({
            id,
            message: "Hello",
            type: "info",
            description: "details",
        });
    });

    it("tracks unread count until viewed", () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        notificationStore.clearAll();
        vi.setSystemTime(1000);
        notificationStore.add("One");
        expect(notificationStore.getUnreadCount()).toBe(1);
        notificationStore.markViewed();
        expect(notificationStore.getUnreadCount()).toBe(0);
        vi.useRealTimers();
    });

    it("dismissToast removes from history so the bell menu does not retain forever", () => {
        const id = notificationStore.add("Temp success", "success");
        notificationStore.dismissToast(id);
        expect(notificationStore.getSnapshot().notifications).toHaveLength(0);
        expect(notificationStore.getSnapshot().toastIds).toHaveLength(0);
    });

    it("prunes notifications older than the history TTL", () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        notificationStore.clearAll();
        notificationStore.add("Old", "info");
        vi.setSystemTime(6 * 60 * 1000);
        notificationStore.add("New", "info");
        notificationStore.markViewed();
        const messages = notificationStore.getSnapshot().notifications.map((n) => n.message);
        expect(messages).toEqual(["New"]);
        vi.useRealTimers();
    });

    it("limits toast ids to three", () => {
        notificationStore.add("1", "info");
        notificationStore.add("2", "info");
        notificationStore.add("3", "info");
        notificationStore.add("4", "info");
        expect(notificationStore.getSnapshot().toastIds).toHaveLength(3);
    });

    it("notify helpers add typed messages", () => {
        notify.error("Failed", "details");
        notify.success("Done");
        notify.warning("Careful", "heads up");
        const snapshot = notificationStore.getSnapshot();
        expect(snapshot.notifications[0]?.type).toBe("error");
        expect(snapshot.notifications[1]?.type).toBe("success");
        expect(snapshot.notifications[2]?.type).toBe("warning");
        // Errors must still appear as toasts (auto-hide like the rest).
        expect(snapshot.toastIds).toContain(snapshot.notifications[0]?.id);
        expect(snapshot.toastIds).toContain(snapshot.notifications[1]?.id);
        expect(snapshot.toastIds).toContain(snapshot.notifications[2]?.id);
        expect(snapshot.notifications[0]?.autoHide).not.toBe(false);
        expect(snapshot.notifications[2]?.autoHide).not.toBe(false);
    });

    it("stores numeric error codes on notifications", () => {
        notify.error("Offline", "Could not reach servers.", { code: 1001 });
        const entry = notificationStore.getSnapshot().notifications[0];
        expect(entry?.code).toBe(1001);
        expect(entry?.type).toBe("error");
    });

    it("notifyGitError attaches git error code 4100", () => {
        notifyGitError("failed to push: authentication required");
        const entry = notificationStore.getSnapshot().notifications[0];
        expect(entry?.code).toBe(4100);
        expect(entry?.type).toBe("error");
    });
});

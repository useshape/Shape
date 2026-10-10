import { describe, expect, it } from "vitest";
import { describeUpdateStatus, type UpdateStatus } from "@/lib/window/updater";

describe("describeUpdateStatus", () => {
    it("does not call an unchecked update ready to install", () => {
        const available: UpdateStatus = {
            kind: "available",
            version: "1.0.1",
            notes: "",
        };
        expect(describeUpdateStatus(available)).toBe(
            "1.0.1 is available. Install it, then restart.",
        );
        expect(describeUpdateStatus(available).toLowerCase()).not.toContain(
            "ready to install",
        );
    });

    it("tells you to restart only after the download finished", () => {
        expect(describeUpdateStatus({ kind: "ready", version: "1.0.1" })).toBe(
            "1.0.1 is downloaded. Restart Shape to finish.",
        );
        expect(
            describeUpdateStatus({
                kind: "downloading",
                version: "1.0.1",
                progress: 40,
            }),
        ).toBe("Downloading 1.0.1… 40%");
    });

    it("stays boring when nothing is pending", () => {
        expect(describeUpdateStatus({ kind: "idle" })).toBe(
            "You're on the latest version.",
        );
        expect(describeUpdateStatus({ kind: "upToDate" })).toBe(
            "You're on the latest version.",
        );
    });
});

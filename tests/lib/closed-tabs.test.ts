import { describe, expect, it, vi } from "vitest";
import { rememberClosedTab, reopenLastClosed } from "@/lib/closed-tabs";

vi.mock("@/lib/backend/commands", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/backend/commands")>();
    return {
        ...actual,
        commands: {
            ...actual.commands,
            openFile: vi.fn().mockResolvedValue(undefined),
        },
    };
});

vi.mock("@/features/notifications", () => ({
    notify: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

import { commands } from "@/lib/backend/commands";
import { notify } from "@/features/notifications";

describe("closed-tabs", () => {
    it("reopens most recently closed tab", async () => {
        rememberClosedTab("C:/a.ts", "a.ts");
        rememberClosedTab("C:/b.ts", "b.ts");
        await reopenLastClosed();
        expect(commands.openFile).toHaveBeenCalledWith("C:/b.ts", "b.ts");
    });

    it("notifies when stack is empty after draining", async () => {
        for (let i = 0; i < 21; i++) {
            rememberClosedTab(`C:/f${i}.ts`, `f${i}.ts`);
        }
        vi.mocked(commands.openFile).mockClear();
        for (let i = 0; i < 21; i++) {
            await reopenLastClosed();
        }
        expect(notify.info).toHaveBeenCalled();
    });
});

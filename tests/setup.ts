import { afterEach, beforeAll } from "vitest";
import { randomFillSync } from "node:crypto";
import { clearMocks, mockWindows } from "@tauri-apps/api/mocks";

beforeAll(() => {
    Object.defineProperty(window, "crypto", {
        value: {
            getRandomValues: <T extends ArrayBufferView>(buffer: T): T => {
                randomFillSync(buffer as unknown as NodeJS.ArrayBufferView);
                return buffer;
            },
            randomUUID: () =>
                `00000000-0000-4000-8000-${Array.from(randomFillSync(new Uint8Array(6)))
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("")}`,
        },
        configurable: true,
    });
    mockWindows("main");
});

afterEach(() => {
    clearMocks();
    localStorage.clear();
});

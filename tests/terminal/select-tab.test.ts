import { describe, expect, it } from "vitest";
import { selectTerminalTab } from "@/lib/terminal/tabs";

describe("selectTerminalTab", () => {
    const tabs = [
        { id: "1", cwd: "C:/proj" },
        { id: "2", cwd: "C:/proj" },
        { id: "3", cwd: "C:/other" },
    ];

    it("returns null when no tabs for cwd", () => {
        expect(selectTerminalTab(tabs, "C:/missing", null)).toBeNull();
    });

    it("keeps active tab when still valid", () => {
        expect(selectTerminalTab(tabs, "C:/proj", "1")).toBe("1");
    });

    it("falls back to last project tab", () => {
        expect(selectTerminalTab(tabs, "C:/proj", "3")).toBe("2");
    });

    it("selects only tab for cwd", () => {
        expect(selectTerminalTab(tabs, "C:/other", null)).toBe("3");
    });
});

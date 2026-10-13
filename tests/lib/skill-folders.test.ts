import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetSettings } from "../helpers/settings";

import {
    addCustomSkillFolder,
    listCustomSkillFolders,
    removeCustomSkillFolder,
    subscribeCustomSkillFolders,
} from "@/lib/chat/skill-folders";
import { updateSettingSection } from "@/lib/settings";

beforeEach(() => {
    resetSettings();
});

describe("subscribeCustomSkillFolders", () => {
    it("notifies when a folder is added or removed", () => {
        const listener = vi.fn();
        subscribeCustomSkillFolders(listener);

        addCustomSkillFolder("/mnt/team-skills");
        expect(listener).toHaveBeenCalledTimes(1);

        removeCustomSkillFolder("/mnt/team-skills");
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("ignores settings changes that leave the folder list alone", () => {
        const listener = vi.fn();
        subscribeCustomSkillFolders(listener);

        updateSettingSection("editor", { fontSize: 15 });
        updateSettingSection("ai", {});
        updateSettingSection("skills", { folders: listCustomSkillFolders() });

        expect(listener).not.toHaveBeenCalled();
    });

    it("notifies again after the list changes a second time", () => {
        const listener = vi.fn();
        subscribeCustomSkillFolders(listener);

        addCustomSkillFolder("/mnt/one");
        updateSettingSection("editor", { fontSize: 15 });
        addCustomSkillFolder("/mnt/two");

        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("stops notifying after unsubscribing", () => {
        const listener = vi.fn();
        const unsubscribe = subscribeCustomSkillFolders(listener);

        unsubscribe();
        addCustomSkillFolder("/mnt/after");

        expect(listener).not.toHaveBeenCalled();
    });

    it("sees the folder list as the settings store does", () => {
        addCustomSkillFolder("  /mnt/spaced  ");
        addCustomSkillFolder("/mnt/spaced");

        expect(listCustomSkillFolders()).toEqual(["/mnt/spaced"]);
    });
});

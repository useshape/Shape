"use client";

import { SettingRow, SettingSection, SettingSelect, SettingSwitch } from "@/features/settings/ui/shared/controls";
import { setDockPrefs, useDockPrefs, type DockPrefs } from "@/features/agent/dock/prefs";
import type { DockPlace } from "@/features/agent/dock/tree";

const PLACES: { value: DockPlace; label: string }[] = [
    { value: "current", label: "Current group" },
    { value: "right", label: "Split right" },
    { value: "left", label: "Split left" },
    { value: "bottom", label: "Split bottom" },
    { value: "top", label: "Split top" },
    { value: "full", label: "Full area" },
];

export function WorkspaceLayoutSettings() {
    const prefs = useDockPrefs();
    const set = (patch: Partial<DockPrefs>) => setDockPrefs(patch);
    return (
        <SettingSection
            id="settings-workspace-layout"
            title="Workspace layout"
            description="Where new chats, threads, and the terminal land in the main grid. The sidebar stays the list of chats."
        >
            <SettingRow title="Restore layout" description="Keep split sizes and groups for the next launch.">
                <SettingSwitch checked={prefs.restore} onChange={(restore) => set({ restore })} />
            </SettingRow>
            <SettingRow title="Show terminal" description="Open a short terminal under the chat when a workspace starts.">
                <SettingSwitch checked={prefs.autoTerminal} onChange={(autoTerminal) => set({ autoTerminal })} />
            </SettingRow>
            <SettingRow title="New chat">
                <SettingSelect value={prefs.chatPlace} options={PLACES} onChange={(chatPlace) => set({ chatPlace })} />
            </SettingRow>
            <SettingRow title="New thread" description="Spawned threads stay in the background unless focus is on.">
                <SettingSelect value={prefs.threadPlace} options={PLACES} onChange={(threadPlace) => set({ threadPlace })} />
            </SettingRow>
            <SettingRow title="Focus new threads">
                <SettingSwitch checked={prefs.threadFocus} onChange={(threadFocus) => set({ threadFocus })} />
            </SettingRow>
            <SettingRow title="Terminal placement">
                <SettingSelect value={prefs.terminalPlace} options={PLACES} onChange={(terminalPlace) => set({ terminalPlace })} />
            </SettingRow>
            <SettingRow title="Reset layout" description="Back to a chat with a terminal along the bottom.">
                <button
                    type="button"
                    className="rounded-full px-3 py-1 text-sm text-text-primary hover:bg-panel-hover"
                    onClick={() => window.dispatchEvent(new Event("shape-dock-reset"))}
                >
                    Reset
                </button>
            </SettingRow>
        </SettingSection>
    );
}

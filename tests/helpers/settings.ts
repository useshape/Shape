import { DEFAULT_SETTINGS, getSettings, updateSettingSection, type ShapeSettings } from "@/lib/settings";

export function resetSettings() {
    localStorage.setItem("shape-settings-v1", JSON.stringify(DEFAULT_SETTINGS));
    updateSettingSection("editor", { ...DEFAULT_SETTINGS.editor });
}

export function withSettings(patch: Partial<ShapeSettings>) {
    const current = getSettings();
    localStorage.setItem(
        "shape-settings-v1",
        JSON.stringify({
            ...current,
            ...patch,
            editor: { ...current.editor, ...patch.editor },
            git: {
                ...current.git,
                ...patch.git,
                blame: { ...current.git.blame, ...patch.git?.blame },
            },
            lsp: { ...current.lsp, ...patch.lsp },
            node: { ...current.node, ...patch.node },
            ai: { ...current.ai, ...patch.ai },
        }),
    );
    if (patch.editor) updateSettingSection("editor", patch.editor);
    if (patch.git) updateSettingSection("git", patch.git);
    if (patch.lsp) updateSettingSection("lsp", patch.lsp);
    if (patch.node) updateSettingSection("node", patch.node);
    if (patch.terminal) updateSettingSection("terminal", patch.terminal);
    if (patch.ai) updateSettingSection("ai", patch.ai);
}

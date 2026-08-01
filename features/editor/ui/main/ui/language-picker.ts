import { getMonacoLanguage } from "@/features/editor/lsp/languages";
import { MONACO_LANGUAGE_OPTIONS } from "@/lib/monaco-languages";

export function openLanguageModePicker(filePath: string, currentLanguage?: string) {
    const detected = getMonacoLanguage(filePath);
    const active = currentLanguage || detected;

    const actions = [
        {
            id: "language-auto-detect",
            label: "Auto Detect",
            shortcut: detected,
            run: () => {
                window.dispatchEvent(new CustomEvent("shape-editor-action", {
                    detail: { action: "setLanguage", value: detected, autoDetect: true },
                }));
            },
        },
        ...MONACO_LANGUAGE_OPTIONS.map((lang) => ({
            id: `language-${lang.id}`,
            label: lang.label,
            shortcut: lang.id,
            run: () => {
                window.dispatchEvent(new CustomEvent("shape-editor-action", {
                    detail: { action: "setLanguage", value: lang.id },
                }));
            },
        })),
    ];

    window.dispatchEvent(new CustomEvent("shape-command-palette", {
        detail: {
            mode: "language_mode",
            placeholder: "Select Language Mode",
            filter: active,
            actions,
        },
    }));
}

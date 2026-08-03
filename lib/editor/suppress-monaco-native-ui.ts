/**
 * Steal Monaco shortcuts that open built-in overlays so Shape UI handles them instead.
 *
 * Monaco native overlays (standalone editor):
 * - F1 → editor.action.quickCommand (command palette)
 * - Ctrl/Cmd+G → editor.action.gotoLine
 * - Ctrl/Cmd+Shift+O → editor.action.quickOutline
 * - Ctrl/Cmd+F → find widget
 * - Ctrl/Cmd+H → find/replace widget (mac: Ctrl+Alt+F)
 *
 * Shape already routes most of these via keybindings.json (capture phase).
 * F1 and Ctrl+Shift+O are not in that list, so Monaco wins unless stolen here.
 */

type MonacoNs = typeof import("monaco-editor");
type CodeEditor = import("monaco-editor").editor.IStandaloneCodeEditor | import("monaco-editor").editor.ICodeEditor;

let keybindingRulesInstalled = false;

function openShapeCommandPalette(detail?: Record<string, unknown>) {
    window.dispatchEvent(new CustomEvent("shape-command-palette", detail ? { detail } : undefined));
}

/** Global keybinding null-outs so Monaco never opens its own overlays. */
export function installMonacoNativeUiKeybindingBlocks(monaco: MonacoNs): void {
    if (keybindingRulesInstalled) return;
    keybindingRulesInstalled = true;

    const { KeyCode, KeyMod, editor } = monaco;
    editor.addKeybindingRules([
        { keybinding: KeyCode.F1, command: null },
        { keybinding: KeyMod.CtrlCmd | KeyCode.KeyG, command: null },
        { keybinding: KeyMod.WinCtrl | KeyCode.KeyG, command: null },
        { keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO, command: null },
        { keybinding: KeyMod.CtrlCmd | KeyCode.KeyF, command: null },
        { keybinding: KeyMod.CtrlCmd | KeyCode.KeyH, command: null },
        { keybinding: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyF, command: null },
    ]);
}

/**
 * Per-editor command steals that route to Shape UI.
 * Call once after create/onMount for every code editor (including DiffEditor sides).
 */
export function bindMonacoNativeUiToShape(editor: CodeEditor, monaco: MonacoNs): void {
    installMonacoNativeUiKeybindingBlocks(monaco);

    editor.updateOptions({ contextmenu: false });

    const { KeyCode, KeyMod } = monaco;

    editor.addCommand(KeyCode.F1, () => {
        openShapeCommandPalette();
    });

    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyG, () => {
        openShapeCommandPalette({ mode: "goto_line", placeholder: "Line : Column" });
    });

    editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO, () => {
        openShapeCommandPalette({ mode: "editor_symbols" });
    });

    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyF, () => {
        window.dispatchEvent(new Event("open-in-file-search"));
    });

    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyH, () => {
        window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "search" }));
        window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "primary-sidebar", value: true } }));
        window.dispatchEvent(new CustomEvent("shape-search-mode", { detail: { mode: "replace" } }));
    });
}

/** Apply Shape-native-UI bindings to both DiffEditor panes + disable gutter selection toolbar. */
export function bindDiffEditorNativeUiToShape(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    diffEditor: any,
    monaco: MonacoNs,
): void {
    const original = diffEditor.getOriginalEditor?.();
    const modified = diffEditor.getModifiedEditor?.();
    if (original) bindMonacoNativeUiToShape(original, monaco);
    if (modified) bindMonacoNativeUiToShape(modified, monaco);
    diffEditor.updateOptions?.({
        renderGutterMenu: false,
        contextmenu: false,
    });
}

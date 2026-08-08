/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    toMonacoColor,
    toMonacoOpaqueColor,
} from "@/lib/ui/monaco-color";

export {
    toMonacoColor,
    toMonacoOpaqueColor,
    toMonacoTokenForeground,
} from "@/lib/ui/monaco-color";

export function getMonacoCssVar(name: string, fallback: string): string {
    if (typeof document === "undefined") return toMonacoColor(fallback, fallback);
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return toMonacoColor(val || fallback, fallback);
}

function getMonacoOpaqueCssVar(name: string, fallback: string): string {
    if (typeof document === "undefined") return toMonacoOpaqueColor(fallback, fallback);
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return toMonacoOpaqueColor(val || fallback, fallback);
}

let lastMonaco: any = null;
let lastThemeFingerprint = "";
let applyInFlight: Promise<void> | null = null;
let applyQueued = false;

/** Token colors shared across Monaco Monarch languages (incl. language suffixes). */
function buildShapeThemeRules(light: boolean) {
    const comment = light ? "6a737d" : "6e6e75";
    const keyword = light ? "cf222e" : "f0883e";
    const string = light ? "0a3069" : "4ade80";
    const number = light ? "0550ae" : "f5a057";
    const type = light ? "0550ae" : "6eb5ff";
    const fn = light ? "8250df" : "6eb5ff";
    const variable = light ? "1f2328" : "ededee";
    const constant = light ? "953800" : "f5a623";
    const delimiter = light ? "656d76" : "a1a1a6";
    const operator = light ? "656d76" : "a1a1a6";
    const regexp = light ? "0a3069" : "c084fc";
    const tag = light ? "116329" : "f0883e";
    const attribute = light ? "0550ae" : "6eb5ff";
    const meta = light ? "656d76" : "a1a1a6";
    const invalid = light ? "cf222e" : "e5484d";

    const base = [
        { token: "", foreground: variable },
        { token: "comment", foreground: comment, fontStyle: "italic" },
        { token: "keyword", foreground: keyword },
        { token: "string", foreground: string },
        { token: "number", foreground: number },
        { token: "type", foreground: type },
        { token: "type.identifier", foreground: type },
        { token: "function", foreground: fn },
        { token: "variable", foreground: variable },
        { token: "constant", foreground: constant },
        { token: "delimiter", foreground: delimiter },
        { token: "operator", foreground: operator },
        { token: "regexp", foreground: regexp },
        { token: "tag", foreground: tag },
        { token: "attribute.name", foreground: attribute },
        { token: "attribute.value", foreground: string },
        { token: "metatag", foreground: meta },
        { token: "meta", foreground: meta },
        { token: "invalid", foreground: invalid },
        { token: "annotation", foreground: constant },
        { token: "key", foreground: attribute },
        { token: "value", foreground: string },
        { token: "entity.name.function", foreground: fn },
        { token: "entity.name.type", foreground: type },
        { token: "entity.name.tag", foreground: tag },
        { token: "entity.other.attribute-name", foreground: attribute },
        { token: "support.function", foreground: fn },
        { token: "support.type", foreground: type },
        { token: "support.class", foreground: type },
        { token: "storage.type", foreground: keyword },
        { token: "storage.modifier", foreground: keyword },
        { token: "constant.numeric", foreground: number },
        { token: "constant.language", foreground: constant },
        { token: "string.quoted", foreground: string },
        { token: "comment.line", foreground: comment, fontStyle: "italic" },
        { token: "comment.block", foreground: comment, fontStyle: "italic" },
        { token: "keyword.control", foreground: keyword },
        { token: "keyword.operator", foreground: operator },
        { token: "variable.parameter", foreground: variable },
        { token: "variable.other", foreground: variable },
        { token: "punctuation", foreground: delimiter },
    ];

    const suffixes = [
        "js", "ts", "css", "scss", "less", "html", "json", "md", "yaml", "xml", "sql",
        "python", "rust", "go", "java", "c", "cpp", "csharp", "php", "ruby", "swift",
        "kotlin", "dart", "shell", "powershell", "dockerfile", "ini", "lua", "r",
        "graphql", "hcl", "bat", "perl", "scala", "clojure", "elixir", "fsharp",
        "objective-c", "protobuf", "solidity", "wgsl", "typespec", "mdx", "handlebars",
        "pug", "twig", "mysql", "pgsql", "redis", "coffee", "vb", "scheme", "tcl",
        "julia", "bicep", "liquid", "razor", "cypher", "sparql", "systemverilog",
        "restructuredtext", "pascal", "abap", "apex", "ecl", "qsharp", "redshift",
        "st", "sb", "mips", "azcli", "csp", "sophia", "lexon", "pla", "postiats",
        "powerquery", "freemarker2", "cameligo", "pascaligo", "flow9", "m3",
    ];

    const withSuffixes = [...base];
    for (const suffix of suffixes) {
        withSuffixes.push(
            { token: `comment.${suffix}`, foreground: comment, fontStyle: "italic" },
            { token: `keyword.${suffix}`, foreground: keyword },
            { token: `string.${suffix}`, foreground: string },
            { token: `number.${suffix}`, foreground: number },
            { token: `type.${suffix}`, foreground: type },
            { token: `function.${suffix}`, foreground: fn },
            { token: `variable.${suffix}`, foreground: variable },
            { token: `constant.${suffix}`, foreground: constant },
            { token: `delimiter.${suffix}`, foreground: delimiter },
            { token: `operator.${suffix}`, foreground: operator },
            { token: `regexp.${suffix}`, foreground: regexp },
            { token: `tag.${suffix}`, foreground: tag },
            { token: `attribute.name.${suffix}`, foreground: attribute },
            { token: `attribute.value.${suffix}`, foreground: string },
            { token: `meta.${suffix}`, foreground: meta },
            { token: `invalid.${suffix}`, foreground: invalid },
            { token: `annotation.${suffix}`, foreground: constant },
            { token: `key.${suffix}`, foreground: attribute },
        );
    }

    return withSuffixes;
}

function isDocumentLightMonaco(): boolean {
    return false;
}

export function getShapeMonacoThemeName(): "shape-light" | "shape-dark" {
    return isDocumentLightMonaco() ? "shape-light" : "shape-dark";
}

/** Theme id from settings (prefer for React `theme` props so they update on toggle). */
export function shapeMonacoThemeFromColorTheme(_colorTheme: unknown): "shape-light" | "shape-dark" {
    return "shape-dark";
}

export function defineShapeMonacoThemes(monaco: any) {
    if (!monaco?.editor) return;
    lastMonaco = monaco;

    const light = isDocumentLightMonaco();
    const themeName = light ? "shape-light" : "shape-dark";

    // editor.foreground / editor.background are injected into ColorMap — opaque 6-digit only.
    const editorBg = getMonacoOpaqueCssVar("--editor", light ? "#ffffff" : "#141414");
    const fg = getMonacoOpaqueCssVar("--text-primary", light ? "#1c1c1e" : "#ededee");
    const muted = getMonacoOpaqueCssVar("--text-muted", light ? "#7a7a82" : "#6e6e75");
    const secondary = getMonacoOpaqueCssVar("--text-secondary", light ? "#5c5c63" : "#a1a1a6");
    const accent = getMonacoOpaqueCssVar("--accent", "#3946ff");
    const surface3 = getMonacoOpaqueCssVar("--surface-3", light ? "#ececee" : "#242424");
    const border = getMonacoCssVar("--border-subtle", light ? "#0000000f" : "#ffffff0b");

    const fingerprint = `${themeName}|${editorBg}|${fg}|${muted}|${secondary}|${accent}|${surface3}|${border}`;
    if (fingerprint === lastThemeFingerprint) {
        try {
            monaco.editor.setTheme(themeName);
        } catch {
            /* theme may not exist yet on this monaco instance */
        }
        return;
    }

    const rules = buildShapeThemeRules(light);

    try {
        // Separate theme ids so flipping Monaco `base` (vs vs vs-dark) does not
        // corrupt token colors under a reused theme name.
        monaco.editor.defineTheme(themeName, {
            base: light ? "vs" : "vs-dark",
            inherit: true,
            rules,
            colors: {
                "focusBorder": "#00000000",
                "contrastBorder": "#00000000",
                "editor.lineHighlightBackground": light ? "#00000008" : "#ffffff12",
                "editor.lineHighlightBorder": "#00000000",
                "editor.background": editorBg,
                "editor.foreground": fg,
                "editor.selectionBackground": light ? "#3946ff28" : "#ffffff18",
                "editor.inactiveSelectionBackground": light ? "#3946ff14" : "#ffffff10",
                "editorCursor.foreground": accent,
                "editorLineNumber.foreground": muted,
                "editorLineNumber.activeForeground": secondary,
                "editorIndentGuide.background": light ? "#0000000a" : "#ffffff08",
                "editorIndentGuide.activeBackground": light ? "#00000014" : "#ffffff14",
                "editorWidget.background": surface3,
                "editorWidget.border": border,
                "editorGutter.background": editorBg,
                "diffEditor.insertedTextBackground": light ? "#1a7f3720" : "#4ade8020",
                "diffEditor.removedTextBackground": light ? "#cf222e20" : "#e5484d20",
            },
        });
        monaco.editor.setTheme(themeName);
        lastThemeFingerprint = fingerprint;
    } catch (err) {
        console.warn("[Monaco] defineTheme failed, falling back:", err);
        lastThemeFingerprint = "";
        try {
            monaco.editor.setTheme(light ? "vs" : "vs-dark");
        } catch {
            /* ignore */
        }
    }
}

/**
 * Apply Shape theme on both Monaco entry points (standalone + codingame API).
 * LSP init loads @codingame/monaco-vscode-api which can diverge from monaco-editor.
 */
export async function applyShapeMonacoThemeEverywhere(): Promise<void> {
    if (applyInFlight) {
        applyQueued = true;
        return applyInFlight;
    }

    applyInFlight = (async () => {
        do {
            applyQueued = false;
            const targets: any[] = [];
            if (lastMonaco) targets.push(lastMonaco);
            if (typeof window !== "undefined" && (window as any).monaco) {
                targets.push((window as any).monaco);
            }
            try {
                targets.push(await import("monaco-editor"));
            } catch {
                /* ignore */
            }
            try {
                targets.push(await import("@codingame/monaco-vscode-editor-api"));
            } catch {
                /* ignore */
            }

            const seen = new Set<any>();
            for (const monaco of targets) {
                const api = monaco?.editor ? monaco : monaco?.default?.editor ? monaco.default : null;
                if (!api?.editor || seen.has(api)) continue;
                seen.add(api);
                defineShapeMonacoThemes(api);
            }
        } while (applyQueued);
    })().finally(() => {
        applyInFlight = null;
    });

    return applyInFlight;
}

/** Re-read CSS vars and re-apply after color theme changes. */
export function refreshShapeMonacoTheme() {
    lastThemeFingerprint = "";
    void applyShapeMonacoThemeEverywhere();
}

/**
 * Keep shape-dark active after monaco-vscode-api initialize().
 * One reapply shortly after mount — avoid interval flashing.
 */
export function guardShapeMonacoTheme(monaco?: any) {
    if (monaco) lastMonaco = monaco;
    void applyShapeMonacoThemeEverywhere();
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
        void applyShapeMonacoThemeEverywhere();
    }, 100);
}

export function getMonacoFontFamily(): string {
    if (typeof document === "undefined") {
        return "'IBM Plex Mono', ui-monospace, monospace";
    }
    return (
        getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() ||
        "'IBM Plex Mono', ui-monospace, monospace"
    );
}

export function getMonacoEditorOptions(overrides: Record<string, unknown> = {}) {
    return {
        padding: { top: 12 },
        cursorSmoothCaretAnimation: "on" as const,
        semanticHighlighting: { enabled: false },
        lightbulb: {
            enabled: "off" as unknown as import("monaco-editor").editor.ShowLightbulbIconMode,
        },
        colorDecorators: false,
        contextmenu: false,
        stickyScroll: { enabled: true },
        occurrencesHighlight: "singleFile" as const,
        selectionHighlight: true,
        scrollbar: {
            vertical: "auto" as const,
            horizontal: "auto" as const,
            useShadows: false,
            verticalSliderSize: 6,
            horizontalSliderSize: 6,
        },
        ...overrides,
    };
}

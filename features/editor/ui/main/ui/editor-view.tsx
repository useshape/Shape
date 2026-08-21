import React, { useEffect, useRef, useCallback, useState, memo, useMemo } from "react";
import Editor from "@monaco-editor/react";
import { listen } from "@tauri-apps/api/event";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { cn } from "@/lib/utils";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { BezierPicker } from "../../bezier-picker/ui/bezier-picker";
import { FlexPanel } from "../../tailwind-controls/flex-panel";
import { GapPanel } from "../../tailwind-controls/gap-panel";
import { PaddingPanel } from "../../tailwind-controls/padding-panel";
import { RadiusPanel } from "../../tailwind-controls/radius-panel";
import { getTailwindControlKind, type TailwindControlKind } from "../../tailwind-controls/lib/spacing";
import { TailwindControlPortal } from "../../tailwind-controls/portal";
import {
    controlKindAtOffset,
    findAllDesignProperties,
    findDesignPropertyAtOffset,
    scrubValueFromDelta,
    type DesignSourceHit,
} from "@/features/editor/lib/design-source-map";
import {
    applySpacingScaleRefactor,
    planSpacingScaleRefactor,
} from "@/features/editor/lib/spacing-refactor";
import { ensureDesignBlameHover } from "@/features/editor/lsp/design-blame";
import {
    applyClassEdit,
    findClassContexts,
    getContextAtModelOffset,
    getTokensInContext,
    monacoRangeForContextInModel,
    sliceContextBody,
    type ClassContext,
} from "@/features/editor/lib/class-attribute";
import {
    getCachedGlobalsCssContent,
    getCachedProjectColorVariables,
    isGlobalCssFile,
    setCachedGlobalsCssContent,
    updateCssVariableInContent,
    renameCssVariableInContent,
} from "@/lib/css-variables";
import { ensureGlobalsCssLoaded } from "@/lib/css-variables-loader";
import {
    parseCssVariables,
    type CssVariable,
} from "@/lib/css-variables";
import { resolvePackageRootForFile } from "@/lib/project/package-root";
import { isPopoutPath } from "@/lib/tauri-window";
import { getMonacoLanguage, getLspServersForProject } from "../../../lsp/languages";
import { LspClientManager } from "../../../lsp/lsp-client";
import { resolveLspLaunch, readTypescriptVersion } from "../../../lsp/resolve-launch";
import { updateDiagnosticsFromMonaco } from "@/features/diagnostics/store";
import { getSettings, getMonacoOptionsFromSettings, updateSettingSection, isLspLanguageEnabled, useSettings } from "@/lib/settings";
import { isWorkspaceTrusted } from "@/lib/workspace-trust";
import { registerMonacoEditor } from "@/lib/editor/monaco-registry";
import { bindMonacoNativeUiToShape } from "@/lib/editor/suppress-monaco-native-ui";
import { isBenignLspError } from "@/lib/editor/benign-errors";
import type { ProjectFrameworks } from "../../../lsp/frameworks";
import { AutocompleteOverlay } from "./autocomplete";
import {
    COLOR_REGEX,
    resolveColorForSwatch,
    findColorTokenAtColumn,
    isDecoratableColorToken,
    findTailwindTokenAtColumn,
    getTailwindDocsUrl,
} from "../../color-picker/tailwind-utils";
import { ColorPickerPortal, isLayoutSwatchTarget, isSwatchTarget, type PickerAnchor } from "../../color-picker/portal";
import { BEZIER_REGEX } from "../../bezier-picker/ui/bezier-utils";
import { defineShapeMonacoThemes, getMonacoEditorOptions, shapeMonacoThemeFromColorTheme } from "@/lib/ui/monaco-theme";
import { registerEmmetForMonaco } from "../hooks/use-emmet";
import { attachBlameProvider } from "../../blame/blame-provider";
import { attachConflictResolver } from "../../conflict/conflict-resolver";
import { attachCommentsProvider } from "../../comments/comments-provider";
import { useEslint, applyEslintFixOnSave, registerPrettierFormatProvider } from "../hooks/use-eslint";
import { useDesignDiagnostics } from "../hooks/use-design-diagnostics";
import { useEditorSplit, type EditorGroupId } from "@/core/providers/editor";
import { getIconPath } from "@/lib/ui/icons/files";
import { DiffView } from "./diff";
import { ensureCssVarProviders, registerCssVariables } from "@/features/editor/lsp/css-var-completions";
import { ensureDesignCompletionProvider } from "@/features/editor/lsp/design-completions";
import {
    attachImageHoverToEditor,
    resolveImageDisplaySrc,
    resolveLocalImagePathCandidates,
    type ImageHoverDetail,
} from "@/features/editor/lsp/image-hover";
import type { EditorAnchor } from "@/features/editor/ui/tailwind-controls/portal";
import { Tooltip } from "@/components/ui/tooltip";

type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

const TW_SWATCH_CLASS = {
    flex: "shape-tw-swatch-flex",
    gap: "shape-tw-swatch-gap",
    pad: "shape-tw-swatch-pad",
    radius: "shape-tw-swatch-radius",
} as const;

function injectTwSwatchStyles() {
    const styleId = "style-shape-tw-swatches";
    if (document.getElementById(styleId)) return;
    const s = document.createElement("style");
    s.id = styleId;
    s.textContent = [
        `.${TW_SWATCH_CLASS.flex}::before{content:"\\200B";display:inline-block!important;width:12px!important;height:12px!important;border:1.5px solid #38bdf8!important;background:linear-gradient(to right,rgba(56,189,248,0.35) 0 4px,transparent 4px 6px,rgba(56,189,248,0.35) 6px 10px)!important;border-radius:3px!important;margin-right:4px!important;vertical-align:middle!important;cursor:pointer!important;pointer-events:auto!important}`,
        `.${TW_SWATCH_CLASS.gap}::before{content:"\\200B";display:inline-block!important;width:12px!important;height:12px!important;border:1.5px dashed #a78bfa!important;background:repeating-linear-gradient(90deg,rgba(167,139,250,0.4) 0 2px,transparent 2px 4px)!important;border-radius:3px!important;margin-right:4px!important;vertical-align:middle!important;cursor:pointer!important;pointer-events:auto!important}`,
        `.${TW_SWATCH_CLASS.pad}::before{content:"\\200B";display:inline-block!important;width:12px!important;height:12px!important;border:1.5px solid #34d399!important;background:linear-gradient(rgba(52,211,153,0.25),rgba(52,211,153,0.25)) padding-box,linear-gradient(transparent 2px,transparent 2px) border-box!important;border-radius:3px!important;margin-right:4px!important;vertical-align:middle!important;cursor:pointer!important;pointer-events:auto!important}`,
        `.${TW_SWATCH_CLASS.radius}::before{content:"\\200B";display:inline-block!important;width:12px!important;height:12px!important;border:1.5px solid #fbbf24!important;background:rgba(251,191,36,0.25)!important;border-radius:4px!important;margin-right:4px!important;vertical-align:middle!important;cursor:pointer!important;pointer-events:auto!important}`,
        `.shape-scrub-num{border-bottom:2px dashed color-mix(in srgb, var(--accent) 85%, transparent)!important;cursor:ew-resize!important}`,
        `.shape-scrub-num:hover{border-bottom-style:solid!important;background:color-mix(in srgb, var(--accent) 12%, transparent)!important}`,
        `.shape-scrub-active,.shape-scrub-active *{cursor:ew-resize!important;user-select:none!important}`,
        `.shape-spacing-refactor-hit{background:color-mix(in srgb, var(--accent) 22%, transparent)!important}`,
    ].join("");
    document.head.appendChild(s);
}

function swatchKindFromTarget(target: EventTarget | null): TailwindControlKind | null {
    if (!(target instanceof Element)) return null;
    if (target.closest(`.${TW_SWATCH_CLASS.flex}`)) return "flex";
    if (target.closest(`.${TW_SWATCH_CLASS.gap}`)) return "gap";
    if (target.closest(`.${TW_SWATCH_CLASS.pad}`)) return "padding";
    if (target.closest(`.${TW_SWATCH_CLASS.radius}`)) return "radius";
    return null;
}

function scheduleIdleWork(work: () => void) {
    if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(() => work(), { timeout: 500 });
    } else {
        setTimeout(work, 0);
    }
}

/** Fixed popup below the image URL token — anchored to the editor, not the cursor. */
function ImageHoverCard({
    detail,
    editor,
    projectPath,
    onDismiss,
}: {
    detail: ImageHoverDetail;
    editor: EditorAnchor | null;
    projectPath: string | null;
    onDismiss: () => void;
}) {
    const rootRef = React.useRef<HTMLDivElement>(null);
    const openedAtRef = React.useRef(0);
    const candidateIndexRef = React.useRef(0);
    const [status, setStatus] = React.useState<"loading" | "loaded" | "error">("loading");
    const [src, setSrc] = React.useState(detail.displaySrc);
    const [position, setPosition] = React.useState({ x: 0, y: 0 });

    const CARD_W = 240;
    const CARD_H = 180;

    const resolveAnchor = React.useCallback(() => {
        if (!editor) return { x: 16, y: 16 };
        const coords = editor.getScrolledVisiblePosition({
            lineNumber: detail.lineNumber,
            column: detail.column,
        });
        const editorDom = editor.getDomNode();
        if (!coords || !editorDom) return { x: 16, y: 16 };
        const rect = editorDom.getBoundingClientRect();
        return { x: rect.left + coords.left, y: rect.top + coords.top + coords.height };
    }, [editor, detail.lineNumber, detail.column]);

    const clampPosition = React.useCallback((anchor: { x: number; y: number }) => {
        const pad = 8;
        const gap = 10;
        let left = anchor.x;
        let top = anchor.y + gap;
        if (left + CARD_W > window.innerWidth - pad) left = window.innerWidth - CARD_W - pad;
        left = Math.max(pad, left);
        if (top + CARD_H > window.innerHeight - pad) top = anchor.y - CARD_H - gap;
        top = Math.max(pad, top);
        return { x: left, y: top };
    }, []);

    React.useLayoutEffect(() => {
        setPosition(clampPosition(resolveAnchor()));
    }, [clampPosition, resolveAnchor]);

    React.useEffect(() => {
        if (!editor) return;
        const update = () => setPosition(clampPosition(resolveAnchor()));
        const scrollSub = editor.onDidScrollChange(update);
        const layoutSub = editor.onDidLayoutChange(update);
        window.addEventListener("resize", update);
        return () => {
            scrollSub.dispose();
            layoutSub.dispose();
            window.removeEventListener("resize", update);
        };
    }, [editor, clampPosition, resolveAnchor]);

    React.useEffect(() => {
        openedAtRef.current = performance.now();
        candidateIndexRef.current = 0;
        setSrc(detail.displaySrc);
        setStatus("loading");
    }, [detail.displaySrc, detail.rawUrl, detail.filePath]);

    const dismiss = React.useCallback(() => {
        window.dispatchEvent(new CustomEvent("shape-image-hover-reset"));
        onDismiss();
    }, [onDismiss]);

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") dismiss();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [dismiss]);

    React.useEffect(() => {
        const handlePointerDown = (e: MouseEvent) => {
            if (performance.now() - openedAtRef.current < 120) return;
            const target = e.target;
            if (!(target instanceof Node)) return;
            if (rootRef.current?.contains(target)) return;
            dismiss();
        };
        document.addEventListener("mousedown", handlePointerDown, true);
        return () => document.removeEventListener("mousedown", handlePointerDown, true);
    }, [dismiss]);

    const setInteracting = React.useCallback((active: boolean) => {
        window.dispatchEvent(new CustomEvent("shape-image-hover-interacting", { detail: active }));
    }, []);

    const handleOpenImage = React.useCallback(() => {
        void (async () => {
            try {
                const candidates = resolveLocalImagePathCandidates(detail.rawUrl, detail.filePath, projectPath);
                const localPath = candidates[candidateIndexRef.current];
                if (localPath) {
                    const name = localPath.split(/[\\/]/).pop() || localPath;
                    await commands.openFile(localPath, name);
                } else if (/^https?:\/\//i.test(detail.rawUrl)) {
                    await commands.openUrlExternal(detail.rawUrl);
                }
            } catch (err) {
                console.error("Failed to open image:", err);
            }
            dismiss();
        })();
    }, [detail.rawUrl, detail.filePath, projectPath, dismiss]);

    const handleImageError = React.useCallback(() => {
        const candidates = resolveLocalImagePathCandidates(detail.rawUrl, detail.filePath, projectPath);
        const nextIndex = candidateIndexRef.current + 1;
        if (nextIndex < candidates.length) {
            candidateIndexRef.current = nextIndex;
            setSrc(resolveImageDisplaySrc(detail.rawUrl, detail.filePath, projectPath, nextIndex));
            setStatus("loading");
            return;
        }
        setStatus("error");
    }, [detail.rawUrl, detail.filePath, projectPath]);

    return (
        <Tooltip content={detail.tooltip} side="bottom" delayDuration={200} className="z-[10000]">
            <div
                ref={rootRef}
                className="fixed z-9999 overflow-hidden rounded-lg border border-border bg-panel shadow-lg cursor-pointer select-none"
                style={{ left: position.x, top: position.y, width: CARD_W, pointerEvents: "auto" }}
                onMouseEnter={() => setInteracting(true)}
                onMouseLeave={() => setInteracting(false)}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleOpenImage();
                }}
            >
                {status !== "error" && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={src}
                        alt=""
                        className={cn(
                            "block w-full object-contain transition-opacity duration-150 pointer-events-none",
                            status === "loaded" ? "opacity-100" : "opacity-0 absolute",
                        )}
                        style={{ maxHeight: CARD_H }}
                        onLoad={() => setStatus("loaded")}
                        onError={handleImageError}
                        draggable={false}
                    />
                )}
                {status === "loading" && (
                    <div className="flex items-center justify-center text-text-muted" style={{ height: CARD_H }}>
                        <svg width={24} height={24} viewBox="0 0 24 24" fill="currentColor" opacity={0.25}>
                            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                        </svg>
                    </div>
                )}
                {status === "error" && (
                    <div className="flex flex-col items-center justify-center gap-1 text-text-muted text-xs p-3" style={{ height: 56 }}>
                        <span className="opacity-60">Could not load image</span>
                        <span className="truncate max-w-full opacity-50 font-mono">{detail.rawUrl}</span>
                    </div>
                )}
            </div>
        </Tooltip>
    );
}

function detectPackageManager(pkg: Record<string, unknown>): PackageManager {
    const pmField = pkg.packageManager as string | undefined;
    if (pmField?.startsWith("yarn")) return "yarn";
    if (pmField?.startsWith("pnpm")) return "pnpm";
    if (pmField?.startsWith("bun")) return "bun";
    return "npm";
}

function runScriptCommand(pm: PackageManager, script: string): string {
    switch (pm) {
        case "yarn": return `yarn ${script}`;
        case "pnpm": return `pnpm run ${script}`;
        case "bun": return `bun run ${script}`;
        default: return `npm run ${script}`;
    }
}

function runPackageScript(scriptName: string, pm: PackageManager) {
    const cmd = runScriptCommand(pm, scriptName);
    window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
    window.dispatchEvent(new CustomEvent("shape-terminal-run", { detail: { command: cmd } }));
}

/** Run a Monaco action only if it is registered — never trigger missing ids (throws). */
function runRegisteredEditorAction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor: { getAction: (id: string) => { run: () => unknown; isSupported?: () => boolean } | null },
    id: string,
): boolean {
    const act = editor.getAction(id);
    if (!act) return false;
    if (typeof act.isSupported === "function" && !act.isSupported()) return false;
    void act.run();
    return true;
}

interface CodeEditorViewProps {
    path: string;
    group?: EditorGroupId;
    content: string;
    setContent: (c: string) => void;
    savedContentRef: React.MutableRefObject<string>;
    isDirtyRef: React.MutableRefObject<boolean>;
    bufferVersionRef: React.MutableRefObject<number>;
    isFirstLoadRef: React.MutableRefObject<boolean>;
    projectPath: string | null;
    frameworks: ProjectFrameworks | null;
    monacoReady: boolean;
    diffState: { original: string; replacement: string; path: string } | null;
}

export const CodeEditorView = memo(function CodeEditorView({
    path,
    group = "left",
    content,
    setContent,
    savedContentRef,
    isDirtyRef,
    bufferVersionRef,
    isFirstLoadRef,
    projectPath,
    frameworks,
    monacoReady,
    diffState
}: CodeEditorViewProps) {
    const canShowDiff = !!diffState && diffState.original !== diffState.replacement;
    const [reviewDiffMounted, setReviewDiffMounted] = useState(canShowDiff);
    const settings = useSettings();
    const monacoTheme = shapeMonacoThemeFromColorTheme(settings.appearance?.colorTheme);

    useEffect(() => {
        if (canShowDiff) {
            setReviewDiffMounted(true);
            return;
        }
        if (!reviewDiffMounted) return;
        const timer = window.setTimeout(() => setReviewDiffMounted(false), 300);
        return () => window.clearTimeout(timer);
    }, [canShowDiff, reviewDiffMounted]);

    const { splitEnabled, focusedGroup } = useEditorSplit();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorRef = useRef<any>(null);
    const saveFileRef = useRef<(() => Promise<void>) | null>(null);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monacoRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [editorTracker, setEditorTracker] = useState<{ editor: any, monaco: any } | null>(null);
    const [contextTailwindToken, setContextTailwindToken] = useState<string | null>(null);
    const [contextSpacingScale, setContextSpacingScale] = useState<string | null>(null);
    const [projectColorVars, setProjectColorVars] = useState<CssVariable[]>(() => getCachedProjectColorVariables());
    const [editorLayoutWidth, setEditorLayoutWidth] = useState(800);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spacingRefactorDecorationsRef = useRef<any>(null);

    // Seed CSS variables from the project's globals CSS on disk so the
    // Variables tab works without the user having opened the file first.
    useEffect(() => {
        if (!projectPath) return;
        let cancelled = false;
        void ensureGlobalsCssLoaded(projectPath).then(() => {
            if (!cancelled) setProjectColorVars(getCachedProjectColorVariables());
        });
        return () => { cancelled = true; };
    }, [projectPath]);

    useEffect(() => {
        if (!canShowDiff && editorRef.current && monacoRef.current) {
            setEditorTracker({ editor: editorRef.current, monaco: monacoRef.current });
        }
    }, [canShowDiff]);

    useEslint({
        monaco: editorTracker?.monaco ?? null,
        editor: editorTracker?.editor ?? null,
        path,
        projectPath,
        content,
    });

    useDesignDiagnostics({
        monaco: editorTracker?.monaco ?? null,
        editor: editorTracker?.editor ?? null,
        path,
        content,
    });

    const isPackageJson = path.toLowerCase().endsWith("package.json");
    const { packageScripts, packageManager } = useMemo(() => {
        if (!isPackageJson) {
            return { packageScripts: {} as Record<string, string>, packageManager: "npm" as PackageManager };
        }
        try {
            const pkg = JSON.parse(content) as { scripts?: Record<string, string> };
            return {
                packageScripts: pkg.scripts || {},
                packageManager: detectPackageManager(pkg as Record<string, unknown>),
            };
        } catch {
            return { packageScripts: {} as Record<string, string>, packageManager: "npm" as PackageManager };
        }
    }, [isPackageJson, content]);

    useEffect(() => {
        if (!editorTracker?.monaco) return;
        defineShapeMonacoThemes(editorTracker.monaco);
    }, [editorTracker]);

    // Seed CSS variable completions registry when opening a CSS file
    useEffect(() => {
        const cssExt = /\.(css|scss|less)$/i.test(path);
        if (!cssExt || !content) return;
        if (isGlobalCssFile(path)) {
            setCachedGlobalsCssContent(content);
        }
        registerCssVariables(path, parseCssVariables(content));
    }, [path, content]);

    // Image hover card state
    const [imageHover, setImageHover] = useState<ImageHoverDetail | null>(null);

    useEffect(() => {
        // Default to true when the setting hasn't been persisted yet
        if (getSettings().editor?.imagePreview === false) return;
        const handle = (e: Event) => {
            const detail = (e as CustomEvent<ImageHoverDetail | null>).detail;
            setImageHover(detail ?? null);
        };
        window.addEventListener("shape-image-hover", handle);
        return () => window.removeEventListener("shape-image-hover", handle);
    }, []);

    // Color picker state
    const [colorPicker, setColorPicker] = useState<{
        color: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        range: any;
        anchor: PickerAnchor;
    } | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colorDecorationsRef = useRef<any>(null);

    // Bezier picker state
    const [bezierPicker, setBezierPicker] = useState<{
        value: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        range: any;
    } | null>(null);
    const bezierPickerWidgetRef = useRef<{ widget: { getId: () => string; getDomNode: () => HTMLElement; getPosition: () => { position: { lineNumber: number; column: number }; preference: number[] } }; root: ReturnType<typeof createRoot> } | null>(null);
    const bezierPickerDataRef = useRef<{ value: string; range: { getStartPosition: () => { lineNumber: number; column: number } } } | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bezierDecorationsRef = useRef<any>(null);

    // Layout inline control state
    const [layoutControl, setLayoutControl] = useState<{
        kind: TailwindControlKind;
        lineNumber: number;
        column: number;
        ctx: ClassContext;
        tokenValues: string[];
        fallbackAnchor: PickerAnchor;
    } | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layoutDecorationsRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrubDecorationsRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pathRef = useRef(path);
    const projectPathRef = useRef(projectPath);
    const injectedStyleIdsRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        pathRef.current = path;
    }, [path]);

    useEffect(() => {
        return () => {
            injectedStyleIdsRef.current.forEach((id) => {
                document.getElementById(id)?.remove();
            });
            injectedStyleIdsRef.current.clear();
        };
    }, []);
    useEffect(() => {
        projectPathRef.current = projectPath;
    }, [projectPath]);

    const getLanguage = (p: string) => getMonacoLanguage(p);

    const emitEditorStatus = useCallback(() => {
        const editor = editorRef.current;
        if (!editor) return;

        const model = editor.getModel();
        const position = editor.getPosition();
        const tabSize = model?.getOptions().tabSize ?? 4;
        const eol = model?.getEOL() === "\r\n" ? "CRLF" : "LF";
        const language = model?.getLanguageId?.() || getLanguage(pathRef.current);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__shapeActivePath = pathRef.current;
        window.dispatchEvent(new CustomEvent("shape-editor-status", {
            detail: {
                line: position?.lineNumber ?? 1,
                column: position?.column ?? 1,
                spaces: Number(tabSize) || 4,
                insertSpaces: model?.getOptions().insertSpaces ?? true,
                eol,
                language,
            }
        }));
    }, []);

    // Feeds the `@selection` chat mention: chat reads the last snapshot when the
    // user's message contains `@selection`, so this only needs to stay current,
    // not be persisted or throttled.
    const emitSelectionSnapshot = useCallback(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const path = pathRef.current;
        if (!path || path.startsWith("diff:")) {
            window.dispatchEvent(new CustomEvent("shape-editor-selection", { detail: null }));
            return;
        }
        const model = editor.getModel();
        const selection = editor.getSelection();
        if (!model || !selection || selection.isEmpty()) {
            window.dispatchEvent(new CustomEvent("shape-editor-selection", { detail: null }));
            return;
        }
        const text = model.getValueInRange(selection);
        if (!text.trim()) {
            window.dispatchEvent(new CustomEvent("shape-editor-selection", { detail: null }));
            return;
        }
        window.dispatchEvent(new CustomEvent("shape-editor-selection", {
            detail: {
                path,
                startLine: selection.startLineNumber,
                endLine: selection.endLineNumber,
                text,
            },
        }));
    }, []);

    // A tab switch changes the active selection context even when the cursor
    // never moves in the new file (or there is no selection there at all), so
    // re-derive/clear the snapshot whenever the active path changes.
    useEffect(() => {
        emitSelectionSnapshot();
    }, [path, emitSelectionSnapshot]);

    const handleEditorAction = useCallback((action: string, payload?: Record<string, unknown>) => {
        const editor = editorRef.current;
        if (!editor) return;

        try {
            editor.focus();
            switch (action) {
                case "undo": editor.trigger("source", "undo", null); break;
                case "redo": editor.trigger("source", "redo", null); break;
                case "cut": editor.focus(); document.execCommand('cut'); break;
                case "copy": editor.focus(); document.execCommand('copy'); break;
                case "paste": editor.focus(); document.execCommand('paste'); break;
                case "selectAll": {
                    const model = editor.getModel();
                    if (model) editor.setSelection(model.getFullModelRange());
                    break;
                }
            case "find": {
                    const act = editor.getAction("editor.action.startFindAction");
                    if (act) act.run();
                    break;
                }
                case "findReplace": {
                    const act = editor.getAction("editor.action.startFindReplaceAction");
                    if (act) act.run();
                    break;
                }
                case "toggleWordWrap": {
                    const currentWrap = editor.getRawOptions().wordWrap;
                    editor.updateOptions({ wordWrap: currentWrap === "on" ? "off" : "on" });
                    emitEditorStatus();
                    break;
                }
                case "toggleMinimap": {
                    const settings = getSettings();
                    updateSettingSection("editor", { minimap: !settings.editor.minimap });
                    break;
                }
                case "goToLine": {
                    window.dispatchEvent(new CustomEvent("shape-command-palette", {
                        detail: { mode: "goto_line", placeholder: "Line : Column" },
                    }));
                    break;
                }
                case "jumpToPosition": {
                    const line = Math.max(1, Number(payload?.line ?? 1));
                    const column = Math.max(1, Number(payload?.column ?? 1));
                    editor.setPosition({ lineNumber: line, column });
                    editor.revealLineInCenter(line);
                    editor.focus();
                    break;
                }
                case "goToSymbolInEditor": {
                    import("@/features/editor/lsp/document-symbols").then(({ openDocumentSymbolsPalette }) => {
                        openDocumentSymbolsPalette();
                    });
                    break;
                }
                case "goToSymbolInWorkspace": {
                    import("@/features/editor/lsp/workspace-symbols").then(({ openWorkspaceSymbolsPalette }) => {
                        openWorkspaceSymbolsPalette();
                    });
                    break;
                }
                case "goToReferences": {
                    const act = editor.getAction("editor.action.goToReferences");
                    if (act) act.run();
                    break;
                }
                case "goToBracket": {
                    const act = editor.getAction("editor.action.jumpToBracket");
                    if (act) act.run();
                    break;
                }
                case "inlineEdit": {
                    const model = editor.getModel();
                    const selection = editor.getSelection();
                    if (!model || !selection || selection.isEmpty() || !path || path.startsWith("diff:")) break;
                    const selectedText = model.getValueInRange(selection);
                    const coords = editor.getScrolledVisiblePosition({
                        lineNumber: selection.startLineNumber,
                        column: selection.startColumn,
                    });
                    const dom = editor.getDomNode();
                    if (!coords || !dom) break;
                    const rect = dom.getBoundingClientRect();
                    window.dispatchEvent(
                        new CustomEvent("shape-inline-edit", {
                            detail: {
                                top: rect.top + coords.top + coords.height + 8,
                                left: Math.max(8, rect.left + coords.left),
                                width: 360,
                                filePath: path,
                                selection: selectedText,
                                startLine: selection.startLineNumber,
                                endLine: selection.endLineNumber,
                                startColumn: selection.startColumn,
                                endColumn: selection.endColumn,
                            },
                        }),
                    );
                    break;
                }
                case "changeLanguage": {
                    import("./language-picker").then(({ openLanguageModePicker }) => {
                        openLanguageModePicker(pathRef.current, editor.getModel()?.getLanguageId?.());
                    });
                    break;
                }
                case "setLanguage": {
                    const lang = String(payload?.value ?? "");
                    const model = editor.getModel();
                    const monaco = monacoRef.current;
                    if (model && lang && monaco?.editor?.setModelLanguage) {
                        monaco.editor.setModelLanguage(model, lang);
                        emitEditorStatus();
                    }
                    break;
                }
                case "nextMarker": {
                    const act = editor.getAction("editor.action.marker.next");
                    if (act) act.run();
                    break;
                }
                case "prevMarker": {
                    const act = editor.getAction("editor.action.marker.prev");
                    if (act) act.run();
                    break;
                }
                case "setTabSize": {
                    const value = Number(payload?.value ?? 4);
                    editor.getModel()?.updateOptions({ tabSize: value });
                    updateSettingSection("editor", { tabSize: value });
                    emitEditorStatus();
                    break;
                }
                case "setInsertSpaces": {
                    const insertSpaces = Boolean(payload?.value ?? true);
                    editor.getModel()?.updateOptions({ insertSpaces });
                    updateSettingSection("editor", { insertSpaces });
                    emitEditorStatus();
                    break;
                }
                case "setEol": {
                    const eol = payload?.value === "CRLF" ? monacoRef.current?.editor?.EndOfLineSequence?.CRLF : monacoRef.current?.editor?.EndOfLineSequence?.LF;
                    const model = editor.getModel();
                    if (model && eol !== undefined) {
                        model.setEOL(eol);
                        emitEditorStatus();
                    }
                    break;
                }
                case "format": {
                    const act = editor.getAction("editor.action.formatDocument");
                    if (act) act.run();
                    break;
                }
                case "organizeImports":
                    runRegisteredEditorAction(editor, "editor.action.organizeImports");
                    break;
                case "extractFunction":
                    runRegisteredEditorAction(editor, "editor.action.extractFunction");
                    break;
                case "extractConstant":
                    runRegisteredEditorAction(editor, "editor.action.extractConstant");
                    break;
                case "definition":
                    runRegisteredEditorAction(editor, "editor.action.revealDefinition");
                    break;
                case "declaration":
                    runRegisteredEditorAction(editor, "editor.action.revealDeclaration");
                    break;
                case "typeDefinition":
                    runRegisteredEditorAction(editor, "editor.action.goToTypeDefinition");
                    break;
                case "implementation":
                    runRegisteredEditorAction(editor, "editor.action.goToImplementation");
                    break;
                case "peekDefinition":
                    runRegisteredEditorAction(editor, "editor.action.peekDefinition");
                    break;
                case "peekDeclaration":
                    runRegisteredEditorAction(editor, "editor.action.peekDeclaration");
                    break;
                case "peekTypeDefinition":
                    runRegisteredEditorAction(editor, "editor.action.peekTypeDefinition");
                    break;
                case "peekImplementation":
                    runRegisteredEditorAction(editor, "editor.action.peekImplementation");
                    break;
                case "rename":
                    runRegisteredEditorAction(editor, "editor.action.rename");
                    break;
                case "changeAll":
                    runRegisteredEditorAction(editor, "editor.action.changeAll");
                    break;
                case "commandPalette": {
                    window.dispatchEvent(new CustomEvent("shape-command-palette"));
                    break;
                }
                case "back": {
                    editor.trigger("shape", "cursorUndo", null);
                    break;
                }
                case "forward": {
                    editor.trigger("shape", "cursorRedo", null);
                    break;
                }
                case "save": {
                    void commands.saveFile(pathRef.current, editor.getValue());
                    break;
                }
                case "saveAll": {
                    window.dispatchEvent(new Event("save-all-request"));
                    break;
                }
                default: {
                    const monacoAction = action.startsWith("editor.") ? action : `editor.action.${action}`;
                    if (
                        !runRegisteredEditorAction(editor, monacoAction) &&
                        !runRegisteredEditorAction(editor, action)
                    ) {
                        // Missing actions (e.g. extract* without a TS refactor provider) — no-op.
                    }
                    break;
                }
            }
        } catch (e) {
            console.error("Editor action failed:", e);
            notify.error("Editor Error", `Action "${action}" failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [emitEditorStatus]);

    const captureContextToken = useCallback(() => {
        const editor = editorRef.current;
        if (!editor) {
            setContextTailwindToken(null);
            setContextSpacingScale(null);
            return;
        }
        const model = editor.getModel();
        const position = editor.getPosition();
        if (!model || !position) {
            setContextTailwindToken(null);
            setContextSpacingScale(null);
            return;
        }
        const line = model.getLineContent(position.lineNumber);
        const token = findTailwindTokenAtColumn(line, position.column);
        setContextTailwindToken(token && getTailwindDocsUrl(token) ? token : null);
        const offset = model.getOffsetAt(position);
        const hit = findDesignPropertyAtOffset(model.getValue(), offset);
        setContextSpacingScale(
            hit?.kind === "spacing-scale" ? model.getValue().slice(hit.start, hit.end) : null,
        );
    }, []);

    const runSpacingScaleRefactor = useCallback(() => {
        if (getSettings()?.spacingRefactor?.enable === false) return;
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco || !contextSpacingScale) return;
        const model = editor.getModel();
        if (!model) return;
        const fromScale = contextSpacingScale;
        const toScale = window.prompt(
            `Replace all spacing scale “${fromScale}” in this file with:`,
            fromScale,
        );
        if (toScale == null || toScale === fromScale || !/^\d+(\.\d+)?$/.test(toScale.trim())) {
            if (toScale != null && toScale !== fromScale) {
                notify.warn("Spacing refactor", "Enter a Tailwind scale number (e.g. 4 or 2.5).");
            }
            return;
        }
        const text = model.getValue();
        const matches = planSpacingScaleRefactor(text, fromScale, toScale.trim());
        if (matches.length === 0) {
            notify.info("Spacing refactor", `No scale “${fromScale}” values found.`);
            return;
        }
        // Highlight matches briefly, then apply.
        injectTwSwatchStyles();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const decs: any[] = matches.map((m) => {
            const start = model.getPositionAt(m.start);
            const end = model.getPositionAt(m.end);
            return {
                range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
                options: {
                    inlineClassName: "shape-spacing-refactor-hit",
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                },
            };
        });
        if (!spacingRefactorDecorationsRef.current) {
            spacingRefactorDecorationsRef.current = editor.createDecorationsCollection();
        }
        spacingRefactorDecorationsRef.current.set(decs);
        window.setTimeout(() => {
            const next = applySpacingScaleRefactor(model.getValue(), matches);
            const fullRange = model.getFullModelRange();
            editor.executeEdits("spacing-refactor", [{
                range: fullRange,
                text: next,
                forceMoveMarkers: true,
            }]);
            spacingRefactorDecorationsRef.current?.set([]);
            notify.success("Spacing refactor", `Updated ${matches.length} value${matches.length === 1 ? "" : "s"}.`);
        }, 280);
    }, [contextSpacingScale]);

    useEffect(() => {
        const handleCssVariableUpdate = (e: Event) => {
            const detail = (e as CustomEvent<{ path: string; name: string; value: string }>).detail;
            if (!detail || detail.path !== pathRef.current || !editorRef.current) return;
            const editor = editorRef.current;
            const model = editor.getModel();
            if (!model) return;
            const current = model.getValue();
            const next = updateCssVariableInContent(current, detail.name, detail.value);
            if (next === current) return;
            editor.executeEdits("css-variable", [{
                range: model.getFullModelRange(),
                text: next,
                forceMoveMarkers: true,
            }]);
            setContent(next);
        };
        window.addEventListener("shape-css-variable-update", handleCssVariableUpdate as EventListener);
        return () => window.removeEventListener("shape-css-variable-update", handleCssVariableUpdate as EventListener);
    }, [setContent]);

    useEffect(() => {
        const handleMarkdownApply = (e: Event) => {
            const detail = (e as CustomEvent<{ path: string; content: string }>).detail;
            if (!detail || detail.path !== pathRef.current || !editorRef.current) return;
            const editor = editorRef.current;
            const model = editor.getModel();
            if (!model) return;
            if (model.getValue() === detail.content) return;
            editor.executeEdits("markdown-preview", [{
                range: model.getFullModelRange(),
                text: detail.content,
                forceMoveMarkers: true,
            }]);
            setContent(detail.content);
        };
        window.addEventListener("shape-markdown-apply-content", handleMarkdownApply as EventListener);
        return () => window.removeEventListener("shape-markdown-apply-content", handleMarkdownApply as EventListener);
    }, [setContent]);

    useEffect(() => {
        const handleCssVariableRename = (e: Event) => {
            const detail = (e as CustomEvent<{ path: string; oldName: string; newName: string }>).detail;
            if (!detail || detail.path !== pathRef.current || !editorRef.current) return;
            const editor = editorRef.current;
            const model = editor.getModel();
            if (!model) return;
            const current = model.getValue();
            const next = renameCssVariableInContent(current, detail.oldName, detail.newName);
            if (next === current) return;
            editor.executeEdits("css-variable-rename", [{
                range: model.getFullModelRange(),
                text: next,
                forceMoveMarkers: true,
            }]);
            setContent(next);
        };
        window.addEventListener("shape-css-variable-rename", handleCssVariableRename as EventListener);
        return () => window.removeEventListener("shape-css-variable-rename", handleCssVariableRename as EventListener);
    }, [setContent]);

    // LSP Integration — keyed by LSP server language (not Monaco lang).
    // javascript/typescript share one "typescript" language client; using the
    // Monaco id caused reconnect storms and "command already exists" failures.
    const lspConnectionKeyRef = useRef<string>("");
    const tsdkWarnedRef = useRef(false);
    const prevPackageRootRef = useRef<string | null>(null);
    const [trustEpoch, setTrustEpoch] = useState(0);
    const [lspEpoch, setLspEpoch] = useState(0);

    useEffect(() => {
        const onTrusted = () => {
            lspConnectionKeyRef.current = "";
            setTrustEpoch((n) => n + 1);
        };
        window.addEventListener("shape-workspace-trusted", onTrusted);
        return () => window.removeEventListener("shape-workspace-trusted", onTrusted);
    }, []);

    useEffect(() => {
        if (!monacoReady || !projectPath || !isWorkspaceTrusted(projectPath)) return;

        let cancelled = false;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const lang = getMonacoLanguage(path);

        const connectLsp = async () => {
            const packageRoot = await resolvePackageRootForFile(projectPath, path);
            if (cancelled) return;

            // Warm services; if vscode-api cannot attach, skip without error toasts.
            await LspClientManager.warmupServices();
            if (cancelled) return;
            if (!LspClientManager.isLanguageServiceAvailable()) return;

            const availableServers = getLspServersForProject(frameworks || {
                hasReact: true, hasTypescript: true, hasNextjs: true,
                hasVue: false, hasSvelte: false, hasTailwind: true, hasAngular: false,
                dependencies: {}, devDependencies: {}
            });

            const server = availableServers.find(s => s.documentSelector.includes(lang));
            if (!server) return;
            if (!isLspLanguageEnabled(server.language)) return;

            // Key by server language + package root (NOT monaco language).
            const connectionKey = `${packageRoot}:${server.language}`;
            if (lspConnectionKeyRef.current === connectionKey) return;

            // Workspace package root changed — tear down previous clients first.
            const prevRoot = prevPackageRootRef.current;
            if (prevRoot && prevRoot !== packageRoot) {
                lspConnectionKeyRef.current = "";
                await LspClientManager.disposeAll();
                try {
                    await commands.lspStopAll();
                } catch {
                    /* ignore */
                }
            }
            prevPackageRootRef.current = packageRoot;
            if (cancelled) return;

            try {
                const typescriptTsdk = server.language === "typescript"
                    ? await commands.resolveTypescriptTsdk(packageRoot)
                    : null;
                if (cancelled) return;

                if (server.language === "typescript" && !typescriptTsdk) {
                    if (!tsdkWarnedRef.current) {
                        console.warn("[LSP] TypeScript language service skipped: no TypeScript SDK found.");
                        tsdkWarnedRef.current = true;
                    }
                    return;
                }

                const launch = await resolveLspLaunch(
                    server.language,
                    packageRoot,
                    { command: server.command, args: server.args },
                    commands.readFile,
                );
                if (cancelled) return;

                const tsVersion = server.language === "typescript"
                    ? (typescriptTsdk
                        ? await (async () => {
                            try {
                                const pkgPath = typescriptTsdk.replace(/[/\\]lib[/\\]?$/, "") + "/package.json";
                                const pkgJson = await commands.readFile(pkgPath);
                                return JSON.parse(pkgJson).version as string | undefined;
                            } catch { return null; }
                        })()
                        : await readTypescriptVersion(packageRoot, commands.readFile))
                    : null;
                if (cancelled) return;

                if (tsVersion) {
                    window.dispatchEvent(new CustomEvent("shape-typescript-version", { detail: String(tsVersion) }));
                }

                await commands.lspStart(
                    server.language,
                    launch.command,
                    launch.args,
                    packageRoot,
                    launch.isolateNpx ?? launch.command === "npx",
                );
                if (cancelled) return;

                await LspClientManager.getClient({
                    language: server.language,
                    documentSelector: server.documentSelector,
                    workspacePath: packageRoot,
                    typescriptTsdk,
                    typescriptFallbackPath: typescriptTsdk,
                });
                if (cancelled) return;

                lspConnectionKeyRef.current = connectionKey;
            } catch (err) {
                if (!isBenignLspError(err)) {
                    console.error("LSP connection failed:", err);
                }
            }
            // Intentionally do NOT stop the language server on effect cleanup.
            // Tab/framework/trust flicker used to cancel mid-handshake and call
            // lspStop while MonacoLanguageClient was still writing initialize,
            // which produced "No LSP running" / Writer unknown forever.
        };

        // Debounce rapid tab/project switches so we don't race dispose vs start.
        debounceTimer = setTimeout(() => {
            void connectLsp();
        }, 250);

        return () => {
            cancelled = true;
            if (debounceTimer) clearTimeout(debounceTimer);
        };
    }, [monacoReady, projectPath, path, frameworks, trustEpoch, lspEpoch]);

    useEffect(() => {
        const handleSettingsChange = () => {
            lspConnectionKeyRef.current = "";
            prevPackageRootRef.current = null;
            void (async () => {
                await LspClientManager.disposeAll();
                try {
                    await commands.lspStopAll();
                } catch {
                    /* ignore */
                }
                // Reconnect so Python / other servers pick up new settings
                // (e.g. interpreter path) without requiring a tab restart.
                setLspEpoch((n) => n + 1);
            })();
        };
        window.addEventListener("shape-settings-changed", handleSettingsChange);
        return () => window.removeEventListener("shape-settings-changed", handleSettingsChange);
    }, []);

    // Color picker — rendered via portal (see JSX below)
    useEffect(() => {
        if (!colorPicker) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setColorPicker(null);
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [colorPicker]);

    // Bezier picker content widget projection
    useEffect(() => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!monaco || !editor) return;

        if (!bezierPicker) {
            if (bezierPickerWidgetRef.current) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    editor.removeContentWidget(bezierPickerWidgetRef.current.widget as any);
                    const rootToUnmount = bezierPickerWidgetRef.current.root;
                    setTimeout(() => rootToUnmount.unmount(), 0);
                } catch { /* noop */ }
                bezierPickerWidgetRef.current = null;
            }
            bezierPickerDataRef.current = null;
            return;
        }

        bezierPickerDataRef.current = bezierPicker;

        if (!bezierPickerWidgetRef.current) {
            const container = document.createElement("div");
            container.className = "shape-bezier-picker-widget";
            container.style.zIndex = "50";
            container.addEventListener("mousedown", (e) => e.stopPropagation());
            container.addEventListener("click", (e) => e.stopPropagation());
            const widget = {
                getId: () => "shape-bezier-picker-widget",
                getDomNode: () => container,
                getPosition: () => {
                    const data = bezierPickerDataRef.current;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if (!data?.range) return null as any;
                    const pos = data.range.getStartPosition();
                    return { position: pos, preference: [monaco.editor.ContentWidgetPositionPreference.BELOW] };
                },
            };
            const root = createRoot(container);
            const widgetTyped = widget as { getId: () => string; getDomNode: () => HTMLElement; getPosition: () => { position: { lineNumber: number; column: number }; preference: number[] } };
            bezierPickerWidgetRef.current = { widget: widgetTyped, root };
            editor.addContentWidget(widgetTyped);
        }

        if (bezierPickerWidgetRef.current) {
            bezierPickerWidgetRef.current.root.render(
                React.createElement(BezierPicker, {
                    value: bezierPicker.value,
                    onChange: (newValue: string) => {
                        if (!editorRef.current || !bezierPickerDataRef.current) return;
                        const range = bezierPickerDataRef.current.range;
                        editorRef.current.executeEdits("bezier-picker", [{ range, text: newValue, forceMoveMarkers: true }]);
                        const startPos = range.getStartPosition();
                        const newRange = new monacoRef.current.Range(startPos.lineNumber, startPos.column, startPos.lineNumber, startPos.column + newValue.length);
                        bezierPickerDataRef.current = { ...bezierPickerDataRef.current, value: newValue, range: newRange };
                        setBezierPicker({ value: newValue, range: newRange });
                    },
                    onClose: () => setBezierPicker(null)
                })
            );
            editor.layoutContentWidget(bezierPickerWidgetRef.current.widget);
        }
    }, [bezierPicker]);

    useEffect(() => {
        if (!bezierPicker) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setBezierPicker(null);
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [bezierPicker]);

    useEffect(() => {
        const handleSave = async () => {
            if (editorRef.current) {
                try {
                    const settings = getSettings();
                    const monaco = monacoRef.current;
                    if (settings.eslint.enable && settings.eslint.fixOnSave && projectPath && monaco) {
                        await applyEslintFixOnSave({
                            monaco,
                            editor: editorRef.current,
                            path: pathRef.current,
                            projectPath,
                        });
                    }
                    if (settings.editor.formatOnSave) {
                        const formatAct = editorRef.current.getAction("editor.action.formatDocument");
                        if (formatAct) await formatAct.run();
                    }
                    let currentContent = editorRef.current.getValue();
                    if (settings.editor.trimTrailingWhitespace) {
                        currentContent = currentContent.replace(/[ \t]+$/gm, "");
                    }
                    if (settings.editor.insertFinalNewline && currentContent.length > 0 && !currentContent.endsWith("\n")) {
                        currentContent += "\n";
                    }
                    await commands.saveFile(pathRef.current, currentContent);
                    savedContentRef.current = currentContent;
                    if (isDirtyRef.current) {
                        commands.markFileDirty(pathRef.current, false);
                        isDirtyRef.current = false;
                    }
                    void import("@/lib/dirty-buffers").then(({ clearDirtyBuffer }) => {
                        clearDirtyBuffer(pathRef.current);
                    });
                } catch (e) {
                    console.error("Failed to save:", e);
                    notify.error("Save Error", `Failed to save file: ${e instanceof Error ? e.message : String(e)}`, {
                        code: 4000,
                    });
                }
            }
        };

        saveFileRef.current = handleSave;

        const unlistenPromise = listen("save-request", handleSave);
        window.addEventListener("save-request", handleSave);

        return () => {
            saveFileRef.current = null;
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            window.removeEventListener("save-request", handleSave as EventListener);
            unlistenPromise.then(unlisten => {
                if (typeof unlisten === 'function') {
                    try {
                        // Tauri v1/v2 unlisten might be undefined internally causing TypeError, just mock call or silence
                        unlisten();
                    } catch {
                        // silently ignore
                    }
                }
            }).catch(() => { });
        };
    }, [path, isDirtyRef, savedContentRef, projectPath]);

    useEffect(() => {
        const applySettings = () => {
            const editor = editorRef.current;
            const monaco = monacoRef.current;
            if (editor) {
                editor.updateOptions(getMonacoOptionsFromSettings());
                monaco?.editor?.remeasureFonts?.();
            }
        };
        window.addEventListener("shape-settings-changed", applySettings);
        return () => window.removeEventListener("shape-settings-changed", applySettings);
    }, []);

    useEffect(() => {
        const handleEditorJump = (event: Event) => {
            const custom = event as CustomEvent<{ path: string; line: number; column?: number; endLine?: number; endColumn?: number }>;
            const detail = custom.detail;
            if (!detail || detail.path !== pathRef.current) return;
            const editor = editorRef.current;
            if (!editor) return;

            const targetLine = Math.max(1, detail.line || 1);
            const targetColumn = Math.max(1, detail.column || 1);

            if (detail.endLine && detail.endColumn) {
                const range = { startLineNumber: targetLine, startColumn: targetColumn, endLineNumber: detail.endLine, endColumn: detail.endColumn };
                editor.setSelection(range);
                editor.revealRangeInCenter(range);
            } else {
                editor.setPosition({ lineNumber: targetLine, column: targetColumn });
                editor.revealLineInCenter(targetLine);
            }
            editor.focus();
        };

        window.addEventListener("shape-editor-jump", handleEditorJump as EventListener);

        const handleInlineEditApply = (e: Event) => {
            const editor = editorRef.current;
            const model = editor?.getModel();
            const detail = (e as CustomEvent<{
                filePath: string;
                replacement: string;
                startLine: number;
                endLine: number;
                startColumn: number;
                endColumn: number;
            }>).detail;
            if (!editor || !model || !detail || detail.filePath !== path) return;
            editor.executeEdits("inline-edit", [{
                range: {
                    startLineNumber: detail.startLine,
                    startColumn: detail.startColumn,
                    endLineNumber: detail.endLine,
                    endColumn: detail.endColumn,
                },
                text: detail.replacement,
            }]);
            editor.focus();
        };
        window.addEventListener("shape-inline-edit-apply", handleInlineEditApply as EventListener);

        const handleSearchRequest = (e: Event) => {
            const editor = editorRef.current;
            const model = editor?.getModel();
            if (!editor || !model) return;

            const custom = e as CustomEvent<{ query: string, caseSensitive: boolean, wholeWord: boolean, isRegex: boolean }>;
            const { query, caseSensitive, wholeWord, isRegex } = custom.detail;

            if (!query) {
                window.dispatchEvent(new CustomEvent("shape-editor-search-results", { detail: [] }));
                return;
            }

            const matches = model.findMatches(query, false, isRegex, caseSensitive, wholeWord, false);
            window.dispatchEvent(new CustomEvent("shape-editor-search-results", {
                detail: matches.map((m: { range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } }) => ({
                    range: m.range,
                    content: model.getLineContent(m.range.startLineNumber)
                }))
            }));
        };
        window.addEventListener("shape-editor-search-request", handleSearchRequest as EventListener);

        const handleGlobalAction = (e: Event) => {
            const editor = editorRef.current;
            if (!editor) return;

            const monacoEditors = monacoRef.current?.editor?.getEditors?.() ?? [];
            const focused = monacoEditors.find((ed: { hasTextFocus: () => boolean; hasWidgetFocus: () => boolean }) => ed.hasTextFocus() || ed.hasWidgetFocus());

            if (focused) {
                if (focused !== editor) return;
            } else if (splitEnabled) {
                if (group !== focusedGroup) return;
            } else if (group !== "left") {
                return;
            }

            const custom = e as CustomEvent<{ action: string; value?: unknown }>;
            if (custom.detail?.action) {
                handleEditorAction(custom.detail.action, custom.detail as Record<string, unknown>);
            }
        };
        window.addEventListener("shape-editor-action", handleGlobalAction as EventListener);

        const handleCustomFind = (e: Event) => {
            const editor = editorRef.current;
            const model = editor?.getModel();
            if (!editor || !model) return;

            const custom = e as CustomEvent<{ query: string, caseSensitive: boolean, wholeWord: boolean, isRegex: boolean, backward: boolean }>;
            const { query, caseSensitive, wholeWord, isRegex, backward } = custom.detail;

            if (!query) return;

            let pos = editor.getPosition();
            let match = null;

            if (backward) {
                const sel = editor.getSelection();
                if (sel && !sel.isEmpty()) {
                    pos = sel.getStartPosition();
                }
                match = model.findPreviousMatch(query, pos, isRegex, caseSensitive, wholeWord, false);
            } else {
                const sel = editor.getSelection();
                if (sel && !sel.isEmpty()) {
                    pos = sel.getEndPosition();
                }
                match = model.findNextMatch(query, pos, isRegex, caseSensitive, wholeWord, false);
            }

            if (match) {
                editor.setSelection(match.range);
                editor.revealRangeInCenter(match.range);
                editor.focus();
            } else {
                // Wrap around
                const topPos = backward ? model.getFullModelRange().getEndPosition() : { lineNumber: 1, column: 1 };
                match = backward
                    ? model.findPreviousMatch(query, topPos, isRegex, caseSensitive, wholeWord, false)
                    : model.findNextMatch(query, topPos, isRegex, caseSensitive, wholeWord, false);

                if (match) {
                    editor.setSelection(match.range);
                    editor.revealRangeInCenter(match.range);
                    editor.focus();
                } else {
                    notify.info("Find", "No matches found.");
                }
            }
        };
        window.addEventListener("shape-editor-find-custom", handleCustomFind as EventListener);

        const handleFocusSearch = () => {
            const ed = editorRef.current;
            if (!ed) return;
            const act = ed.getAction("editor.action.startFindAction");
            if (act) act.run();
        };
        window.addEventListener("shape-focus-search", handleFocusSearch);

        const unlistenShortcut = listen<string>("editor-shortcut", (event) => {
            const shortcut = event.payload;
            if (shortcut === "F12") handleEditorAction("definition");
            else if (shortcut === "Alt+Shift+F") handleEditorAction("format");
        });

        return () => {
            window.removeEventListener("shape-editor-jump", handleEditorJump as EventListener);
            window.removeEventListener("shape-inline-edit-apply", handleInlineEditApply as EventListener);
            window.removeEventListener("shape-editor-search-request", handleSearchRequest as EventListener);
            window.removeEventListener("shape-editor-action", handleGlobalAction as EventListener);
            window.removeEventListener("shape-editor-find-custom", handleCustomFind as EventListener);
            window.removeEventListener("shape-focus-search", handleFocusSearch);
            unlistenShortcut.then((fn) => fn()).catch(() => { });
        };
    }, [handleEditorAction, group, splitEnabled, focusedGroup]);

    const applyTailwindControlEdit = useCallback((add: string[], remove: string[]) => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco || !layoutControl) return;
        const model = editor.getModel();
        if (!model) return;
        const ctx = layoutControl.ctx;
        const text = model.getValue();
        const body = sliceContextBody(text, ctx);
        const nextBody = applyClassEdit(body, { add, remove });
        const range = monacoRangeForContextInModel(model, ctx);
        editor.executeEdits("tailwind-layout", [{
            range: new monaco.Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn),
            text: nextBody,
            forceMoveMarkers: true,
        }]);
        const updatedCtx: ClassContext = {
            ...ctx,
            bodyEnd: ctx.bodyStart + nextBody.length,
        };
        const nextText = text.slice(0, ctx.bodyStart) + nextBody + text.slice(ctx.bodyEnd);
        const tokens = getTokensInContext(nextText, updatedCtx);
        const kindTok = tokens.find((t) => getTailwindControlKind(t.value) === layoutControl.kind);
        const anchorPos = model.getPositionAt(kindTok?.start ?? updatedCtx.bodyStart);
        setLayoutControl({
            ...layoutControl,
            lineNumber: anchorPos.lineNumber,
            column: anchorPos.column,
            ctx: updatedCtx,
            tokenValues: tokens.map((t) => t.value),
        });
    }, [layoutControl]);

    return (
        <ContextMenu onOpenChange={(open) => { if (open) captureContextToken(); else { setContextTailwindToken(null); setContextSpacingScale(null); } }}>
            <ContextMenuTrigger className="flex h-full min-h-0 w-full flex-1 flex-col outline-none focus:outline-none relative">
                <div className="shape-editor-surface relative min-h-0 flex-1">
                    <div className={cn("absolute inset-0", canShowDiff && "invisible pointer-events-none")} aria-hidden={canShowDiff}>
                    <Editor
                        height="100%"
                        path={path}
                        language={getLanguage(path)}
                        value={content}
                        loading={null}
                        theme={monacoTheme}
                        beforeMount={(monaco) => {
                            defineShapeMonacoThemes(monaco);
                            // Configure TypeScript defaults for better TSX support
                            monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                                jsx: monaco.languages.typescript.JsxEmit.React,
                                allowNonTsExtensions: true,
                                allowJs: true,
                                target: monaco.languages.typescript.ScriptTarget.Latest,
                            });
                            monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
                                jsx: monaco.languages.typescript.JsxEmit.React,
                                allowNonTsExtensions: true,
                                allowJs: true,
                                target: monaco.languages.typescript.ScriptTarget.Latest,
                            });
                        }}
                        onMount={(editor, monaco) => {
                            editorRef.current = editor;
                            monacoRef.current = monaco;
                            defineShapeMonacoThemes(monaco);
                            void import("@/lib/ui/monaco-theme").then(({ guardShapeMonacoTheme }) => {
                                guardShapeMonacoTheme(monaco);
                            });
                            const unregisterMonaco = registerMonacoEditor(editor);
                            editor.onDidDispose(() => unregisterMonaco());
                            bindMonacoNativeUiToShape(editor, monaco);
                            setEditorTracker({ editor, monaco });
                            ensureCssVarProviders(monaco);
                            ensureDesignCompletionProvider(monaco);
                            ensureDesignBlameHover(
                                monaco,
                                () => pathRef.current,
                                () => projectPathRef.current,
                            );
                            attachImageHoverToEditor(editor, () => projectPathRef.current);
                            if (getSettings().lsp.emmet) {
                                registerEmmetForMonaco(monaco);
                            }
                            const disposePrettier = registerPrettierFormatProvider({
                                monaco,
                                projectPath,
                            });
                            // Expose monaco globally for the command palette
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (window as any).monaco = monaco;
                            try {
                                updateDiagnosticsFromMonaco(monaco);

                                let diagTimeout: number | null = null;
                                const disposable = monaco.editor.onDidChangeMarkers(() => {
                                    if (diagTimeout) clearTimeout(diagTimeout);
                                    diagTimeout = setTimeout(() => {
                                        updateDiagnosticsFromMonaco(monaco);
                                        diagTimeout = null;
                                    }, 500) as unknown as number;
                                });

                                editor.onDidDispose(() => {
                                    if (diagTimeout) clearTimeout(diagTimeout);
                                    try { disposable.dispose(); } catch { /* noop */ }
                                });
                            } catch { /* noop */ }

                            editor.onDidChangeCursorPosition(() => {
                                emitEditorStatus();
                            });

                            editor.onDidChangeCursorSelection(() => {
                                emitSelectionSnapshot();
                            });

                            editor.onDidBlurEditorText(() => {
                                if (getSettings().editor.autoSave === "onFocusChange" && isDirtyRef.current) {
                                    void saveFileRef.current?.();
                                }
                            });

                            editor.onDidChangeModelContent(() => {
                                if (isFirstLoadRef.current) {
                                    isFirstLoadRef.current = false;
                                    return;
                                }

                                const newValue = editor.getValue();
                                setContent(newValue);

                                const isNowDirty = newValue !== savedContentRef.current;
                                if (isNowDirty && !isDirtyRef.current) {
                                    commands.markFileDirty(pathRef.current, true);
                                    isDirtyRef.current = true;
                                } else if (!isNowDirty && isDirtyRef.current) {
                                    commands.markFileDirty(pathRef.current, false);
                                    isDirtyRef.current = false;
                                }

                                const autoSave = getSettings().editor.autoSave;
                                if (isNowDirty && autoSave === "afterDelay") {
                                    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
                                    autoSaveTimerRef.current = setTimeout(() => {
                                        void saveFileRef.current?.();
                                    }, getSettings().editor.autoSaveDelay);
                                }

                                bufferVersionRef.current += 1;
                                const ext = pathRef.current.split(".").pop()?.toLowerCase() || "";
                                if (isGlobalCssFile(pathRef.current)) {
                                    setCachedGlobalsCssContent(newValue);
                                    setProjectColorVars(getCachedProjectColorVariables());
                                }
                                const cssExt = /\.(css|scss|less)$/i.test(pathRef.current);
                                if (cssExt) {
                                    registerCssVariables(pathRef.current, parseCssVariables(newValue));
                                }
                                window.dispatchEvent(
                                    new CustomEvent("shape-editor-buffer", {
                                        detail: {
                                            path: pathRef.current,
                                            content: newValue,
                                            extension: ext,
                                            version: bufferVersionRef.current,
                                        },
                                    })
                                );

                                emitEditorStatus();

                                // Throttle color decorations to save CPU
                                if (colorDecorationTimeoutRef.current) {
                                    clearTimeout(colorDecorationTimeoutRef.current);
                                }
                                colorDecorationTimeoutRef.current = setTimeout(() => {
                                    updateColorDecorations();
                                }, 150) as unknown as number;

                                // Throttle bezier decorations to save CPU
                                if (bezierDecorationTimeoutRef.current) {
                                    clearTimeout(bezierDecorationTimeoutRef.current);
                                }
                                bezierDecorationTimeoutRef.current = setTimeout(() => {
                                    updateBezierDecorations();
                                }, 150) as unknown as number;

                                // Throttle tailwind-control decorations
                                if (designDecorationTimeoutRef.current) {
                                    clearTimeout(designDecorationTimeoutRef.current);
                                }
                                designDecorationTimeoutRef.current = setTimeout(() => {
                                    updateLayoutDecorations();
                                    updateScrubDecorations();
                                }, 200) as unknown as number;
                            });

                            const colorDecorationTimeoutRef = { current: 0 };
                            const bezierDecorationTimeoutRef = { current: 0 };
                            const designDecorationTimeoutRef = { current: 0 };

                            const updateColorDecorations = () => {
                                const model = editor.getModel();
                                if (!model) return;
                                const text = model.getValue();
                                COLOR_REGEX.lastIndex = 0;
                                const decs: { range: InstanceType<typeof monaco.Range>; options: { before: { content: string; inlineClassName: string } } }[] = [];
                                let match;
                                while ((match = COLOR_REGEX.exec(text)) !== null) {
                                    const start = model.getPositionAt(match.index);
                                    const end = model.getPositionAt(match.index + match[0].length);
                                    if (end.column <= start.column) continue;
                                    const color = match[0];
                                    const line = model.getLineContent(start.lineNumber);
                                    const lineStartOffset = model.getOffsetAt({
                                        lineNumber: start.lineNumber,
                                        column: 1,
                                    });
                                    if (!isDecoratableColorToken(color, line, match.index - lineStartOffset)) {
                                        continue;
                                    }
                                    const swatchCss = resolveColorForSwatch(color);
                                    const safe = color.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 32);
                                    const cls = `shape-swatch-${safe}`;
                                    if (!document.getElementById(`style-${cls}`)) {
                                        const s = document.createElement("style");
                                        s.id = `style-${cls}`;
                                        s.textContent = `.${cls}::before{content:"\u200B";background:${swatchCss}!important;background-size:cover!important;display:inline-block!important;width:12px!important;height:12px!important;border-radius:2px!important;border:1px solid var(--border-subtle)!important;margin-right:4px!important;vertical-align:middle!important;cursor:pointer!important;pointer-events:auto}`;
                                        document.head.appendChild(s);
                                        injectedStyleIdsRef.current.add(`style-${cls}`);
                                    }
                                    decs.push({
                                        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
                                        options: { before: { content: "\u200B", inlineClassName: cls } },
                                    });
                                }
                                if (!colorDecorationsRef.current) {
                                    colorDecorationsRef.current = editor.createDecorationsCollection();
                                }
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                colorDecorationsRef.current.set(decs as any);
                            };

                            const updateBezierDecorations = () => {
                                const model = editor.getModel();
                                if (!model) return;
                                const text = model.getValue();
                                BEZIER_REGEX.lastIndex = 0;
                                const decs: { range: InstanceType<typeof monaco.Range>; options: { before: { content: string; inlineClassName: string } } }[] = [];
                                let match;
                                while ((match = BEZIER_REGEX.exec(text)) !== null) {
                                    const start = model.getPositionAt(match.index);
                                    const end = model.getPositionAt(match.index + match[0].length);
                                    if (end.column <= start.column) continue;
                                    const bezierStr = match[0];
                                    const safe = bezierStr.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 32);
                                    const cls = `shape-bezier-swatch-${safe}`;
                                    if (!document.getElementById(`style-${cls}`)) {
                                        const s = document.createElement("style");
                                        s.id = `style-${cls}`;
                                        const svgIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%233b82f6' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M2 14C4 14 12 2 14 2'/%3E%3C/svg%3E";
                                        s.textContent = `.${cls}::before{content:"\u200B";background-image:url("${svgIcon}")!important;background-size:contain!important;background-position:center!important;background-repeat:no-repeat!important;display:inline-block!important;width:12px!important;height:12px!important;border-radius:2px!important;border:1px solid var(--border-subtle)!important;margin-right:4px!important;vertical-align:middle!important;cursor:pointer!important;pointer-events:auto;background-color:rgba(59,130,246,0.15)!important}`;
                                        document.head.appendChild(s);
                                        injectedStyleIdsRef.current.add(`style-${cls}`);
                                    }
                                    decs.push({
                                        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
                                        options: { before: { content: "\u200B", inlineClassName: cls } },
                                    });
                                }
                                if (!bezierDecorationsRef.current) {
                                    bezierDecorationsRef.current = editor.createDecorationsCollection();
                                }
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                bezierDecorationsRef.current.set(decs as any);
                            };

                            // ── Layout decorations ───────────────────────────────────

                            const updateLayoutDecorations = () => {
                                if (getSettings()?.tailwindControls?.enable === false) return;
                                const model = editor.getModel();
                                if (!model) return;
                                const text = model.getValue();
                                injectTwSwatchStyles();
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const decs: any[] = [];
                                for (const ctx of findClassContexts(text)) {
                                    for (const tok of getTokensInContext(text, ctx)) {
                                        const kind = getTailwindControlKind(tok.value);
                                        if (!kind) continue;
                                        const swatchClass =
                                            kind === "flex"
                                                ? TW_SWATCH_CLASS.flex
                                                : kind === "gap"
                                                  ? TW_SWATCH_CLASS.gap
                                                  : kind === "radius"
                                                    ? TW_SWATCH_CLASS.radius
                                                    : TW_SWATCH_CLASS.pad;
                                        const start = model.getPositionAt(tok.start);
                                        const end = model.getPositionAt(tok.end);
                                        if (end.column <= start.column) continue;
                                        decs.push({
                                            range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
                                            options: { before: { content: "\u200B", inlineClassName: swatchClass } },
                                        });
                                    }
                                }
                                if (!layoutDecorationsRef.current) {
                                    layoutDecorationsRef.current = editor.createDecorationsCollection();
                                }
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                layoutDecorationsRef.current.set(decs as any);
                            };

                            const updateScrubDecorations = () => {
                                if (getSettings()?.tailwindControls?.enable === false) return;
                                if (getSettings()?.tailwindControls?.scrubDecorations === false) {
                                    scrubDecorationsRef.current?.set([]);
                                    return;
                                }
                                const model = editor.getModel();
                                if (!model) return;
                                injectTwSwatchStyles();
                                const text = model.getValue();
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const decs: any[] = [];
                                for (const hit of findAllDesignProperties(text)) {
                                    const start = model.getPositionAt(hit.start);
                                    const end = model.getPositionAt(hit.end);
                                    if (end.column <= start.column && end.lineNumber === start.lineNumber) continue;
                                    decs.push({
                                        range: new monaco.Range(
                                            start.lineNumber,
                                            start.column,
                                            end.lineNumber,
                                            end.column,
                                        ),
                                        options: {
                                            inlineClassName: "shape-scrub-num",
                                            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                                        },
                                    });
                                }
                                if (!scrubDecorationsRef.current) {
                                    scrubDecorationsRef.current = editor.createDecorationsCollection();
                                }
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                scrubDecorationsRef.current.set(decs as any);
                            };

                            scheduleIdleWork(() => {
                                updateColorDecorations();
                                updateBezierDecorations();
                                updateLayoutDecorations();
                                updateScrubDecorations();
                            });

                            editor.onDidChangeModel(() => {
                                scheduleIdleWork(() => {
                                    updateColorDecorations();
                                    updateBezierDecorations();
                                    updateLayoutDecorations();
                                    updateScrubDecorations();
                                });
                            });

                            const cleanupBlame = attachBlameProvider(
                                editor,
                                monaco,
                                () => pathRef.current,
                                () => projectPath,
                            );
                            const cleanupConflict = attachConflictResolver(editor, monaco);
                            const cleanupComments = attachCommentsProvider(
                                editor,
                                monaco,
                                () => pathRef.current,
                                () => projectPathRef.current,
                            );
                            editor.onDidDispose(() => {
                                cleanupBlame();
                                cleanupConflict();
                                cleanupComments();
                            });

                            COLOR_REGEX.lastIndex = 0;
                            BEZIER_REGEX.lastIndex = 0;
                            const container = editor.getContainerDomNode();
                            const handleColorInteraction = (e: MouseEvent) => {
                                if (!isSwatchTarget(e.target)) return;

                                const editorInstance = editorRef.current;
                                if (!editorInstance) return;
                                const target = editorInstance.getTargetAtClientPoint?.(e.clientX, e.clientY);
                                if (!target?.position) return;
                                const model = editorInstance.getModel();
                                if (!model) return;
                                const line = model.getLineContent(target.position.lineNumber) ?? "";
                                const hit = findColorTokenAtColumn(line, target.position.column);
                                if (!hit) return;

                                const startCol = hit.start + 1;
                                const endCol = hit.end + 1;

                                if (e.type === "mousedown") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.stopImmediatePropagation();
                                }
                                setColorPicker({
                                    color: hit.token,
                                    range: new monaco.Range(target.position.lineNumber, startCol, target.position.lineNumber, endCol),
                                    anchor: { x: e.clientX, y: e.clientY },
                                });
                            };

                            const handleBezierInteraction = (e: MouseEvent) => {
                                const targetEl = e.target;
                                if (!(targetEl instanceof Element)) return;
                                const isBezierSwatch = targetEl.closest('[class*="shape-bezier-swatch-"]');
                                if (!isBezierSwatch) return;

                                const editorInstance = editorRef.current;
                                if (!editorInstance) return;
                                const target = editorInstance.getTargetAtClientPoint?.(e.clientX, e.clientY);
                                if (!target?.position) return;
                                const model = editorInstance.getModel();
                                if (!model) return;
                                const line = model.getLineContent(target.position.lineNumber) ?? '';
                                BEZIER_REGEX.lastIndex = 0;
                                let match;
                                while ((match = BEZIER_REGEX.exec(line)) !== null) {
                                    const startCol = match.index + 1;
                                    const endCol = match.index + match[0].length + 1;
                                    const col = target.position!.column;
                                    if (col >= Math.max(1, startCol - 1) && col <= endCol) {
                                        if (e.type === "mousedown") {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            e.stopImmediatePropagation();
                                        }
                                        setBezierPicker({
                                            value: match[0],
                                            range: new monaco.Range(target.position!.lineNumber, startCol, target.position!.lineNumber, endCol),
                                        });
                                        return;
                                    }
                                }
                            };
                            const openTwControl = (
                                lineNum: number,
                                column: number,
                                fallbackAnchor: PickerAnchor,
                                preferredKind?: TailwindControlKind,
                                opts?: { silent?: boolean },
                            ) => {
                                const model = editor.getModel();
                                if (!model) {
                                    if (!opts?.silent) notify.warn("Layout", "Editor is not ready.");
                                    return;
                                }
                                const text = model.getValue();
                                const clickOffset = model.getOffsetAt({ lineNumber: lineNum, column });

                                const openPanel = (
                                    ctxHit: { ctx: ClassContext; tokenValues: string[] },
                                    kind: TailwindControlKind,
                                    tokenStart?: number,
                                ) => {
                                    const anchorOffset = tokenStart ?? ctxHit.ctx.bodyStart;
                                    const anchorPos = model.getPositionAt(anchorOffset);
                                    setLayoutControl({
                                        kind,
                                        lineNumber: anchorPos.lineNumber,
                                        column: anchorPos.column,
                                        ctx: ctxHit.ctx,
                                        tokenValues: ctxHit.tokenValues,
                                        fallbackAnchor,
                                    });
                                };

                                const ctxHit = getContextAtModelOffset(text, clickOffset);
                                if (ctxHit) {
                                    for (const tok of getTokensInContext(text, ctxHit.ctx)) {
                                        const kind = getTailwindControlKind(tok.value);
                                        if (!kind) continue;
                                        if (preferredKind && kind !== preferredKind) continue;
                                        if (clickOffset >= tok.start && clickOffset <= tok.end) {
                                            openPanel(ctxHit, kind, tok.start);
                                            return;
                                        }
                                    }
                                    if (preferredKind) {
                                        for (const tok of getTokensInContext(text, ctxHit.ctx)) {
                                            const kind = getTailwindControlKind(tok.value);
                                            if (kind === preferredKind) {
                                                openPanel(ctxHit, kind, tok.start);
                                                return;
                                            }
                                        }
                                    }
                                }

                                if (!opts?.silent) {
                                    notify.warn("Layout", "Click directly on a flex, gap, padding, or radius class token.");
                                }
                            };

                            const handleLayoutInteraction = (e: MouseEvent) => {
                                if (!isLayoutSwatchTarget(e.target)) return;

                                const editorInstance = editorRef.current;
                                if (!editorInstance) return;
                                const target = editorInstance.getTargetAtClientPoint?.(e.clientX, e.clientY);
                                if (!target?.position) {
                                    notify.warn("Layout", "Could not locate the class token under the cursor.");
                                    return;
                                }

                                if (e.type === "mousedown") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.stopImmediatePropagation();
                                }

                                openTwControl(
                                    target.position.lineNumber,
                                    target.position.column,
                                    { x: e.clientX, y: e.clientY },
                                    swatchKindFromTarget(e.target) ?? undefined,
                                );
                            };

                            container.addEventListener("mousedown", handleColorInteraction, { capture: true });
                            container.addEventListener("mousedown", handleBezierInteraction, { capture: true });
                            container.addEventListener("mousedown", handleLayoutInteraction, { capture: true });

                            // Alt + drag number scrubbing (surgical range replace).
                            type ScrubSession = {
                                hit: DesignSourceHit;
                                startX: number;
                                originText: string;
                                originValue: number;
                            };
                            let scrubSession: ScrubSession | null = null;
                            let lastScrubText = "";

                            const applyScrubEdit = (hit: DesignSourceHit, nextNumText: string) => {
                                if (nextNumText === lastScrubText) return;
                                lastScrubText = nextNumText;
                                const model = editor.getModel();
                                if (!model) return;
                                const start = model.getPositionAt(hit.start);
                                const end = model.getPositionAt(hit.end);
                                editor.executeEdits("design-scrub", [{
                                    range: new monaco.Range(
                                        start.lineNumber,
                                        start.column,
                                        end.lineNumber,
                                        end.column,
                                    ),
                                    text: nextNumText,
                                    forceMoveMarkers: true,
                                }]);
                                hit.end = hit.start + nextNumText.length;
                                hit.value = parseFloat(nextNumText) || hit.value;
                            };

                            const handleScrubDown = (e: MouseEvent) => {
                                if (getSettings()?.tailwindControls?.numberScrubbing === false) return;
                                // Drag: Alt+click, or direct drag on scrub underline.
                                const onScrub =
                                    e.target instanceof Element &&
                                    e.target.closest(".shape-scrub-num");
                                if (!e.altKey && !onScrub) return;
                                if (e.button !== 0) return;
                                if (isSwatchTarget(e.target) || isLayoutSwatchTarget(e.target)) return;
                                if (getSettings()?.tailwindControls?.enable === false) return;
                                const target = editor.getTargetAtClientPoint?.(e.clientX, e.clientY);
                                if (!target?.position) return;
                                const model = editor.getModel();
                                if (!model) return;
                                const offset = model.getOffsetAt(target.position);
                                const hit = findDesignPropertyAtOffset(model.getValue(), offset);
                                if (!hit) return;
                                e.preventDefault();
                                e.stopPropagation();
                                const originText = model.getValue().slice(hit.start, hit.end);
                                lastScrubText = originText;
                                scrubSession = {
                                    hit: { ...hit },
                                    startX: e.clientX,
                                    originText,
                                    originValue: hit.value,
                                };
                                document.body.classList.add("shape-scrub-active");
                            };

                            const handleScrubMove = (e: MouseEvent) => {
                                if (!scrubSession) return;
                                e.preventDefault();
                                const delta = e.clientX - scrubSession.startX;
                                const next = scrubValueFromDelta(
                                    { ...scrubSession.hit, value: scrubSession.originValue },
                                    delta,
                                );
                                applyScrubEdit(scrubSession.hit, next);
                                // Keep inspector panel in sync / following the token.
                                if (getSettings()?.tailwindControls?.cursorBindPanel !== false) {
                                    const kind = scrubSession.hit.controlKind;
                                    if (kind) {
                                        const pos = editor.getModel()?.getPositionAt(scrubSession.hit.start);
                                        if (pos) {
                                            const coords = editor.getScrolledVisiblePosition(pos);
                                            const rect = editor.getContainerDomNode()?.getBoundingClientRect();
                                            openTwControl(
                                                pos.lineNumber,
                                                pos.column,
                                                {
                                                    x: (rect?.left ?? 0) + (coords?.left ?? 0),
                                                    y: (rect?.top ?? 0) + (coords?.top ?? 0) + (coords?.height ?? 18),
                                                },
                                                kind,
                                                { silent: true },
                                            );
                                        }
                                    }
                                }
                            };

                            const handleScrubWheel = (e: WheelEvent) => {
                                if (getSettings()?.tailwindControls?.numberScrubbing === false) return;
                                if (getSettings()?.tailwindControls?.enable === false) return;
                                const target = editor.getTargetAtClientPoint?.(e.clientX, e.clientY);
                                if (!target?.position) return;
                                const model = editor.getModel();
                                if (!model) return;
                                const offset = model.getOffsetAt(target.position);
                                const hit = findDesignPropertyAtOffset(model.getValue(), offset);
                                if (!hit) return;
                                // Only when hovering the number (or Alt held).
                                const el = e.target;
                                const onScrub = el instanceof Element && el.closest(".shape-scrub-num");
                                if (!onScrub && !e.altKey) return;
                                e.preventDefault();
                                e.stopPropagation();
                                const next = scrubValueFromDelta(hit, e.deltaY < 0 ? 1 : -1, { wheel: true });
                                applyScrubEdit(hit, next);
                                scheduleIdleWork(() => {
                                    updateLayoutDecorations();
                                    updateScrubDecorations();
                                });
                            };

                            const endScrub = () => {
                                if (!scrubSession) return;
                                scrubSession = null;
                                lastScrubText = "";
                                document.body.classList.remove("shape-scrub-active");
                                scheduleIdleWork(() => {
                                    updateLayoutDecorations();
                                    updateScrubDecorations();
                                });
                            };

                            container.addEventListener("mousedown", handleScrubDown, { capture: true });
                            container.addEventListener("wheel", handleScrubWheel, { capture: true, passive: false });
                            window.addEventListener("mousemove", handleScrubMove);
                            window.addEventListener("mouseup", endScrub);

                            // Cursor → inspector: reuse existing panels (silent).
                            let cursorBindTimer = 0;
                            const cursorDisposable = editor.onDidChangeCursorPosition(() => {
                                if (getSettings()?.tailwindControls?.enable === false) return;
                                if (getSettings()?.tailwindControls?.cursorBindPanel === false) return;
                                if (scrubSession) return;
                                if (cursorBindTimer) window.clearTimeout(cursorBindTimer);
                                cursorBindTimer = window.setTimeout(() => {
                                    const model = editor.getModel();
                                    if (!model) return;
                                    const pos = editor.getPosition();
                                    if (!pos) return;
                                    const offset = model.getOffsetAt(pos);
                                    const kind = controlKindAtOffset(model.getValue(), offset);
                                    if (!kind) return;
                                    const coords = editor.getScrolledVisiblePosition(pos);
                                    const containerDom = editor.getContainerDomNode();
                                    const rect = containerDom?.getBoundingClientRect();
                                    const anchor = {
                                        x: (rect?.left ?? 0) + (coords?.left ?? 0),
                                        y: (rect?.top ?? 0) + (coords?.top ?? 0) + (coords?.height ?? 18),
                                    };
                                    openTwControl(pos.lineNumber, pos.column, anchor, kind, { silent: true });
                                }, 420) as unknown as number;
                            });

                            editor.onMouseDown((e) => {
                                const targetEl = e.event.browserEvent.target;
                                if (isSwatchTarget(targetEl)) return;
                                if (targetEl instanceof Element) {
                                    if (targetEl.closest(".shape-color-picker-widget") || targetEl.closest(".shape-bezier-picker-widget")) return;
                                    if (targetEl.closest('[class*="shape-bezier-swatch-"]')) return;
                                    if (targetEl.closest(".shape-layout-control")) return;
                                }
                                // Keep inspector open when clicking scrubbable numbers / tokens.
                                if (e.event.altKey) return;
                                setColorPicker(null);
                                setBezierPicker(null);
                                // Don't dismiss layout control on every click inside the token —
                                // only when clicking away from design tokens.
                                const model = editor.getModel();
                                const pos = e.target.position;
                                if (model && pos) {
                                    const kind = controlKindAtOffset(
                                        model.getValue(),
                                        model.getOffsetAt(pos),
                                    );
                                    if (kind) return;
                                }
                                setLayoutControl(null);
                            });

                            editor.onDidDispose(() => {
                                container.removeEventListener("mousedown", handleColorInteraction, { capture: true });
                                container.removeEventListener("mousedown", handleBezierInteraction, { capture: true });
                                container.removeEventListener("mousedown", handleLayoutInteraction, { capture: true });
                                container.removeEventListener("mousedown", handleScrubDown, { capture: true });
                                container.removeEventListener("wheel", handleScrubWheel, { capture: true } as EventListenerOptions);
                                window.removeEventListener("mousemove", handleScrubMove);
                                window.removeEventListener("mouseup", endScrub);
                                cursorDisposable.dispose();
                                if (cursorBindTimer) window.clearTimeout(cursorBindTimer);
                            });

                            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {
                                commands.closeFile(pathRef.current);
                            });

                            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
                                window.dispatchEvent(new Event("shape-focus-search"));
                            });

                            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE, () => {
                                window.dispatchEvent(new CustomEvent("shape-command-palette", {
                                    detail: { mode: "files", recent: true, placeholder: "Recent files..." },
                                }));
                            });

                            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                                window.dispatchEvent(new Event("save-request"));
                            });

                            editor.addCommand(monaco.KeyCode.F2, () => {
                                handleEditorAction("rename");
                            });

                            const handleActionsRequest = () => {
                                const supported = editor.getSupportedActions() || [];
                                const editorActions = supported.map((a: { id: string; label: string; run: () => void }) => ({
                                    id: a.id,
                                    label: a.label || a.id,
                                    shortcut: "",
                                    run: () => { editor.focus(); editor.trigger("command-palette", a.id, null); },
                                }));
                                window.dispatchEvent(
                                    new CustomEvent("shape-command-palette-actions-response", {
                                        detail: editorActions,
                                    })
                                );
                            };
                            window.addEventListener("shape-command-palette-actions-request", handleActionsRequest);

                            editor.onDidDispose(() => {
                                window.removeEventListener("shape-command-palette-actions-request", handleActionsRequest);
                                disposePrettier();
                            });

                            emitEditorStatus();

                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    try {
                                        editor.layout();
                                    } catch { /* noop */ }
                                });
                            });

                            const layoutContainer = editor.getContainerDomNode()?.parentElement;
                            if (layoutContainer) {
                                setEditorLayoutWidth(layoutContainer.getBoundingClientRect().width);
                            }
                            const layoutObserver = layoutContainer
                                ? new ResizeObserver(([entry]) => {
                                    setEditorLayoutWidth(entry.contentRect.width);
                                    requestAnimationFrame(() => {
                                        try {
                                            if (editorRef.current && typeof editorRef.current.layout === "function") {
                                                editorRef.current.layout();
                                            }
                                        } catch { /* noop */ }
                                    });
                                })
                                : null;
                            if (layoutContainer && layoutObserver) {
                                layoutObserver.observe(layoutContainer);
                            }
                            editor.onDidDispose(() => {
                                layoutObserver?.disconnect();
                            });

                            // Cross-file go to definition
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const editorService = (editor as any)._codeEditorService;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            if (editorService && !(editorService as any).__shapePatched) {
                                const originalOpen = editorService.openCodeEditor.bind(editorService);
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                editorService.openCodeEditor = async (input: any, source: any, sideBySide?: boolean) => {
                                    const result = await originalOpen(input, source, sideBySide);
                                    if (result !== null) return result;
                                    const resource = input?.resource ?? input?.[0]?.resource;
                                    if (!resource) return result;
                                    let targetPath = resource.path || resource.fsPath || String(resource);
                                    if (targetPath.startsWith("/") && targetPath.length >= 3 && targetPath[2] === ":") {
                                        targetPath = targetPath.slice(1);
                                    }
                                    targetPath = targetPath.replace(/\//g, "\\");
                                    const fileName = targetPath.split(/[\\/]/).pop() || targetPath;
                                    const line = input?.options?.selection?.startLineNumber ?? input?.selection?.startLineNumber ?? 1;
                                    const column = input?.options?.selection?.startColumn ?? input?.selection?.startColumn ?? 1;
                                    try {
                                        await commands.openFile(targetPath, fileName);
                                        window.dispatchEvent(new CustomEvent("shape-editor-jump", {
                                            detail: { path: targetPath, line, column },
                                        }));
                                    } catch { /* ignore */ }
                                    return null;
                                };
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                (editorService as any).__shapePatched = true;
                            }
                        }}
                        options={getMonacoEditorOptions({
                            ...getMonacoOptionsFromSettings(),
                            automaticLayout: true,
                            readOnly: false,
                            glyphMargin: true,
                            unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
                        })}
                    />
                    </div>
                    {reviewDiffMounted && diffState && (
                        <div className={cn(
                            "absolute inset-0 z-10 bg-panel",
                            !canShowDiff && "pointer-events-none opacity-0"
                        )}>
                            <DiffView
                                path={path}
                                originalContent={diffState.original}
                                content={diffState.replacement}
                                getLanguage={getLanguage}
                            />
                        </div>
                    )}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-64">
                {isPackageJson && Object.keys(packageScripts).length > 0 && (
                    <>
                        <ContextMenuSub>
                            <ContextMenuSubTrigger className="gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={getIconPath("package.json")} alt="" className="h-4 w-4 shrink-0" />
                                Run Script
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-56 max-h-64 overflow-y-auto custom-scrollbar">
                                {Object.keys(packageScripts).map((scriptName) => (
                                    <ContextMenuItem
                                        key={scriptName}
                                        onClick={() => runPackageScript(scriptName, packageManager)}
                                    >
                                        {scriptName}
                                    </ContextMenuItem>
                                ))}
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator />
                    </>
                )}
                <ContextMenuItem onClick={() => handleEditorAction("undo")}>
                    Undo
                    <ContextMenuShortcut>Ctrl+Z</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleEditorAction("redo")}>
                    Redo
                    <ContextMenuShortcut>Ctrl+Y</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />

                <ContextMenuItem onClick={() => handleEditorAction("definition")}>
                    Go to Definition
                    <ContextMenuShortcut>F12</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleEditorAction("declaration")}>
                    Go to Declaration
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleEditorAction("typeDefinition")}>
                    Go to Type Definition
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleEditorAction("implementation")}>
                    Go to Implementation
                    <ContextMenuShortcut>Ctrl+F12</ContextMenuShortcut>
                </ContextMenuItem>

                <ContextMenuSeparator />
                <ContextMenuSub>
                    <ContextMenuSubTrigger>Peek</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-56">
                        <ContextMenuItem onClick={() => handleEditorAction("peekDefinition")}>
                            Peek Definition
                            <ContextMenuShortcut>Alt+F12</ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleEditorAction("peekDeclaration")}>
                            Peek Declaration
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleEditorAction("peekTypeDefinition")}>
                            Peek Type Definition
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleEditorAction("peekImplementation")}>
                            Peek Implementation
                            <ContextMenuShortcut>Ctrl+Shift+F12</ContextMenuShortcut>
                        </ContextMenuItem>
                    </ContextMenuSubContent>
                </ContextMenuSub>

                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleEditorAction("rename")}>
                    Rename Symbol
                    <ContextMenuShortcut>F2</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleEditorAction("changeAll")}>
                    Change All Occurrences
                    <ContextMenuShortcut>Ctrl+F2</ContextMenuShortcut>
                </ContextMenuItem>

                <ContextMenuSeparator />
                <ContextMenuSub>
                    <ContextMenuSubTrigger>Refactor</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-56">
                        <ContextMenuItem onClick={() => handleEditorAction("organizeImports")}>
                            Organize Imports
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleEditorAction("extractFunction")}>
                            Extract Function
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleEditorAction("extractConstant")}>
                            Extract Constant
                        </ContextMenuItem>
                    </ContextMenuSubContent>
                </ContextMenuSub>

                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleEditorAction("format")}>
                    Format Document
                    <ContextMenuShortcut>Alt+Shift+F</ContextMenuShortcut>
                </ContextMenuItem>

                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleEditorAction("cut")}>
                    Cut
                    <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleEditorAction("copy")}>
                    Copy
                    <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleEditorAction("paste")}>
                    Paste
                    <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleEditorAction("selectAll")}>
                    Select All
                    <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleEditorAction("commandPalette")}>
                    Command Palette
                    <ContextMenuShortcut>Ctrl+Shift+P</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                {contextTailwindToken && getTailwindDocsUrl(contextTailwindToken) && (
                    <>
                        <ContextMenuItem
                            onClick={() => {
                                const url = getTailwindDocsUrl(contextTailwindToken);
                                if (url) void commands.openUrlExternal(url);
                            }}
                        >
                            Open Tailwind reference
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                    </>
                )}
                {contextSpacingScale && getSettings()?.spacingRefactor?.enable !== false && (
                    <>
                        <ContextMenuItem onClick={() => runSpacingScaleRefactor()}>
                            Refactor spacing scale “{contextSpacingScale}”…
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                    </>
                )}
                {!isPopoutPath() ? (
                    <ContextMenuItem onClick={() => window.dispatchEvent(new Event("shape-toggle-zen-mode"))}>
                        Zen Mode
                    </ContextMenuItem>
                ) : null}
            </ContextMenuContent>
            {editorTracker && (
                <AutocompleteOverlay editor={editorTracker.editor} monaco={editorTracker.monaco} />
            )}
            {colorPicker && editorTracker?.editor && (
                <ColorPickerPortal
                    anchor={colorPicker.anchor}
                    editor={editorTracker.editor}
                    range={colorPicker.range}
                    color={colorPicker.color}
                    layoutWidth={editorLayoutWidth}
                    onChange={(newColor) => {
                        const editor = editorRef.current;
                        const monaco = monacoRef.current;
                        if (!editor || !monaco || !colorPicker) return;
                        editor.executeEdits("color-picker", [{ range: colorPicker.range, text: newColor, forceMoveMarkers: true }]);
                        const startPos = colorPicker.range.getStartPosition();
                        const newRange = new monaco.Range(startPos.lineNumber, startPos.column, startPos.lineNumber, startPos.column + newColor.length);
                        setColorPicker({ color: newColor, range: newRange, anchor: colorPicker.anchor });
                    }}
                    onClose={() => setColorPicker(null)}
                />
            )}
            {imageHover && createPortal(
                <ImageHoverCard
                    detail={imageHover}
                    editor={editorRef.current}
                    projectPath={projectPath}
                    onDismiss={() => setImageHover(null)}
                />,
                document.body
            )}
            {layoutControl && (
                <TailwindControlPortal
                    className="shape-layout-control"
                    editor={editorRef.current}
                    lineNumber={layoutControl.lineNumber}
                    column={layoutControl.column}
                    fallbackAnchor={layoutControl.fallbackAnchor}
                    onClose={() => setLayoutControl(null)}
                >
                    {layoutControl.kind === "flex" ? (
                        <FlexPanel
                            currentClasses={layoutControl.tokenValues}
                            onApply={applyTailwindControlEdit}
                            onClose={() => setLayoutControl(null)}
                        />
                    ) : layoutControl.kind === "gap" ? (
                        <GapPanel
                            currentClasses={layoutControl.tokenValues}
                            onApply={applyTailwindControlEdit}
                            onClose={() => setLayoutControl(null)}
                        />
                    ) : layoutControl.kind === "radius" ? (
                        <RadiusPanel
                            currentClasses={layoutControl.tokenValues}
                            onApply={applyTailwindControlEdit}
                            onClose={() => setLayoutControl(null)}
                        />
                    ) : (
                        <PaddingPanel
                            currentClasses={layoutControl.tokenValues}
                            onApply={applyTailwindControlEdit}
                            onClose={() => setLayoutControl(null)}
                        />
                    )}
                </TailwindControlPortal>
            )}
        </ContextMenu>
    );
});

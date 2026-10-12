"use client";

import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
import { ArrowUp20Regular } from "@fluentui/react-icons/headless/svg/arrow-up";
import { Calendar20Regular } from "@fluentui/react-icons/headless/svg/calendar";
import { Chat20Filled } from "@fluentui/react-icons/headless/svg/chat";
import { Checkmark20Regular } from "@fluentui/react-icons/headless/svg/checkmark";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { CodeTextEdit20Filled, CodeTextEdit20Regular } from "@fluentui/react-icons/headless/svg/code-text-edit";
import { Color20Regular } from "@fluentui/react-icons/headless/svg/color";
import { Copy20Regular } from "@fluentui/react-icons/headless/svg/copy";
import { ChatMultiple20Filled, ChatMultiple20Regular } from "@fluentui/react-icons/headless/svg/chat-multiple";
import { CalendarMultiple24Filled, CalendarMultiple24Regular } from "@fluentui/react-icons/headless/svg/calendar-multiple";
import { ColorLine24Filled, ColorLine24Regular } from "@fluentui/react-icons/headless/svg/color-line";
import { Incognito24Filled } from "@fluentui/react-icons/headless/svg/incognito";
import { Document20Regular } from "@fluentui/react-icons/headless/svg/document";
import { DocumentText20Regular } from "@fluentui/react-icons/headless/svg/document-text";
import { Eye20Regular } from "@fluentui/react-icons/headless/svg/eye";
import { FolderAdd24Filled, FolderAdd24Regular } from "@fluentui/react-icons/headless/svg/folder-add";
import { Connected24Filled, Connected24Regular } from "@fluentui/react-icons/headless/svg/connected";
import { DocumentEdit24Filled, DocumentEdit24Regular } from "@fluentui/react-icons/headless/svg/document-edit";
import { MoviesAndTv24Filled, MoviesAndTv24Regular } from "@fluentui/react-icons/headless/svg/movies-and-tv";
import { Image20Regular } from "@fluentui/react-icons/headless/svg/image";




import React from "react";
import { Arc } from "loading-dev";
import { Icon } from "@/components/ui/icon";



import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { providerIcon } from "@/lib/ui/provider-icon";
import { MentionPicker } from "./mentions";
import { PendingEditsPanel } from "./edits";
import { WorkspaceBranchSwitch } from "@/features/agent/workspace/branch-switch";
import {
    ComposerTasksStrip,
    type ComposerTaskItem,
} from "./activity";
import { QueuedMessagesPanel, type QueuedMessage } from "./queue";
import { ComposerAttachments, isImageFile, isAudioFile, type ComposerAttachment } from "./attachments";
import { MediaLightbox } from "../blocks/lightbox";
import { formatMentionToken, mentionRanges, shortenMentionTokensInText } from "@/lib/chat/mentions";
import {
    SHAPE_CLIP_CODE,
    codeAttachmentFile,
    matchRememberedClip,
    pasteIsLarge,
    pastedTextFile,
    terminalAttachmentFile,
} from "@/features/chat/lib/shape-clip";
import type { BrowserPickedElement } from "@/lib/backend/types";
import { registerElementMention } from "@/lib/chat/element-mentions";
import { slashCommandRanges } from "@/lib/chat/workflows";
import { revealComposerCaret, syncComposerOverlayScroll } from "@/lib/chat/composer-scroll";
import { listSkills, subscribeSkills, type Skill } from "@/lib/chat/skills";
import { fetchPlugins, peekPluginsCache, type PluginRow } from "@/lib/plugins/api";
import { PluginLogo } from "@/components/ui/plugin-logo";
import { getVisibleModels, isApiModel, resolveChatModels, sanitizeEnabledModels, type ModelInfo } from "@/lib/settings/models";
import {
    getCatalogDefaultEnabledIds,
    getCatalogModels,
    getCatalogProviderOrder,
    isCatalogModelAllowed,
    useShapeCatalog,
} from "@/lib/catalog/store";
import { useSettings } from "@/lib/settings";
import { useShapeAuth } from "@/lib/cloud/store";
import { SearchInput } from "@/components/ui/search";
import { effortDisplayLabel, modelSupportsSuperThinking, type ReasoningEffort } from "./reasoning-effort";
import { ThinkingEffortControl } from "./thinking-bar";
export type { ReasoningEffort };

type ChatInputProps = {
    inputValue: string;
    isLoading: boolean;
    webSearch: string;
    uploadedFiles: ComposerAttachment[];
    onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onSendMessage: () => void;
    onStopMessage: () => void;
    setWebSearch: (s: string) => void;
    setUploadedFiles: React.Dispatch<React.SetStateAction<ComposerAttachment[]>>;
    addUploadedFiles: (files: File[], peaks?: number[][]) => void;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    selectedModel: string;
    setSelectedModel: (m: string) => void;
    selectedWorkerModels?: string[];
    setSelectedWorkerModels?: (models: string[]) => void;
    multiSelectModels?: boolean;
    hideModeSelect?: boolean;
    selectedMode: string;
    setSelectedMode: (m: string) => void;
    reasoningEffort: ReasoningEffort;
    setReasoningEffort: (e: ReasoningEffort) => void;
    pendingEdits?: { id: string; file: string; original: string; replacement: string; baseline?: string }[];
    onAcceptAllEdits?: () => void;
    onRejectAllEdits?: () => void;
    onAcceptEdit?: (id: string) => void;
    onRejectEdit?: (id: string) => void;
    taskItems?: ComposerTaskItem[];
    queuedMessages?: QueuedMessage[];
    onEditQueuedMessage?: (id: string) => void;
    onRemoveQueuedMessage?: (id: string) => void;
    onSendQueuedNow?: (id: string) => void;
    projectRuleFiles?: string[];
    onNewChat?: () => void;
    /** Tighter chrome for empty-chat centered layout */
    variant?: "default" | "empty";
};

function formatContextWindow(raw?: string): string {
    const t = (raw ?? "").trim();
    if (!t) return "";
    return t.replace(/([0-9.]+)\s*K\b/i, "$1k").replace(/([0-9.]+)\s*M\b/i, "$1m");
}

function contextWindowTokens(raw?: string): number | null {
    const t = (raw ?? "").trim();
    const m = t.match(/^([0-9.]+)\s*([KM])$/i);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return m[2].toUpperCase() === "M" ? Math.round(n * 1_000_000) : Math.round(n * 1000);
}

const ModelTooltip = ({
    model,
    effort,
}: {
    model: ModelInfo;
    effort: ReasoningEffort;
}) => {
    const isAuto = model.id === "auto" || model.id === "openrouter/auto";
    const ctx = formatContextWindow(model.contextWindow);
    const effortName = effortDisplayLabel(effort).toLowerCase();

    return (
        <div className="flex flex-col gap-1 min-w-[220px] max-w-[280px] p-3 select-none">
            <div className="text-sm] font-medium leading-tight text-text-primary">
                {isAuto ? "Auto" : model.name}
            </div>
            <p className="text-xs leading-snug text-text-secondary">
                {isAuto
                    ? "Picks a fast model for everyday work."
                    : model.description}
            </p>
            {ctx ? (
                <p className="mt-1 text-xs text-text-muted">{ctx} context window</p>
            ) : null}
            <p className="mt-0.5 text-xs italic text-text-muted">
                Version: {effortName} reasoning effort
            </p>
        </div>
    );
};

const ModelItem = ({
    model,
    isSelected,
    onSelect,
    effort,
    disabled = false,
    disabledReason,
}: {
    model: ModelInfo,
    isSelected: boolean,
    onSelect: (id: string) => void,
    effort: ReasoningEffort,
    disabled?: boolean,
    disabledReason?: string,
}) => {
    const unavailableTooltip =
        disabledReason ??
        "Direct model selection for this model is limited to paid plans. Upgrade to use.";

    return (
        <Tooltip
            side="right"
            align="start"
            sideOffset={6}
            delayDuration={200}
            className="p-0!"
            content={
                disabled ? (
                    <span className="text-xs text-text-muted px-1">{unavailableTooltip}</span>
                ) : (
                    <ModelTooltip model={model} effort={effort} />
                )
            }
        >
            <DropdownMenuItem
                onClick={(event) => {
                    if (disabled) {
                        event.preventDefault();
                        return;
                    }
                    onSelect(model.id);
                }}
                onKeyDown={(event) => {
                    if (disabled && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                    }
                }}
                aria-disabled={disabled || undefined}
                className={cn(
                    "flex items-center cursor-pointer w-full",
                    isSelected && "bg-panel-hover",
                    disabled && "opacity-40 cursor-not-allowed",
                )}
            >
                <div className="flex items-center gap-1.5 w-full">
                    {providerIcon(model.id, 16)}
                    <span className="flex-1 font-regular text-sm text-text-primary group-hover:text-text-primary transition-colors">
                        {model.name}
                    </span>
                    {isApiModel(model) ? (
                        <span className="shrink-0 text-sm font-normal text-text-muted">API</span>
                    ) : null}
                    {isSelected && <Icon icon={Checkmark20Regular} className="text-text-primary font-bold" />}
                </div>
            </DropdownMenuItem>
        </Tooltip>
    );
};

// Allowed file extensions for upload
const IMAGE_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'avif', 'heic', 'heif'
]);

const CODE_EXTENSIONS = new Set([
    'ts', 'tsx', 'js', 'jsx', 'rs', 'py', 'go', 'java', 'c', 'cpp', 'h', 'hpp',
    'css', 'scss', 'less', 'html', 'xml', 'svg', 'json', 'toml', 'yaml', 'yml',
    'md', 'mdx', 'sh', 'bat', 'ps1', 'rb', 'php', 'swift', 'kt', 'kts', 'dart',
    'lua', 'r', 'sql', 'graphql', 'gql', 'proto', 'dockerfile', 'makefile',
    'gitignore', 'env', 'ini', 'cfg', 'conf', 'txt', 'log', 'csv', 'lock'
]);

/** Binary assets the agent can write into the project (fonts, icons, etc.). */
const ASSET_EXTENSIONS = new Set([
    'ttf', 'otf', 'woff', 'woff2', 'eot',
    'ico', 'icns',
    'pdf',
]);

const VIDEO_EXTENSIONS = new Set([
    'mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v', 'wmv', 'flv', 'mpeg', 'mpg',
]);

function getFileExtension(name: string): string {
    const parts = name.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

function isCodeFile(file: File): boolean {
    return CODE_EXTENSIONS.has(getFileExtension(file.name));
}

function isAssetFile(file: File): boolean {
    return ASSET_EXTENSIONS.has(getFileExtension(file.name));
}

function isVideoFile(file: File): boolean {
    if (file.type.startsWith("video/")) return true;
    return VIDEO_EXTENSIONS.has(getFileExtension(file.name));
}

function isAllowedFile(file: File): boolean {
    if (isVideoFile(file)) return false;
    return isImageFile(file) || isCodeFile(file) || isAudioFile(file) || isAssetFile(file);
}

function ComposerContextHighlight({ text }: { text: string }) {
    return (
        <span className="relative">
            <span
                aria-hidden
                className="absolute inset-y-0 -inset-x-0.5 rounded-md bg-accent-text-bg"
            />
            <span className="relative text-accent-text">{text}</span>
        </span>
    );
}

const CHAT_MODES = [
    { id: "Code", icon: CodeTextEdit20Filled, color: "#3B82F6", bg: "rgba(59, 130, 246, 0.16)", description: "Build and edit files in the project" },
    { id: "Ask", icon: ChatMultiple20Filled, color: "#22C55E", bg: "rgba(34, 197, 94, 0.16)", description: "Answer questions without making changes" },
    { id: "Plan", icon: CalendarMultiple24Filled, color: "#F97316", bg: "rgba(249, 115, 22, 0.16)", description: "Create a plan before proceeding" },
    { id: "Visual", icon: ColorLine24Filled, color: "#F43F5E", bg: "rgba(244, 63, 94, 0.16)", description: "Design and iterate on the UI" },
    { id: "Review", icon: Incognito24Filled, color: "#A855F7", bg: "rgba(168, 85, 247, 0.16)", description: "Review code for bugs and edge cases" },
] as const;

const COMPOSER_HINTS = [
    "Ask a task. @ for files. / for a workflow.",
    "Escape stops the current turn.",
    "Queue a follow-up while Shape is working.",
    "Visual: ask to see a few button styles first",
    "Drop a screenshot to redesign",
    "Paste a stack trace to debug",
] as const;

function SwapText({
    value,
    className,
}: {
    value: string;
    className?: string;
}) {
    const wrapRef = React.useRef<HTMLSpanElement>(null);
    const measureNewRef = React.useRef<HTMLSpanElement>(null);
    const measureOldRef = React.useRef<HTMLSpanElement>(null);
    const [shown, setShown] = React.useState(value);
    const [leaving, setLeaving] = React.useState<string | null>(null);
    const [width, setWidth] = React.useState<number | null>(null);
    const [ready, setReady] = React.useState(false);
    const [clipping, setClipping] = React.useState(false);
    const shownRef = React.useRef(value);

    const fitWidth = React.useCallback(() => {
        const wrap = wrapRef.current;
        const measureNew = measureNewRef.current;
        if (!wrap || !measureNew) return;
        const wNew = measureNew.getBoundingClientRect().width;
        const natural = wNew;

        let constraint: HTMLElement | null = wrap.parentElement;
        let maxInner = Number.POSITIVE_INFINITY;
        while (constraint) {
            const cs = getComputedStyle(constraint);
            const maxW = parseFloat(cs.maxWidth);
            if (!Number.isNaN(maxW) && cs.maxWidth !== "none") {
                const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
                maxInner = Math.max(0, maxW - pad);
                break;
            }
            constraint = constraint.parentElement;
        }

        const parent = wrap.parentElement;
        let used = 0;
        if (parent && Number.isFinite(maxInner)) {
            const cs = getComputedStyle(parent);
            const gap = parseFloat(cs.columnGap || cs.gap) || 0;
            const others = Array.from(parent.children).filter((el) => el !== wrap);
            used =
                others.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) +
                gap * others.length;
        }

        const cap = Number.isFinite(maxInner) ? Math.max(0, maxInner - used) : Number.POSITIVE_INFINITY;
        setWidth(Math.max(0, Math.min(natural, cap)));
        requestAnimationFrame(() => {
            const el = wrapRef.current;
            if (!el) return;
            setClipping(el.scrollWidth > el.clientWidth + 1);
        });
    }, [leaving]);

    React.useLayoutEffect(() => {
        fitWidth();
        if (!ready) {
            requestAnimationFrame(() => setReady(true));
        }
    }, [value, shown, leaving, fitWidth, ready]);

    React.useEffect(() => {
        const parent = wrapRef.current?.parentElement;
        if (!parent) return;
        const ro = new ResizeObserver(() => fitWidth());
        ro.observe(parent);
        return () => ro.disconnect();
    }, [fitWidth]);

    React.useEffect(() => {
        if (value === shownRef.current) return;
        const from = shownRef.current;
        shownRef.current = value;
        setLeaving(from || null);
        setShown(value);
        const t = window.setTimeout(() => setLeaving(null), 400);
        return () => window.clearTimeout(t);
    }, [value]);

    return (
        <span
            ref={wrapRef}
            data-ready={ready ? "true" : "false"}
            data-fade={clipping ? "true" : "false"}
            className={cn("t-swap", className)}
            style={width != null ? { width } : undefined}
            onTransitionEnd={(event) => {
                if (event.propertyName === "width") setClipping(false);
            }}
        >
            <span ref={measureNewRef} className="t-swap__measure" aria-hidden>
                {value}
            </span>
            <span ref={measureOldRef} className="t-swap__measure" aria-hidden>
                {leaving ?? ""}
            </span>
            {leaving ? (
                <span className="t-swap__layer t-swap__layer--out" aria-hidden>
                    {leaving}
                </span>
            ) : null}
            {shown ? (
                <span className={cn("t-swap__layer", leaving && "t-swap__layer--in")}>{shown}</span>
            ) : null}
        </span>
    );
}

function RotatingComposerHint({ paused }: { paused: boolean }) {
    const [index, setIndex] = React.useState(0);
    const [phase, setPhase] = React.useState<"in" | "out" | "enter">("in");
    const indexRef = React.useRef(0);

    React.useEffect(() => {
        if (paused) {
            setPhase("in");
            return;
        }
        let exitTimer: ReturnType<typeof setTimeout> | undefined;
        let enterTimer: ReturnType<typeof setTimeout> | undefined;
        const hold = window.setInterval(() => {
            setPhase("out");
            exitTimer = setTimeout(() => {
                indexRef.current = (indexRef.current + 1) % COMPOSER_HINTS.length;
                setIndex(indexRef.current);
                setPhase("enter");
                enterTimer = setTimeout(() => setPhase("in"), 30);
            }, 320);
        }, 8000);
        return () => {
            window.clearInterval(hold);
            if (exitTimer) clearTimeout(exitTimer);
            if (enterTimer) clearTimeout(enterTimer);
        };
    }, [paused]);

    return (
        <div className="t-composer-hint pl-3" aria-hidden>
            <span className="text-sm text-text-muted" data-phase={phase}>
                {COMPOSER_HINTS[index]}
            </span>
        </div>
    );
}

function ModeMenu({
    selectedMode,
    setSelectedMode,
    disabled,
}: {
    selectedMode: string;
    setSelectedMode: (m: string) => void;
    disabled?: boolean;
}) {
    const selected = CHAT_MODES.find((m) => m.id === selectedMode) ?? CHAT_MODES[0];
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={disabled}>
                <Button
                    variant="ghost"
                    size="xs"
                    disabled={disabled}
                    className="h-8 bg-transparent px-2 font-medium hover:bg-transparent"
                    style={{ color: selected.color }}
                    aria-label={selected.id}
                >
                    <div className="flex items-center gap-1.5 text-sm">
                        <Icon icon={selected.icon} />
                        <SwapText value={selected.id} />
                    </div>
                </Button>
            </DropdownMenuTrigger >
            <DropdownMenuContent align="start" className="w-100">
                {CHAT_MODES.map((mode) => (
                    <DropdownMenuItem
                        key={mode.id}
                        onClick={() => setSelectedMode(mode.id)}
                        className="items-start gap-2.5 py-2"
                    >
                        <Icon
                            icon={mode.icon}
                            className="mt-0.5"
                            style={{ color: mode.color }}
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="text-sm text-text-primary">{mode.id}</span>
                            <span className="text-sm leading-snug text-text-muted">
                                {mode.description}
                            </span>
                        </span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}


export function ChatInput({
    inputValue,
    isLoading,
    uploadedFiles,
    onInputChange,
    onKeyDown,
    onSendMessage,
    onStopMessage,
    setUploadedFiles,
    addUploadedFiles,
    selectedModel,
    setSelectedModel,
    selectedWorkerModels = [],
    setSelectedWorkerModels,
    multiSelectModels = false,
    hideModeSelect = false,
    selectedMode,
    setSelectedMode,
    reasoningEffort,
    setReasoningEffort,
    pendingEdits = [],
    onAcceptAllEdits,
    onRejectAllEdits,
    onAcceptEdit,
    onRejectEdit,
    taskItems = [],
    queuedMessages = [],
    onEditQueuedMessage,
    onRemoveQueuedMessage,
    onSendQueuedNow,
    projectRuleFiles = [],
    onNewChat,
    variant = "default",
}: Omit<ChatInputProps, "webSearch" | "setWebSearch" | "handleFileUpload">) {

    const settings = useSettings();
    const shapeAuth = useShapeAuth();
    const { catalog } = useShapeCatalog();
    const allModels = resolveChatModels(getCatalogModels());
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const mentionOverlayRef = React.useRef<HTMLDivElement>(null);
    const composerBoxRef = React.useRef<HTMLDivElement>(null);
    const [mentionOpen, setMentionOpen] = React.useState(false);
    const [mentionQuery, setMentionQuery] = React.useState("");
    const [mentionCaret, setMentionCaret] = React.useState(0);
    const [slashOpen, setSlashOpen] = React.useState(false);
    const [slashQuery, setSlashQuery] = React.useState("");

    const handleInputChangeWithMentions = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const raw = e.target.value;
        const caretRaw = e.target.selectionStart ?? raw.length;
        const shortened = shortenMentionTokensInText(raw);
        const delta = raw.length - shortened.length;
        const caret = Math.max(0, caretRaw - (delta > 0 && caretRaw > shortened.length ? delta : 0));
        // If we collapsed a long path token, rewrite value + restore caret near the edit.
        if (shortened !== raw) {
            onInputChange({ target: { value: shortened } } as React.ChangeEvent<HTMLTextAreaElement>);
            requestAnimationFrame(() => {
                const el = textareaRef.current;
                if (!el) return;
                const pos = Math.min(caret, shortened.length);
                el.setSelectionRange(pos, pos);
            });
        } else {
            onInputChange(e);
        }
        const val = shortened;
        const caretNow = shortened !== raw ? Math.min(caret, shortened.length) : caretRaw;
        const before = val.slice(0, caretNow);
        // Allow hostnames / paths after @ (sites, files). Anchor menu at the `@`, not caret end.
        const atMatch = before.match(/@([\w./:-]*)$/);
        const slashMatch = before.match(/(?:^|\s)(\/[^\s]*)$/);
        if (atMatch) {
            const atStart = caretNow - atMatch[0].length;
            setMentionOpen(true);
            setMentionQuery(atMatch[1] ?? "");
            setMentionCaret(atStart);
            setSlashOpen(false);
            setSlashQuery("");
        } else if (slashMatch) {
            setSlashOpen(true);
            setSlashQuery((slashMatch[1] ?? "/").replace(/^\//, ""));
            setMentionOpen(false);
            setMentionQuery("");
        } else {
            setMentionOpen(false);
            setMentionQuery("");
            setSlashOpen(false);
            setSlashQuery("");
        }
    }, [onInputChange]);

    // Collapse any long path mentions already in the composer (e.g. pasted / leftover).
    React.useEffect(() => {
        const shortened = shortenMentionTokensInText(inputValue);
        if (shortened !== inputValue) {
            onInputChange({ target: { value: shortened } } as React.ChangeEvent<HTMLTextAreaElement>);
        }
    }, [inputValue, onInputChange]);

    const insertMention = React.useCallback((token: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const val = inputValue;
        const caret = textarea.selectionStart ?? val.length;
        const before = val.slice(0, caret);
        const after = val.slice(caret);
        const atIndex = before.lastIndexOf("@");
        if (atIndex === -1) return;
        const next = `${before.slice(0, atIndex)}${token}${after}`;
        onInputChange({ target: { value: next } } as React.ChangeEvent<HTMLTextAreaElement>);
        setMentionOpen(false);
        setMentionQuery("");
        setSlashOpen(false);
        requestAnimationFrame(() => textarea.focus());
    }, [inputValue, onInputChange]);

    const appendToken = React.useCallback((token: string) => {
        const textarea = textareaRef.current;
        const val = inputValue;
        const caret = textarea?.selectionStart ?? val.length;
        const before = val.slice(0, caret);
        const after = val.slice(caret);
        const pad = before.length > 0 && !/\s$/.test(before) ? " " : "";
        const next = `${before}${pad}${token} ${after.replace(/^\s/, "")}`;
        onInputChange({ target: { value: next } } as React.ChangeEvent<HTMLTextAreaElement>);
        requestAnimationFrame(() => textarea?.focus());
    }, [inputValue, onInputChange]);

    const insertSlash = React.useCallback((token: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const val = inputValue;
        const caret = textarea.selectionStart ?? val.length;
        const before = val.slice(0, caret);
        const after = val.slice(caret);
        const slashIndex = before.lastIndexOf("/");
        if (slashIndex === -1) return;
        const next = `${before.slice(0, slashIndex)}${token}${after}`;
        onInputChange({ target: { value: next } } as React.ChangeEvent<HTMLTextAreaElement>);
        setSlashOpen(false);
        setSlashQuery("");
        requestAnimationFrame(() => textarea.focus());
    }, [inputValue, onInputChange]);

    const onComposerKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((mentionOpen || slashOpen) && (e.key === "Enter" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Escape")) {
            e.preventDefault();
            return;
        }
        onKeyDown(e);
    }, [mentionOpen, slashOpen, onKeyDown]);

    const [composerTall, setComposerTall] = React.useState(false);

    React.useEffect(() => {
        if (reasoningEffort === "super" && !modelSupportsSuperThinking(selectedModel)) {
            setReasoningEffort("max");
        }
    }, [reasoningEffort, selectedModel, setReasoningEffort]);

    React.useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const line = 24;
        const max = 220;
        textarea.style.height = "0px";
        const content = textarea.scrollHeight;
        const tall = content > line + 2 || inputValue.includes("\n");
        const next = tall ? Math.min(Math.max(content, line), max) : line;
        textarea.style.height = `${next}px`;
        textarea.style.overflowY = content > max ? "auto" : "hidden";
        textarea.style.overflowX = "hidden";
        setComposerTall(tall);
        revealComposerCaret(textarea);
        syncComposerOverlayScroll(textarea, mentionOverlayRef.current);
    }, [inputValue]);

    React.useEffect(() => {
        const onFocusInput = () => textareaRef.current?.focus();
        window.addEventListener("shape-chat-focus-input", onFocusInput);
        return () => window.removeEventListener("shape-chat-focus-input", onFocusInput);
    }, []);

    React.useEffect(() => {
        if (!isLoading) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (mentionOpen || slashOpen) return;
            const t = e.target as HTMLElement | null;
            if (t?.closest(".cm-editor, [role='dialog']")) return;
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA") && t !== textareaRef.current) {
                return;
            }
            e.preventDefault();
            onStopMessage();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isLoading, mentionOpen, slashOpen, onStopMessage]);

    // Files stay files. Huge text, terminal copies, and editor selections become attachments.
    const handlePaste = React.useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const filesToAdd: File[] = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file && isAllowedFile(file)) {
                    filesToAdd.push(file);
                }
            }
        }

        if (filesToAdd.length > 0) {
            e.preventDefault();
            addUploadedFiles(filesToAdd);
            return;
        }

        const text = e.clipboardData.getData("text/plain");
        if (!text) return;
        const remembered = matchRememberedClip(text);
        if (e.clipboardData.types.includes("application/x-shape-terminal") || remembered?.kind === "terminal") {
            e.preventDefault();
            addUploadedFiles([terminalAttachmentFile(text, remembered?.label)]);
            return;
        }
        if (e.clipboardData.types.includes(SHAPE_CLIP_CODE) || remembered?.kind === "code") {
            e.preventDefault();
            const raw = e.clipboardData.getData(SHAPE_CLIP_CODE);
            let path = remembered?.label || "selection.ts";
            try {
                const parsed = JSON.parse(raw) as { path?: string };
                if (parsed?.path) path = parsed.path;
            } catch {
                /* plain text is enough */
            }
            addUploadedFiles([codeAttachmentFile(text, path)]);
            return;
        }
        if (pasteIsLarge(text)) {
            e.preventDefault();
            addUploadedFiles([pastedTextFile(text)]);
        }
    }, [addUploadedFiles]);

    const [dragOver, setDragOver] = React.useState(false);
    const dragDepth = React.useRef(0);

    const handleDrop = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setDragOver(false);
        const codePayload = e.dataTransfer.getData(SHAPE_CLIP_CODE);
        if (codePayload) {
            try {
                const parsed = JSON.parse(codePayload) as { path?: string; text?: string };
                if (parsed.text) {
                    addUploadedFiles([codeAttachmentFile(parsed.text, parsed.path || "selection.ts")]);
                    return;
                }
            } catch {
                /* fall through to files */
            }
        }
        const files = Array.from(e.dataTransfer.files).filter(isAllowedFile);
        if (files.length > 0) {
            addUploadedFiles(files);
        }
    }, [addUploadedFiles]);

    const handleDragEnter = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current += 1;
        const types = e.dataTransfer.types;
        if (types.includes("Files") || types.includes(SHAPE_CLIP_CODE)) setDragOver(true);
    }, []);

    const handleDragLeave = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragOver(false);
    }, []);

    const handleDragOver = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    // Elements picked in the Browser tab become @element mentions at the caret.
    React.useEffect(() => {
        const onElement = (e: Event) => {
            const detail = (e as CustomEvent<BrowserPickedElement>).detail;
            if (!detail?.tag) return;
            const token = registerElementMention(detail);
            const textarea = textareaRef.current;
            const val = inputValue;
            const caret = textarea?.selectionStart ?? val.length;
            const before = val.slice(0, caret);
            const after = val.slice(caret);
            const lead = before && !/\s$/.test(before) ? " " : "";
            const trail = after && !/^\s/.test(after) ? " " : after ? "" : " ";
            const next = `${before}${lead}${token}${trail}${after}`;
            onInputChange({ target: { value: next } } as React.ChangeEvent<HTMLTextAreaElement>);
            const pos = before.length + lead.length + token.length + trail.length;
            requestAnimationFrame(() => {
                textarea?.focus();
                textarea?.setSelectionRange(pos, pos);
            });
        };
        window.addEventListener("shape-chat-attach-element", onElement as EventListener);
        return () => window.removeEventListener("shape-chat-attach-element", onElement as EventListener);
    }, [inputValue, onInputChange]);

    // Filter file uploads to only allowed types
    const handleFilteredFileUpload = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const allowed = Array.from(e.target.files).filter(isAllowedFile);
            if (allowed.length > 0) {
                addUploadedFiles(allowed);
            }
        }
        // Reset input so same file can be re-selected
        e.target.value = "";
    }, [addUploadedFiles]);

    const [modelQuery, setModelQuery] = React.useState("");
    const enabled = sanitizeEnabledModels(
        settings.ai.enabledModels,
        allModels.map((m) => m.id),
        getCatalogDefaultEnabledIds(),
    );
    const MODELS = getVisibleModels(allModels, enabled);
    const autoModel = allModels.find((m) => m.id === "auto") ?? {
        id: "auto",
        name: "Auto",
        description: "Picks a fast model for everyday work.",
        provider: "Auto",
        inputCost: 0,
        cachedInputCost: 0,
        outputCost: 0,
        contextWindow: "200K",
        releaseDate: "Rolling",
    };
    const modelInfo = MODELS.find((m) => m.id === selectedModel) || autoModel;
    const workerExtra = multiSelectModels
        ? selectedWorkerModels.filter((id) => id && id !== selectedModel)
        : [];
    const modelNameBase =
        selectedModel === "auto" || modelInfo.name === "auto" ? "Auto" : modelInfo.name;
    const modelName =
        multiSelectModels && workerExtra.length > 0
            ? `${modelNameBase} +${workerExtra.length}`
            : modelNameBase;
    const providerOrder = React.useMemo(() => {
        const seen = new Set<string>();
        const order: string[] = [];
        for (const p of getCatalogProviderOrder()) {
            if (seen.has(p)) continue;
            seen.add(p);
            order.push(p);
        }
        for (const m of allModels) {
            if (seen.has(m.provider)) continue;
            seen.add(m.provider);
            order.push(m.provider);
        }
        return order;
    }, [allModels]);
    const modelSearch = modelQuery.trim().toLowerCase();
    const modelMatches = (m: { id: string; name: string; provider: string }) => {
        if (!modelSearch) return true;
        return (
            m.name.toLowerCase().includes(modelSearch) ||
            m.id.toLowerCase().includes(modelSearch) ||
            m.provider.toLowerCase().includes(modelSearch)
        );
    };
    const needsSignIn = !shapeAuth.isLoading && !shapeAuth.loggedIn;

    const [plusPlugins, setPlusPlugins] = React.useState<PluginRow[]>(() => peekPluginsCache()?.plugins ?? []);
    const [pluginQuery, setPluginQuery] = React.useState("");
    const [skills, setSkills] = React.useState<Skill[]>(() => listSkills());
    React.useEffect(() => subscribeSkills(() => setSkills(listSkills())), []);

    React.useEffect(() => {
        if (selectedModel === "auto") return;
        if (allModels.length <= 1) return;
        if (!allModels.some((m) => m.id === selectedModel)) {
            setSelectedModel("auto");
        }
    }, [allModels, selectedModel, setSelectedModel]);

    // Build the accept string for the file input
    const acceptString = [
        ...Array.from(IMAGE_EXTENSIONS).map((ext) => `.${ext}`),
        ...Array.from(CODE_EXTENSIONS).map((ext) => `.${ext}`),
        ...Array.from(ASSET_EXTENSIONS).map((ext) => `.${ext}`),
        ".mp3",
        ".wav",
        ".m4a",
        ".ogg",
        ".flac",
        ".aac",
    ].join(",");

    const [mediaViewer, setMediaViewer] = React.useState<{
        src?: string;
        title?: string;
        kind: "image" | "html";
    } | null>(null);

    React.useEffect(() => {
        const onOpen = (e: Event) => {
            const detail = (e as CustomEvent<{ src: string; title?: string; kind?: "image" | "html" }>).detail;
            if (!detail?.src) return;
            setMediaViewer({
                src: detail.src,
                title: detail.title,
                kind: detail.kind || "image",
            });
        };
        window.addEventListener("shape-open-media", onOpen as EventListener);
        return () => {
            window.removeEventListener("shape-open-media", onOpen as EventListener);
        };
    }, []);

    const hasContextStrip =
        (pendingEdits?.length ?? 0) > 0 ||
        queuedMessages.length > 0 ||
        projectRuleFiles.length > 0 ||
        taskItems.length > 0;

    const sendDisabled =
        needsSignIn ||
        uploadedFiles.some((a) => a.status === "processing") ||
        (!isLoading && !inputValue.trim() && uploadedFiles.length === 0);

    const sendActive =
        (inputValue.trim() || isLoading || uploadedFiles.length > 0) &&
        !uploadedFiles.some((a) => a.status === "processing");

    return (
        <div
            className={cn(
                "relative shrink-0 overflow-visible",
                variant === "empty" ? "w-full px-0 pb-0 pt-0" : "px-0 pb-3 pt-0",
            )}
        >
            <div className="relative z-10 flex w-full flex-col gap-1.5">
                {hasContextStrip ? (
                    <div className="flex min-w-0 items-center gap-1 px-1">
                        {pendingEdits.length > 0 ? (
                        <PendingEditsPanel
                            edits={pendingEdits}
                            onAcceptAll={onAcceptAllEdits ?? (() => {})}
                            onRejectAll={onRejectAllEdits ?? (() => {})}
                            onAccept={onAcceptEdit}
                            onReject={onRejectEdit}
                        />
                        ) : null}
                        {queuedMessages.length > 0 && onEditQueuedMessage && onRemoveQueuedMessage ? (
                            <QueuedMessagesPanel
                                items={queuedMessages}
                                onEdit={onEditQueuedMessage}
                                onRemove={onRemoveQueuedMessage}
                                onSendNow={onSendQueuedNow}
                            />
                        ) : null}
                        {projectRuleFiles.length > 0 ? (
                            <Tooltip content={projectRuleFiles.join("\n")}>
                                <span className="flex h-6 min-w-0 max-w-56 items-center gap-1.5 rounded-md px-1.5 text-sm text-text-secondary">
                                    <Icon icon={Document20Regular} />
                                    <span className="truncate">
                                        {projectRuleFiles
                                            .map((name) => name.split(/[\\/]/).pop() || name)
                                            .join(", ")}
                                    </span>
                                </span>
                            </Tooltip>
                        ) : null}
                        {taskItems.length > 0 ? <ComposerTasksStrip items={taskItems} /> : null}
                    </div>
                ) : null}

                <div
                    ref={composerBoxRef}
                    className={cn(
                        "relative flex w-full flex-col border transition-colors p-1.5",
                        "border-border-subtle/40 bg-surface-4",
                        composerTall || uploadedFiles.length > 0 ? "rounded-xl" : "rounded-full",
                        dragOver && "bg-surface-3/80",
                        needsSignIn && "cursor-default",
                    )}
                    onDrop={needsSignIn ? undefined : handleDrop}
                    onDragEnter={needsSignIn ? undefined : handleDragEnter}
                    onDragLeave={needsSignIn ? undefined : handleDragLeave}
                    onDragOver={needsSignIn ? undefined : handleDragOver}
                >
                    {dragOver ? (
                        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] border-2 border-border-subtle bg-surface-3/95">
                            <p className="text-sm font-medium text-text-primary">Drop files to attach</p>
                        </div>
                    ) : null}
                    <MentionPicker
                        open={mentionOpen || slashOpen}
                        query={slashOpen ? slashQuery : mentionQuery}
                        mode={slashOpen ? "slash" : "mention"}
                        workflows={settings.ai.workflows ?? []}
                        onPick={slashOpen ? insertSlash : insertMention}
                        onClose={() => {
                            setMentionOpen(false);
                            setSlashOpen(false);
                        }}
                        anchorRef={textareaRef}
                        boxRef={composerBoxRef}
                        caretIndex={mentionCaret}
                    />
                    <ComposerAttachments
                        attachments={uploadedFiles}
                        onRemove={(id) =>
                            setUploadedFiles((prev) => prev.filter((a) => a.id !== id))
                        }
                    />
                    <div className={cn("relative flex gap-1 px-1.5", composerTall ? "items-end" : "h-11 items-center")}>
                        <input
                            type="file"
                            id="chat-media-upload"
                            className="hidden"
                            multiple
                            accept={acceptString}
                            onChange={handleFilteredFileUpload}
                        />
                        <input
                            type="file"
                            id="chat-folder-upload"
                            className="hidden"
                            multiple
                            {...{ webkitdirectory: "", directory: "" }}
                            onChange={handleFilteredFileUpload}
                        />
                        <DropdownMenu
                            onOpenChange={(open) => {
                                if (!open) return;
                                const cached = peekPluginsCache()?.plugins;
                                if (cached) setPlusPlugins(cached);
                                void fetchPlugins()
                                    .then((data) => setPlusPlugins(data.plugins))
                                    .catch(() => {
                                        if (!cached) setPlusPlugins([]);
                                    });
                            }}
                        >
                            <DropdownMenuTrigger asChild>
                                <button
                                    className={cn(
                                        "size-9 shrink-0 p-0",
                                        "text-text-muted hover:text-text-primary",
                                        "rounded-full bg-panel-hover hover:bg-panel-active",
                                    )}
                                    aria-label="Add"
                                    disabled={needsSignIn}
                                >
                                    <Icon icon={Add20Regular} />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56">
                                <DropdownMenuItem
                                    onClick={() => document.getElementById("chat-media-upload")?.click()}
                                >
                                    <Icon icon={MoviesAndTv24Filled} />
                                    Upload photos & file
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => document.getElementById("chat-folder-upload")?.click()}
                                >
                                    <Icon icon={FolderAdd24Filled} />
                                    Attach folder
                                </DropdownMenuItem>
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                        <Icon icon={Connected24Filled} />
                                        Plugins
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent className="w-56">
                                        <SearchInput
                                            borderless
                                            placeholder="Search plugins"
                                            autoFocus
                                            value={pluginQuery}
                                            onChange={(e) => setPluginQuery(e.target.value)}
                                            onKeyDown={(e) => e.stopPropagation()}
                                            onKeyUp={(e) => e.stopPropagation()}
                                            onPointerDown={(e) => e.stopPropagation()}
                                        />
                                        <div className="max-h-40 overflow-y-auto">
                                            {(() => {
                                                const q = pluginQuery.trim().toLowerCase();
                                                const matches = plusPlugins.filter(
                                                    (plugin) =>
                                                        !q
                                                        || plugin.name.toLowerCase().includes(q)
                                                        || plugin.toolkit.toLowerCase().includes(q),
                                                );
                                                if (matches.length === 0) {
                                                    return (
                                                        <DropdownMenuItem disabled>
                                                            {plusPlugins.length === 0 ? "No plugins" : "No matches"}
                                                        </DropdownMenuItem>
                                                    );
                                                }
                                                return matches.map((plugin) => (
                                                    <DropdownMenuItem
                                                        key={plugin.toolkit}
                                                        onClick={() =>
                                                            appendToken(
                                                                formatMentionToken({
                                                                    kind: "plugin",
                                                                    id: plugin.toolkit,
                                                                    path: plugin.toolkit,
                                                                    label: plugin.name,
                                                                }),
                                                            )
                                                        }
                                                    >
                                                        <PluginLogo toolkit={plugin.toolkit} name={plugin.name} size={14} />
                                                        <span className="min-w-0 flex-1 truncate">{plugin.name}</span>
                                                    </DropdownMenuItem>
                                                ));
                                            })()}
                                        </div>
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                        <Icon icon={DocumentEdit24Filled} />
                                        Skills
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent className="w-56">
                                        {skills.length === 0 ? (
                                            <DropdownMenuItem disabled>No skills yet</DropdownMenuItem>
                                        ) : (
                                            skills.map((skill) => (
                                                <DropdownMenuItem
                                                    key={skill.id}
                                                    onClick={() =>
                                                        appendToken(
                                                            formatMentionToken({
                                                                kind: "skill",
                                                                id: skill.id,
                                                                path: skill.id,
                                                                label: skill.name,
                                                            }),
                                                        )
                                                    }
                                                >
                                                    <Icon icon={DocumentText20Regular} />
                                                    <span className="min-w-0 flex-1 truncate">{skill.name}</span>
                                                </DropdownMenuItem>
                                            ))
                                        )}
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="relative min-h-6 min-w-0 flex-1">
                        {!needsSignIn && !inputValue ? (
                            <RotatingComposerHint paused={false} />
                        ) : needsSignIn && !inputValue ? (
                            <div className="pointer-events-none absolute inset-0 z-0 flex items-center pl-3 text-sm font-medium leading-6 text-text-muted">
                                Sign in to use the chat
                            </div>
                        ) : null}
                        <div
                            ref={mentionOverlayRef}
                            aria-hidden
                            className="pointer-events-none absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap break-words pl-3 text-sm font-medium leading-6 text-text-primary"
                        >
                            {(() => {
                                const mentionRs = mentionRanges(inputValue);
                                const slashRs = slashCommandRanges(inputValue, settings.ai.workflows ?? []);
                                const ranges = [
                                    ...mentionRs.map((r) => ({ kind: "mention" as const, ...r })),
                                    ...slashRs.map((r) => ({ kind: "slash" as const, ...r })),
                                ].sort((a, b) => a.start - b.start);
                                const merged: typeof ranges = [];
                                for (const r of ranges) {
                                    const prev = merged[merged.length - 1];
                                    if (prev && r.start < prev.end) continue;
                                    merged.push(r);
                                }
                                if (merged.length === 0) {
                                    return inputValue || "\u00a0";
                                }
                                const nodes: React.ReactNode[] = [];
                                let cursor = 0;
                                merged.forEach((range, i) => {
                                    if (range.start > cursor) {
                                        nodes.push(inputValue.slice(cursor, range.start));
                                    }
                                    nodes.push(
                                        <ComposerContextHighlight
                                            key={`${range.kind}-${i}`}
                                            text={inputValue.slice(range.start, range.end)}
                                        />,
                                    );
                                    cursor = range.end;
                                });
                                if (cursor < inputValue.length) {
                                    nodes.push(inputValue.slice(cursor));
                                }
                                return nodes;
                            })()}
                        </div>
                        <ContextMenu>
                            <ContextMenuTrigger asChild>
                                <textarea
                                    ref={textareaRef}
                                    value={inputValue}
                                    onChange={handleInputChangeWithMentions}
                                    onKeyDown={onComposerKeyDown}
                                    onPaste={handlePaste}
                                    onSelect={(e) => {
                                        if (!mentionOpen && !slashOpen) return;
                                        const el = e.currentTarget;
                                        const caret = el.selectionStart ?? 0;
                                        const before = el.value.slice(0, caret);
                                        const atMatch = before.match(/@([\w./:-]*)$/);
                                        const slashMatch = before.match(/(?:^|\s)(\/[^\s]*)$/);
                                        if (atMatch) {
                                            setMentionCaret(caret - atMatch[0].length);
                                            setMentionQuery(atMatch[1] ?? "");
                                            setMentionOpen(true);
                                            setSlashOpen(false);
                                        } else if (slashMatch) {
                                            setSlashQuery((slashMatch[1] ?? "/").replace(/^\//, ""));
                                            setSlashOpen(true);
                                            setMentionOpen(false);
                                        } else {
                                            setMentionOpen(false);
                                            setSlashOpen(false);
                                        }
                                    }}
                                    onScroll={(e) => {
                                        syncComposerOverlayScroll(e.currentTarget, mentionOverlayRef.current);
                                    }}
                                    placeholder=""
                                    aria-label={
                                        needsSignIn
                                            ? "Sign in to use the chat"
                                            : COMPOSER_HINTS[0]
                                    }
                                    rows={1}
                                    className="relative z-[1] block h-6 min-h-6 w-full resize-none overflow-x-hidden border-none bg-transparent py-0 pl-3 text-sm font-medium leading-6 text-transparent outline-none placeholder:text-text-muted selection:bg-accent/30 whitespace-pre-wrap break-words"
                                    style={{ caretColor: "var(--text-primary)" }}
                                />
                            </ContextMenuTrigger>
                            <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
                                <ContextMenuItem onClick={() => document.execCommand("cut")}>
                                    Cut
                                    <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => document.execCommand("copy")}>
                                    Copy
                                    <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                                </ContextMenuItem>
                                <ContextMenuItem
                                    onClick={() => {
                                        void navigator.clipboard.readText().then((text) => {
                                            const el = textareaRef.current;
                                            if (!el || needsSignIn) return;
                                            const start = el.selectionStart;
                                            const end = el.selectionEnd;
                                            const next =
                                                inputValue.slice(0, start) + text + inputValue.slice(end);
                                            onInputChange({
                                                target: { value: next },
                                            } as React.ChangeEvent<HTMLTextAreaElement>);
                                            requestAnimationFrame(() => {
                                                el.focus();
                                                const pos = start + text.length;
                                                el.setSelectionRange(pos, pos);
                                            });
                                        });
                                    }}
                                >
                                    Paste
                                    <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                    onClick={() => {
                                        const el = textareaRef.current;
                                        if (!el) return;
                                        el.focus();
                                        el.select();
                                    }}
                                >
                                    Select All
                                    <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
                                </ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                if (isLoading && inputValue.trim()) {
                                    onSendMessage();
                                } else if (isLoading) {
                                    onStopMessage();
                                } else {
                                    onSendMessage();
                                }
                            }}
                            disabled={sendDisabled}
                            className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-full text-white transition-all disabled:opacity-40",
                                sendActive ? "bg-accent hover:opacity-90" : "bg-panel-hover text-text-muted",
                            )}
                            aria-label={
                                isLoading && inputValue.trim()
                                    ? "Queue message"
                                    : isLoading
                                      ? "Stop"
                                      : "Send"
                            }
                        >
                            {isLoading && !inputValue.trim() ? (
                                <span role="status" aria-label="Generating" className="text-white">
                                    <Arc size={16} />
                                </span>
                            ) : (
                                <Icon icon={ArrowUp20Regular} />
                            )}
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2 px-1">
                    <div className="flex min-w-0 items-center gap-0.5">
                        {hideModeSelect ? null : (
                            <ModeMenu
                                selectedMode={selectedMode}
                                setSelectedMode={setSelectedMode}
                                disabled={needsSignIn}
                            />
                        )}
                        <WorkspaceBranchSwitch />
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                        <DropdownMenu
                            onOpenChange={(open) => {
                                if (!open) setModelQuery("");
                            }}
                        >
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    className="h-8 max-w-[220px] px-2 font-normal text-text-muted hover:text-text-primary hover:bg-transparent"
                                    aria-label={modelName}
                                >
                                    <div className="flex min-w-0 items-center gap-1.5 text-sm">
                                        {providerIcon(selectedModel === "auto" ? "auto" : modelInfo.id, 14)}
                                        <span className="min-w-0 truncate">{modelName}</span>
                                        {isApiModel(modelInfo) ? (
                                            <span className="shrink-0 text-sm font-normal text-text-muted">API</span>
                                        ) : null}
                                    </div>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-70">
                                        <SearchInput
                                            borderless
                                            placeholder="Search models"
                                            autoFocus
                                            value={modelQuery}
                                            onChange={(e) => setModelQuery(e.target.value)}
                                            onKeyDown={(e) => e.stopPropagation()}
                                            onKeyUp={(e) => e.stopPropagation()}
                                            onPointerDown={(e) => e.stopPropagation()}
                                        />
                                        <div className="custom-scrollbar max-h-[280px] overflow-y-auto">
                                            {multiSelectModels ? (
                                                <div className="px-2.5 py-1.5 text-xs text-text-muted">
                                                    Orchestrator uses the primary model. Extra picks become the worker pool.
                                                </div>
                                            ) : null}
                                            {modelMatches(autoModel) ? (
                                                multiSelectModels ? (
                                                    <DropdownMenuCheckboxItem
                                                        checked={selectedModel === "auto" || selectedWorkerModels.includes("auto")}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setSelectedModel("auto");
                                                                setSelectedWorkerModels?.(
                                                                    selectedWorkerModels.filter((id) => id !== "auto"),
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        Auto
                                                    </DropdownMenuCheckboxItem>
                                                ) : (
                                                    <ModelItem
                                                        model={autoModel}
                                                        isSelected={selectedModel === "auto"}
                                                        onSelect={() => setSelectedModel("auto")}
                                                        effort={reasoningEffort}
                                                    />
                                                )
                                            ) : null}
                                            {providerOrder.filter((p) => p !== "Auto").map((provider) => {
                                                const providerModels = MODELS.filter(
                                                    (m) => m.provider === provider && modelMatches(m),
                                                );
                                                if (providerModels.length === 0) return null;
                                                return (
                                                    <div key={provider}>
                                                        <DropdownMenuLabel className="text-xs font-regular text-text-muted">
                                                            {provider}
                                                        </DropdownMenuLabel>
                                                        {providerModels.map((m) => {
                                                            const allowed =
                                                                Boolean(shapeAuth.loggedIn && !shapeAuth.offline) &&
                                                                (isCatalogModelAllowed(m.id) || isApiModel(m));
                                                            if (multiSelectModels) {
                                                                const inPool =
                                                                    selectedModel === m.id
                                                                    || selectedWorkerModels.includes(m.id);
                                                                return (
                                                                    <DropdownMenuCheckboxItem
                                                                        key={m.id}
                                                                        checked={inPool}
                                                                        disabled={!allowed}
                                                                        onCheckedChange={(checked) => {
                                                                            if (!allowed) return;
                                                                            if (checked) {
                                                                                if (selectedModel === "auto" || !selectedWorkerModels.length) {
                                                                                    if (selectedModel !== m.id) {
                                                                                        setSelectedWorkerModels?.(
                                                                                            [...selectedWorkerModels.filter((id) => id !== m.id), m.id],
                                                                                        );
                                                                                    }
                                                                                } else if (selectedModel !== m.id) {
                                                                                    setSelectedWorkerModels?.(
                                                                                        [...selectedWorkerModels.filter((id) => id !== m.id), m.id],
                                                                                    );
                                                                                }
                                                                            } else if (selectedModel === m.id) {
                                                                                const [next, ...rest] = selectedWorkerModels;
                                                                                if (next) {
                                                                                    setSelectedModel(next);
                                                                                    setSelectedWorkerModels?.(rest);
                                                                                }
                                                                            } else {
                                                                                setSelectedWorkerModels?.(
                                                                                    selectedWorkerModels.filter((id) => id !== m.id),
                                                                                );
                                                                            }
                                                                        }}
                                                                    >
                                                                        <span className="flex min-w-0 items-center gap-1.5">
                                                                            {providerIcon(m.id, 14)}
                                                                            <span className="truncate">{m.name}</span>
                                                                        </span>
                                                                    </DropdownMenuCheckboxItem>
                                                                );
                                                            }
                                                            return (
                                                                <ModelItem
                                                                    key={m.id}
                                                                    model={m}
                                                                    isSelected={selectedModel === m.id}
                                                                    onSelect={setSelectedModel}
                                                                    effort={reasoningEffort}
                                                                    disabled={!allowed}
                                                                    disabledReason="This model is not available on your plan. Upgrade on the website or keep Auto selected."
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })}
                                            {!modelMatches(autoModel) && !MODELS.some(modelMatches) ? (
                                                <div className="px-2.5 py-3 text-sm text-text-muted">
                                                    No models match
                                                </div>
                                            ) : null}
                                        </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <ThinkingEffortControl
                            effort={reasoningEffort}
                            modelId={selectedModel}
                            onChange={setReasoningEffort}
                            disabled={needsSignIn}
                        />
                    </div>
                </div>
            </div>
            <MediaLightbox
                open={!!mediaViewer}
                onClose={() => setMediaViewer(null)}
                src={mediaViewer?.src}
                title={mediaViewer?.title}
                kind={mediaViewer?.kind || "image"}
            />
        </div>
    );
}



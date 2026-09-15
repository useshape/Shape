"use client";

import { RiAddLine, RiArrowDownSLine, RiArrowUpLine, RiChat3Line, RiCheckLine, RiCodeLine, RiGitBranchLine, RiListCheck3, RiPaletteLine, RiPuzzle2Line, RiSearchLine, RiShieldLine, RiTerminalBoxLine } from "@remixicon/react";
import React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from "@/components/ui/dropdown";
import { Switch } from "@/components/ui/switch";
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
import { AUTO_DISPLAY_MODEL } from "../message/bubble";
import { MentionPicker } from "./mentions";
import { PendingEditsPanel } from "./edits";
import {
    ComposerTasksStrip,
    type ComposerTaskItem,
} from "./activity";
import { QueuedMessagesPanel, type QueuedMessage } from "./queue";
import { ComposerAttachments, ComposerAttachmentsStrip, isImageFile, isAudioFile, type ComposerAttachment } from "./attachments";
import { MediaLightbox } from "../blocks/lightbox";
import { mentionRanges, mentionDisplayLabel, shortenMentionTokensInText, type ChatMention } from "@/lib/chat-mentions";
import { FileIcon } from "@/components/ui/file-icon";
import { Favicon } from "@/components/ui/favicon";
import { PluginLogo } from "@/components/ui/plugin-logo";
import { resolveChatUsageDisplay } from "@/lib/usage-display";
import { getLastTurnUsage, subscribeLastTurnUsage } from "@/lib/last-turn-usage";
import { UsageRing } from "./usage";
import { getVisibleModels, type ModelInfo } from "@/lib/models";
import {
    getCatalogModels,
    getCatalogProviderOrder,
    isCatalogModelAllowed,
    useShapeCatalog,
} from "@/lib/catalog-store";
import { useSettings, hasByokApiKeys } from "@/lib/settings";
import { useShapeAuth } from "@/lib/cloud/store";

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
    addUploadedFiles: (files: File[]) => void;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    selectedModel: string;
    setSelectedModel: (m: string) => void;
    selectedMode: string;
    setSelectedMode: (m: string) => void;
    reasoningEffort: ReasoningEffort;
    setReasoningEffort: (e: ReasoningEffort) => void;
    /** OpenRouter priority / Fast — independent of reasoning effort. */
    fastMode: boolean;
    setFastMode: (v: boolean) => void;
    pendingEdits?: { id: string; file: string; original: string; replacement: string; baseline?: string }[];
    onAcceptAllEdits?: () => void;
    onRejectAllEdits?: () => void;
    onAcceptEdit?: (id: string) => void;
    onRejectEdit?: (id: string) => void;
    taskItems?: ComposerTaskItem[];
    queuedMessages?: QueuedMessage[];
    onEditQueuedMessage?: (id: string) => void;
    onRemoveQueuedMessage?: (id: string) => void;
    /** Tighter chrome for empty-chat centered layout */
    variant?: "default" | "empty";
};

export type ReasoningEffort = "low" | "high" | "ultra" | "max";

const EFFORT_OPTIONS: { id: ReasoningEffort; label: string }[] = [
    { id: "low", label: "Low" },
    { id: "high", label: "Medium" },
    { id: "ultra", label: "High" },
    { id: "max", label: "Max" },
];

function effortLabel(id: ReasoningEffort): string {
    return EFFORT_OPTIONS.find((o) => o.id === id)?.label ?? "Low";
}

function effortFastLabel(effort: ReasoningEffort, fast: boolean): string {
    const base = effortLabel(effort);
    return fast ? `${base} Fast` : base;
}



/** Credits per $1 of catalog provider cost after TARGET_MARGIN (0.4) and $0.02/credit. */
const CREDITS_PER_USD_PROVIDER = (1 + 0.4) / 0.02;

function creditsPerMillion(usdPerMillion: number): number {
    return Math.round(usdPerMillion * CREDITS_PER_USD_PROVIDER);
}

const ModelTooltip = ({ model }: { model: ModelInfo }) => {
    const isAuto = model.id === "auto" || model.id === "openrouter/auto";
    const inCredits = creditsPerMillion(model.inputCost ?? 0);
    const outCredits = creditsPerMillion(model.outputCost ?? 0);

    return (
        <div className="flex flex-col gap-1.5 min-w-[200px] max-w-[260px] px-2.5 py-2 select-none">
            <div className="flex items-center gap-1.5">
                {providerIcon(model.id, 14)}
                <span className="text-sm font-medium text-text-primary truncate">
                    {isAuto ? "Auto" : model.name}
                </span>
            </div>
            <p className="text-xs text-text-muted leading-snug line-clamp-2">
                {isAuto
                    ? "Uses a fast included model. Counts toward your monthly Auto allowance."
                    : model.description}
            </p>
            <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-text-muted">Context</span>
                <span className="text-text-primary tabular-nums">{model.contextWindow}</span>
            </div>
            {isAuto ? (
                <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-text-muted">Cost</span>
                    <span className="text-text-primary">Auto allowance</span>
                </div>
            ) : (
                <div className="flex flex-col gap-0.5 text-xs">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-text-muted">Input</span>
                        <span className="text-text-primary tabular-nums">~{inCredits} cr / 1M</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-text-muted">Output</span>
                        <span className="text-text-primary tabular-nums">~{outCredits} cr / 1M</span>
                    </div>
                </div>
            )}
        </div>
    );
};

const ModelItem = ({
    model,
    isSelected,
    onSelect,
    disabled = false,
    disabledReason,
}: {
    model: ModelInfo,
    isSelected: boolean,
    onSelect: (id: string) => void,
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
                    <ModelTooltip model={model} />
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
                    {isSelected && <Icon icon={RiCheckLine} className="text-text-primary font-bold" />}
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

function ComposerMentionChip({ raw, mention }: { raw: string; mention: ChatMention }) {
    const label = mentionDisplayLabel(mention);
    return (
        <span className="relative">
            <span className="invisible">{raw}</span>
            <span className="absolute inset-0 inline-flex min-w-0 items-center gap-1 overflow-hidden rounded-md bg-accent-text-bg px-1 text-accent-text">
                {mention.kind === "file" || mention.kind === "folder" || mention.kind === "docs" ? (
                    <FileIcon name={label} className="h-3 w-3 shrink-0" />
                ) : mention.kind === "plugin" ? (
                    <PluginLogo
                        toolkit={mention.id || mention.path || label}
                        name={label}
                        size={12}
                        className="rounded-sm"
                    />
                ) : mention.kind === "browser" ? (
                    <Favicon url={mention.path || label} size={12} />
                ) : (
                    <Icon
                        icon={
                            mention.kind === "chat"
                                ? RiChat3Line
                                : mention.kind === "design"
                                  ? RiPaletteLine
                                  : mention.kind === "terminal"
                                    ? RiTerminalBoxLine
                                    : mention.kind === "branch"
                                      ? RiGitBranchLine
                                      : mention.kind === "codebase"
                                        ? RiSearchLine
                                        : mention.kind === "selection"
                                          ? RiCodeLine
                                          : mention.kind === "mcp"
                                            ? RiPuzzle2Line
                                            : RiChat3Line
                        }
                        className="shrink-0"
                    />
                )}
                <span className="min-w-0 truncate">@{label}</span>
            </span>
        </span>
    );
}

const CHAT_MODES = [
    { id: "Code", icon: RiCodeLine, color: "#3B82F6" },
    { id: "Ask", icon: RiChat3Line, color: "#22C55E" },
    { id: "Plan", icon: RiListCheck3, color: "#A855F7" },
    { id: "Visual", icon: RiPaletteLine, color: "#EC4899" },
    { id: "Review", icon: RiShieldLine, color: "#F59E0B" },
] as const;

const COMPOSER_HINTS = [
    "Plan, Build, / for skills, @ for context",
    "Drop an image or screenshot to redesign",
    "Ask to explore the codebase with @codebase",
    "Paste a stack trace to debug",
    "Describe a UI change and preview it in Visual",
    "Review a PR or file for bugs and edge cases",
] as const;

function RotatingComposerHint({
    paused,
    compact = false,
}: {
    paused: boolean;
    compact?: boolean;
}) {
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
        <div
            className={cn("t-composer-hint", compact && "t-composer-hint--compact")}
            aria-hidden
        >
            <span className="t-composer-hint__text text-[14.5px]!" data-phase={phase}>
                {COMPOSER_HINTS[index]}
            </span>
        </div>
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
    selectedMode,
    setSelectedMode,
    reasoningEffort,
    setReasoningEffort,
    fastMode,
    setFastMode,
    pendingEdits = [],
    onAcceptAllEdits,
    onRejectAllEdits,
    onAcceptEdit,
    onRejectEdit,
    taskItems = [],
    queuedMessages = [],
    onEditQueuedMessage,
    onRemoveQueuedMessage,
    variant = "default",
}: Omit<ChatInputProps, "webSearch" | "setWebSearch" | "handleFileUpload">) {

    const settings = useSettings();
    const compact = Boolean(settings.ai.compactComposer) && variant !== "empty";
    const shapeAuth = useShapeAuth();
    const { catalog } = useShapeCatalog();
    const allModels = getCatalogModels();
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const mentionOverlayRef = React.useRef<HTMLDivElement>(null);
    const [mentionOpen, setMentionOpen] = React.useState(false);
    const [mentionQuery, setMentionQuery] = React.useState("");
    const [mentionCaret, setMentionCaret] = React.useState(0);

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
        if (atMatch) {
            const atStart = caretNow - atMatch[0].length;
            setMentionOpen(true);
            setMentionQuery(atMatch[1] ?? "");
            setMentionCaret(atStart);
        } else {
            setMentionOpen(false);
            setMentionQuery("");
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
        requestAnimationFrame(() => textarea.focus());
    }, [inputValue, onInputChange]);

    const onComposerKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (mentionOpen && (e.key === "Enter" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Escape")) {
            // MentionPicker handles these via window capture; don't send the message.
            e.preventDefault();
            return;
        }
        onKeyDown(e);
    }, [mentionOpen, onKeyDown]);

    React.useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = "auto";
        const max = compact ? 28 : 200;
        const newHeight = Math.min(Math.max(textarea.scrollHeight, compact ? 28 : 0), max);
        textarea.style.height = `${newHeight}px`;
    }, [inputValue, compact]);

    React.useEffect(() => {
        const onFocusInput = () => textareaRef.current?.focus();
        window.addEventListener("shape-chat-focus-input", onFocusInput);
        return () => window.removeEventListener("shape-chat-focus-input", onFocusInput);
    }, []);

    // Handle paste events for images and files
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
        }
    }, [addUploadedFiles]);

    const [dragOver, setDragOver] = React.useState(false);
    const dragDepth = React.useRef(0);

    const handleDrop = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files).filter(isAllowedFile);
        if (files.length > 0) {
            addUploadedFiles(files);
        }
    }, [addUploadedFiles]);

    const handleDragEnter = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current += 1;
        if (e.dataTransfer.types.includes("Files")) setDragOver(true);
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

    const MODELS = getVisibleModels(allModels, settings.ai.enabledModels);
    const autoModel = allModels.find((m) => m.id === "auto") ?? {
        id: "auto",
        name: "Auto",
        description: "Uses a fast included model for everyday tasks.",
        provider: "Auto",
        inputCost: 0,
        cachedInputCost: 0,
        outputCost: 0,
        contextWindow: "200K",
        releaseDate: "Rolling",
    };
    const modelInfo = MODELS.find(m => m.id === selectedModel) || autoModel;
    const selectedModeInfo = CHAT_MODES.find((m) => m.id === selectedMode) ?? CHAT_MODES[0];
    const providerOrder = getCatalogProviderOrder();
    const needsSignIn =
        !shapeAuth.isLoading && !shapeAuth.loggedIn && !hasByokApiKeys(settings.ai);

    const lastTurnUsage = React.useSyncExternalStore(
        subscribeLastTurnUsage,
        getLastTurnUsage,
        getLastTurnUsage,
    );

    const usageDisplay = React.useMemo(
        () => resolveChatUsageDisplay(selectedModel, shapeAuth, lastTurnUsage),
        [selectedModel, shapeAuth, lastTurnUsage],
    );

    React.useEffect(() => {
        if (!isCatalogModelAllowed(selectedModel)) {
            setSelectedModel("auto");
        }
    }, [catalog, selectedModel, setSelectedModel]);

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

    const inputPanel = (
                <div
                    className={cn(
                        "relative flex w-full flex-col border border-border-subtle bg-surface-3 transition-colors focus-within:border-border",
                        compact ? "rounded-full h-12 px-0.5" : "rounded-[1.35rem]",
                        dragOver && "border-border-subtle bg-surface-3/80",
                        needsSignIn && "opacity-50 cursor-not-allowed pointer-events-none",
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
                    open={mentionOpen}
                    query={mentionQuery}
                    onPick={insertMention}
                    onClose={() => setMentionOpen(false)}
                    anchorRef={textareaRef}
                    caretIndex={mentionCaret}
                />
                <div
                    className={cn(
                        "flex min-h-0 overflow-hidden rounded-[inherit]",
                        compact ? "flex-row items-center gap-0.5 px-1.5 py-1.5" : "flex-col",
                    )}
                >
                {!compact ? (
                    <ComposerAttachments
                        attachments={uploadedFiles}
                        onRemove={(id) =>
                            setUploadedFiles((prev) => prev.filter((a) => a.id !== id))
                        }
                    />
                ) : null}

                {compact ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                        <input
                            type="file"
                            id="chat-media-upload"
                            className="hidden"
                            multiple
                            accept={acceptString}
                            onChange={handleFilteredFileUpload}
                        />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild disabled={needsSignIn}>
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    disabled={needsSignIn}
                                    className="size-8 justify-center rounded-full px-0 font-medium"
                                    style={{
                                        backgroundColor: `${selectedModeInfo.color}22`,
                                        color: selectedModeInfo.color,
                                    }}
                                    aria-label={selectedModeInfo.id}
                                >
                                    <Icon icon={selectedModeInfo.icon} />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                                {CHAT_MODES.map((mode) => (
                                    <DropdownMenuItem
                                        key={mode.id}
                                        onClick={() => setSelectedMode(mode.id)}
                                    >
                                        <Icon
                                            icon={mode.icon}
                                            style={{ color: mode.color }}
                                        />
                                        <span className="flex-1">{mode.id}</span>
                                        {selectedMode === mode.id ? (
                                            <Icon icon={RiCheckLine} className="text-text-muted" />
                                        ) : null}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant="ghost"
                            size="xs"
                            disabled={needsSignIn}
                            onClick={() => document.getElementById("chat-media-upload")?.click()}
                            className="size-8 ml-1 shrink-0 p-0 rounded-full text-text-muted hover:text-text-primary"
                            aria-label="Attach file"
                        >
                            <Icon icon={RiAddLine} />
                        </Button>
                    </div>
                ) : null}

                <div className={cn("relative", compact ? "flex h-7 min-w-0 flex-1 items-center px-1.5" : "px-4 py-3")}>
                    {!needsSignIn && !inputValue ? (
                        <div
                            className={cn(
                                "pointer-events-none absolute z-0",
                                compact ? "inset-0 flex items-center overflow-hidden" : "inset-x-4 inset-y-3",
                            )}
                        >
                            <RotatingComposerHint paused={false} compact={compact} />
                        </div>
                    ) : needsSignIn && !inputValue ? (
                        <div
                            className={cn(
                                "pointer-events-none absolute z-0 text-sm font-medium text-text-muted",
                                compact
                                    ? "inset-0 flex items-center"
                                    : "inset-x-4 inset-y-3 leading-relaxed",
                            )}
                        >
                            Sign in to use the chat
                        </div>
                    ) : null}
                    <div
                        ref={mentionOverlayRef}
                        aria-hidden
                        className={cn(
                            "pointer-events-none absolute z-0 overflow-y-auto whitespace-pre-wrap break-words text-sm font-medium text-text-primary no-scrollbar",
                            compact
                                ? "inset-0 leading-7"
                                : "inset-x-4 inset-y-3 leading-relaxed",
                        )}
                    >
                        {(() => {
                            const ranges = mentionRanges(inputValue);
                            if (ranges.length === 0) {
                                return inputValue.endsWith("\n") ? `${inputValue}\n` : inputValue || "\u00a0";
                            }
                            const nodes: React.ReactNode[] = [];
                            let cursor = 0;
                            ranges.forEach((range, i) => {
                                if (range.start > cursor) {
                                    nodes.push(inputValue.slice(cursor, range.start));
                                }
                                const raw = inputValue.slice(range.start, range.end);
                                nodes.push(
                                    <ComposerMentionChip
                                        key={`m-${i}`}
                                        raw={raw}
                                        mention={range.mention}
                                    />,
                                );
                                cursor = range.end;
                            });
                            if (cursor < inputValue.length) {
                                nodes.push(inputValue.slice(cursor));
                            }
                            if (inputValue.endsWith("\n")) nodes.push("\n");
                            return nodes;
                        })()}
                    </div>
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            <textarea
                                ref={textareaRef}
                                value={inputValue}
                                onChange={needsSignIn ? undefined : handleInputChangeWithMentions}
                                onKeyDown={needsSignIn ? undefined : onComposerKeyDown}
                                onPaste={needsSignIn ? undefined : handlePaste}
                                onSelect={(e) => {
                                    if (!mentionOpen) return;
                                    const el = e.currentTarget;
                                    const caret = el.selectionStart ?? 0;
                                    const before = el.value.slice(0, caret);
                                    const atMatch = before.match(/@([\w./:-]*)$/);
                                    if (atMatch) {
                                        setMentionCaret(caret - atMatch[0].length);
                                        setMentionQuery(atMatch[1] ?? "");
                                    } else {
                                        setMentionOpen(false);
                                    }
                                }}
                                onScroll={(e) => {
                                    const overlay = mentionOverlayRef.current;
                                    if (overlay) overlay.scrollTop = e.currentTarget.scrollTop;
                                }}
                                readOnly={needsSignIn}
                                placeholder=""
                                aria-label={
                                    needsSignIn
                                        ? "Sign in to use the chat"
                                        : COMPOSER_HINTS[0]
                                }
                                rows={1}
                                className={cn(
                                    "relative z-[1] w-full resize-none overflow-y-auto border-none bg-transparent text-sm font-medium text-transparent outline-none custom-scrollbar placeholder:text-text-muted selection:bg-accent/30",
                                    compact ? "h-7 min-h-7 max-h-7 p-0 leading-7" : "min-h-7 leading-relaxed",
                                )}
                                style={{ caretColor: "var(--text-primary)" }}
                            />
                        </ContextMenuTrigger>
                        <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
                            <ContextMenuItem
                                disabled={needsSignIn}
                                onClick={() => document.execCommand("cut")}
                            >
                                Cut
                                <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => document.execCommand("copy")}>
                                Copy
                                <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuItem
                                disabled={needsSignIn}
                                onClick={() => {
                                    void navigator.clipboard.readText().then((text) => {
                                        const el = textareaRef.current;
                                        if (!el || needsSignIn) return;
                                        const start = el.selectionStart;
                                        const end = el.selectionEnd;
                                        const next =
                                            inputValue.slice(0, start) + text + inputValue.slice(end);
                                        el.focus();
                                        document.execCommand("insertText", false, text);
                                        if (el.value === inputValue) {
                                            el.value = next;
                                            el.dispatchEvent(new Event("input", { bubbles: true }));
                                        }
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

                <div
                    className={cn(
                        "flex items-center",
                        compact ? "shrink-0 gap-0.5" : "justify-between px-2 pb-2 pt-0",
                    )}
                >
                    {!compact ? (
                    <div className="flex min-w-0 items-center gap-0.5">
                        <input
                            type="file"
                            id="chat-media-upload"
                            className="hidden"
                            multiple
                            accept={acceptString}
                            onChange={handleFilteredFileUpload}
                        />
                        <Button
                            variant="ghost"
                            disabled={needsSignIn}
                            onClick={() => document.getElementById("chat-media-upload")?.click()}
                            className="size-8 shrink-0 p-0 text-text-muted hover:text-text-primary"
                            aria-label="Attach file"
                        >
                            <Icon icon={RiAddLine} />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild disabled={needsSignIn}>
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    disabled={needsSignIn}
                                    className="h-8 rounded-full px-2.5 font-medium"
                                    style={{
                                        backgroundColor: `${selectedModeInfo.color}22`,
                                        color: selectedModeInfo.color,
                                    }}
                                    aria-label={selectedModeInfo.id}
                                >
                                    <div className="flex items-center gap-1.5 text-sm">
                                        <Icon icon={selectedModeInfo.icon} />
                                        <span className="truncate">{selectedModeInfo.id}</span>
                                        <Icon icon={RiArrowDownSLine} className="text-text-muted" />
                                    </div>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                                {CHAT_MODES.map((mode) => (
                                    <DropdownMenuItem
                                        key={mode.id}
                                        onClick={() => setSelectedMode(mode.id)}
                                    >
                                        <Icon
                                            icon={mode.icon}
                                            style={{ color: mode.color }}
                                        />
                                        <span className="flex-1">{mode.id}</span>
                                        {selectedMode === mode.id ? (
                                            <Icon icon={RiCheckLine} className="text-text-muted" />
                                        ) : null}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    ) : null}

                    <div className="flex shrink-0 items-center gap-0.5">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild disabled={needsSignIn}>
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    disabled={needsSignIn}
                                    className={cn(
                                        "h-8 rounded-full font-medium",
                                        compact
                                            ? "flex size-8 max-w-none items-center justify-center px-0"
                                            : "max-w-[200px] px-2",
                                    )}
                                    aria-label={
                                        selectedModel === "auto" || modelInfo.name === "auto"
                                            ? "Auto"
                                            : modelInfo.name
                                    }
                                >
                                    <div
                                        className={cn(
                                            "flex min-w-0 items-center text-sm",
                                            compact ? "justify-center gap-0 " : "gap-2",
                                        )}
                                    >
                                        {compact ? (
                                            <span className="inline-flex size-[16px] shrink-0 items-center justify-center [&>svg]:block">
                                                {providerIcon(
                                                    selectedModel === "auto"
                                                        ? AUTO_DISPLAY_MODEL
                                                        : selectedModel,
                                                    16,
                                                )}
                                            </span>
                                        ) : (
                                            providerIcon(
                                                selectedModel === "auto"
                                                    ? AUTO_DISPLAY_MODEL
                                                    : selectedModel,
                                                14,
                                            )
                                        )}
                                        {!compact ? (
                                            <>
                                                <span className="truncate text-text-primary">
                                                    {selectedModel === "auto" || modelInfo.name === "auto"
                                                        ? "Auto"
                                                        : modelInfo.name}
                                                </span>
                                                <span className="shrink-0 text-text-muted">
                                                    {effortFastLabel(reasoningEffort, fastMode)}
                                                </span>
                                                <Icon icon={RiArrowDownSLine} className="shrink-0 text-text-muted" />
                                            </>
                                        ) : null}
                                    </div>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[260px]">
                                <div className="flex h-9 items-center justify-between gap-3 rounded-lg px-2.5">
                                    <span className="text-sm text-text-primary">Fast</span>
                                    <Switch
                                        checked={fastMode}
                                        onCheckedChange={(on) => setFastMode(on)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>

                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger className="flex h-9 cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5">
                                        <span className="text-sm text-text-primary">Effort</span>
                                        <span className="flex items-center gap-1 text-sm text-text-muted">
                                            {effortLabel(reasoningEffort)}
                                        </span>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent className="w-40">
                                        {EFFORT_OPTIONS.map((opt) => (
                                            <DropdownMenuItem
                                                key={opt.id}
                                                onClick={() => setReasoningEffort(opt.id)}
                                                className={cn(
                                                    "flex cursor-pointer items-center",
                                                    reasoningEffort === opt.id && "bg-panel-hover",
                                                )}
                                            >
                                                <span className="flex-1 text-sm">{opt.label}</span>
                                                {reasoningEffort === opt.id ? (
                                                    <Icon icon={RiCheckLine} />
                                                ) : null}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>

                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger className="flex h-9 cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5">
                                        <span className="text-sm text-text-primary">Model</span>
                                        <span className="min-w-0 truncate text-sm text-text-muted">
                                            {selectedModel === "auto" ? "Auto" : modelInfo.name}
                                        </span>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent className="w-60">
                                        <div className="custom-scrollbar max-h-[280px] overflow-y-auto">
                                            <ModelItem
                                                model={autoModel}
                                                isSelected={selectedModel === "auto"}
                                                onSelect={() => setSelectedModel("auto")}
                                            />
                                            {providerOrder.filter((p) => p !== "Auto").map((provider) => {
                                                const providerModels = MODELS.filter(
                                                    (m) => m.provider === provider,
                                                );
                                                if (providerModels.length === 0) return null;
                                                return (
                                                    <div key={provider}>
                                                        <DropdownMenuLabel className="text-xs font-regular text-text-muted">
                                                            {provider}
                                                        </DropdownMenuLabel>
                                                        {providerModels.map((m) => {
                                                            const allowed = isCatalogModelAllowed(m.id);
                                                            return (
                                                                <ModelItem
                                                                    key={m.id}
                                                                    model={m}
                                                                    isSelected={selectedModel === m.id}
                                                                    onSelect={setSelectedModel}
                                                                    disabled={!allowed}
                                                                    disabledReason="This model is not available on your plan. Upgrade on the website or keep Auto selected."
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {shapeAuth.loggedIn ? (
                            <Tooltip content={usageDisplay.tooltip}>
                                <button
                                    type="button"
                                    className="flex size-8 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-primary"
                                    onClick={() =>
                                        void import("@/lib/window/open-settings").then(({ openSettingsWindow }) =>
                                            openSettingsWindow({ category: "general" }),
                                        )
                                    }
                                    aria-label={usageDisplay.tooltip}
                                >
                                    <UsageRing percent={usageDisplay.percent} size={16} />
                                </button>
                            </Tooltip>
                        ) : null}
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
                            disabled={
                                needsSignIn ||
                                uploadedFiles.some((a) => a.status === "processing") ||
                                (!isLoading && !inputValue.trim() && uploadedFiles.length === 0)
                            }
                            className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-40",
                                (inputValue.trim() || isLoading || uploadedFiles.length > 0) &&
                                    !uploadedFiles.some((a) => a.status === "processing")
                                    ? "bg-accent text-white hover:opacity-90"
                                    : "bg-panel-hover text-text-muted",
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
                                <span
                                    className="send-spiral relative inline-block size-4"
                                    role="status"
                                    aria-label="Generating"
                                >
                                    {Array.from({ length: 8 }, (_, index) => (
                                        <span
                                            key={index}
                                            aria-hidden
                                            className="send-spiral-dot absolute inline-block rounded-full bg-current"
                                            style={
                                                {
                                                    "--spiral-i": index,
                                                } as React.CSSProperties
                                            }
                                        />
                                    ))}
                                </span>
                            ) : (
                                <Icon icon={RiArrowUpLine} />
                            )}
                        </button>
                    </div>
                </div>
                </div>
                </div>
    );

    return (
        <div
            className={cn(
                "relative shrink-0 overflow-visible",
                variant === "empty" ? "w-full px-0 pb-0 pt-0" : "px-0 pb-3 pt-1",
            )}
        >
            <div className="relative z-10 overflow-visible">
                {(pendingEdits.length > 0 || taskItems.length > 0 || queuedMessages.length > 0 || (compact && uploadedFiles.length > 0)) ? (
                    <div className="mb-2 flex flex-wrap items-end justify-start gap-1.5 pr-1">
                        {pendingEdits.length > 0 && onAcceptAllEdits && onRejectAllEdits ? (
                            <PendingEditsPanel
                                edits={pendingEdits}
                                onAcceptAll={onAcceptAllEdits}
                                onRejectAll={onRejectAllEdits}
                                onAccept={onAcceptEdit}
                                onReject={onRejectEdit}
                            />
                        ) : null}
                        {queuedMessages.length > 0 && onEditQueuedMessage && onRemoveQueuedMessage ? (
                            <QueuedMessagesPanel
                                items={queuedMessages}
                                onEdit={onEditQueuedMessage}
                                onRemove={onRemoveQueuedMessage}
                            />
                        ) : null}
                        {taskItems.length > 0 ? (
                            <ComposerTasksStrip items={taskItems} />
                        ) : null}
                        {compact && uploadedFiles.length > 0 ? (
                            <ComposerAttachmentsStrip
                                attachments={uploadedFiles}
                                onRemove={(id) =>
                                    setUploadedFiles((prev) => prev.filter((a) => a.id !== id))
                                }
                            />
                        ) : null}
                    </div>
                ) : null}
                {needsSignIn ? (
                    <Tooltip side="top" content="Sign in, or connect an API key">
                        <div
                            role="button"
                            tabIndex={0}
                            className="w-full cursor-pointer text-left"
                            onClick={() => {
                                void import("@/features/workbench/ui/login-prompt-dialog").then(
                                    ({ requestShapeLogin }) => requestShapeLogin(),
                                );
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    (e.currentTarget as HTMLElement).click();
                                }
                            }}
                        >
                            {inputPanel}
                        </div>
                    </Tooltip>
                ) : (
                    inputPanel
                )}
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



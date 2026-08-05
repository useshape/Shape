import React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
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
import {
    ComposerTasksStrip,
    type ComposerTaskItem,
} from "./activity";
import { MediaLightbox } from "../blocks/lightbox";
import { mentionRanges, mentionDisplayLabel, shortenMentionTokensInText } from "@/lib/chat-mentions";
import { FileIcon } from "@/components/ui/file-icon";
import { Favicon } from "@/components/ui/favicon";
import { resolveChatUsageDisplay } from "@/lib/usage-display";
import { UsageRing } from "./usage";
import { getVisibleModels, type ModelInfo } from "@/lib/models";
import {
    getCatalogModels,
    getCatalogProviderOrder,
    isCatalogModelAllowed,
    useShapeCatalog,
} from "@/lib/catalog-store";
import { useSettings } from "@/lib/settings";
import { useShapeAuth } from "@/lib/shape-auth/store";

type ChatInputProps = {
    inputValue: string;
    isLoading: boolean;
    webSearch: string;
    uploadedFiles: File[];
    onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onSendMessage: () => void;
    onStopMessage: () => void;
    setWebSearch: (s: string) => void;
    setUploadedFiles: React.Dispatch<React.SetStateAction<File[]>>;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    selectedModel: string;
    setSelectedModel: (m: string) => void;
    selectedMode: string;
    setSelectedMode: (m: string) => void;
    pendingEdits?: { id: string; file: string; original: string; replacement: string; baseline?: string }[];
    onAcceptAllEdits?: () => void;
    onRejectAllEdits?: () => void;
    onAcceptEdit?: (id: string) => void;
    onRejectEdit?: (id: string) => void;
    taskItems?: ComposerTaskItem[];
};



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
                    {isSelected && <Icon name="check" size={14} className="text-text-primary font-bold" />}
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

function getFileExtension(name: string): string {
    const parts = name.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

function isImageFile(file: File): boolean {
    if (file.type.startsWith('image/')) return true;
    return IMAGE_EXTENSIONS.has(getFileExtension(file.name));
}

function isCodeFile(file: File): boolean {
    return CODE_EXTENSIONS.has(getFileExtension(file.name));
}

function isAllowedFile(file: File): boolean {
    return isImageFile(file) || isCodeFile(file);
}

const CHAT_MODES = [
    { id: "Code", icon: "code" },
    { id: "Ask", icon: "chat" },
    { id: "Plan", icon: "list_alt" },
    { id: "Visual", icon: "palette" },
    { id: "Review", icon: "security" },
] as const;

export function ChatInput({
    inputValue,
    isLoading,
    uploadedFiles,
    onInputChange,
    onKeyDown,
    onSendMessage,
    onStopMessage,
    setUploadedFiles,
    selectedModel,
    setSelectedModel,
    selectedMode,
    setSelectedMode,
    pendingEdits = [],
    onAcceptAllEdits,
    onRejectAllEdits,
    onAcceptEdit,
    onRejectEdit,
    taskItems = [],
}: Omit<ChatInputProps, 'webSearch' | 'setWebSearch' | 'handleFileUpload'>) {

    const settings = useSettings();
    const shapeAuth = useShapeAuth();
    const { catalog } = useShapeCatalog();
    const allModels = getCatalogModels();
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
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
        const newHeight = Math.min(textarea.scrollHeight, 200);
        textarea.style.height = `${newHeight}px`;
    }, [inputValue]);

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
            setUploadedFiles((prev: File[]) => [...prev, ...filesToAdd]);
        }
    }, [setUploadedFiles]);

    // Handle drop events
    const handleDrop = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer.files).filter(isAllowedFile);
        if (files.length > 0) {
            setUploadedFiles((prev: File[]) => [...prev, ...files]);
        }
    }, [setUploadedFiles]);

    const handleDragOver = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    // Filter file uploads to only allowed types
    const handleFilteredFileUpload = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const allowed = Array.from(e.target.files).filter(isAllowedFile);
            if (allowed.length > 0) {
                setUploadedFiles((prev: File[]) => [...prev, ...allowed]);
            }
        }
        // Reset input so same file can be re-selected
        e.target.value = '';
    }, [setUploadedFiles]);

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
    const needsSignIn = !shapeAuth.isLoading && !shapeAuth.loggedIn;

    const usageDisplay = React.useMemo(
        () => resolveChatUsageDisplay(selectedModel, shapeAuth),
        [selectedModel, shapeAuth],
    );

    React.useEffect(() => {
        if (!isCatalogModelAllowed(selectedModel)) {
            setSelectedModel("auto");
        }
    }, [catalog, selectedModel, setSelectedModel]);

    // Build the accept string for the file input
    const acceptString = [
        ...Array.from(IMAGE_EXTENSIONS).map(ext => `.${ext}`),
        ...Array.from(CODE_EXTENSIONS).map(ext => `.${ext}`),
    ].join(',');

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

    const hasComposerChrome = pendingEdits.length > 0 || taskItems.length > 0;

    const inputPanel = (
                <div
                    className={cn(
                        "relative w-full border border-border-subtle bg-surface-3 focus-within:border-border transition-colors flex flex-col",
                        hasComposerChrome ? "rounded-2xl" : "rounded-2xl",
                        needsSignIn && "opacity-50 cursor-not-allowed pointer-events-none",
                    )}
                    onDrop={needsSignIn ? undefined : handleDrop}
                    onDragOver={needsSignIn ? undefined : handleDragOver}
                >
                <MentionPicker
                    open={mentionOpen}
                    query={mentionQuery}
                    onPick={insertMention}
                    onClose={() => setMentionOpen(false)}
                    anchorRef={textareaRef}
                    caretIndex={mentionCaret}
                />
                {/* Clip attachments/chrome without clipping the @ mention menu above */}
                <div className="flex min-h-0 flex-col overflow-hidden rounded-[inherit]">
                {/* Attachment chips — Cursor-style filename pills */}
                {uploadedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                        {uploadedFiles.map((file, i) => {
                            const isImg = isImageFile(file);
                            const objectUrl = isImg ? URL.createObjectURL(file) : null;
                            return (
                                <div
                                    key={`${file.name}-${i}`}
                                    className="group/item relative inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-border-subtle bg-panel px-1.5 py-1"
                                >
                                    {isImg && objectUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={objectUrl}
                                            alt=""
                                            className="size-6 shrink-0 rounded object-cover"
                                        />
                                    ) : (
                                        <Icon
                                            name={isCodeFile(file) ? "code" : "insert_drive_file"}
                                            size={14}
                                            className="shrink-0 text-text-muted"
                                        />
                                    )}
                                    <span className="min-w-0 truncate text-xs text-text-secondary">
                                        {file.name}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={`Remove ${file.name}`}
                                        onClick={() =>
                                            setUploadedFiles((prev: File[]) =>
                                                prev.filter((_, idx) => idx !== i),
                                            )
                                        }
                                        className="flex size-5 shrink-0 items-center justify-center rounded text-text-muted opacity-70 hover:bg-panel-hover hover:text-text-primary group-hover/item:opacity-100"
                                    >
                                        <Icon name="close" size={12} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Text Area with mention highlight overlay */}
                <div className="relative px-4 py-3">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-4 inset-y-3 overflow-hidden whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-text-primary"
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
                                const { mention } = range;
                                const label = mentionDisplayLabel(mention);
                                // Keep `raw` in the flow for caret alignment; icon overlays the leading `@`.
                                nodes.push(
                                    <span
                                        key={`m-${i}`}
                                        className="relative inline rounded-[3px] bg-accent/30 text-accent"
                                    >
                                        <span className="pointer-events-none absolute left-[2px] top-1/2 z-[1] -translate-y-1/2 opacity-95">
                                            {mention.kind === "file" ||
                                            mention.kind === "folder" ||
                                            mention.kind === "docs" ? (
                                                <FileIcon name={label} className="h-3 w-3" />
                                            ) : mention.kind === "browser" ? (
                                                <Favicon url={mention.path || label} size={12} />
                                            ) : (
                                                <Icon
                                                    name={
                                                        mention.kind === "chat"
                                                            ? "chat"
                                                            : mention.kind === "design"
                                                              ? "palette"
                                                              : mention.kind === "terminal"
                                                                ? "terminal"
                                                                : mention.kind === "branch"
                                                                  ? "account_tree"
                                                                  : mention.kind === "codebase"
                                                                    ? "search"
                                                                    : mention.kind === "selection"
                                                                      ? "code"
                                                                      : "alternate_email"
                                                    }
                                                    size={12}
                                                />
                                            )}
                                        </span>
                                        {raw}
                                    </span>,
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
                                readOnly={needsSignIn}
                                placeholder={needsSignIn ? "Sign in to use the chat" : "Ask anything…"}
                                className="relative z-[1] min-h-[28px] w-full resize-none overflow-y-auto border-none bg-transparent text-sm font-medium leading-relaxed text-transparent outline-none custom-scrollbar placeholder:text-text-muted selection:bg-accent/30"
                                style={{ caretColor: "var(--text-primary, #e5e5e5)" }}
                                rows={1}
                            />
                        </ContextMenuTrigger>
                        <ContextMenuContent
                            onCloseAutoFocus={(e) => e.preventDefault()}
                        >
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
                                        // Prefer native paste path when possible
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

                {/* Input Footer */}
                <div className="flex items-center justify-between px-2 pb-2 pt-0">
                    <div className="flex items-center gap-0.5 min-w-0">
                        {/* Attachment Controls */}
                        <div className="flex items-center">
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
                                size="icon"
                                disabled={needsSignIn}
                                onClick={() => document.getElementById('chat-media-upload')?.click()}
                                className="h-8 w-8 text-text-muted hover:text-text-primary"
                            >
                                <Icon name="add" size={16} />
                            </Button>
                        </div>

                        {/* Mode Selection */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild disabled={needsSignIn}>
                                <Button variant="secondary" size="xs" disabled={needsSignIn} className="h-8 rounded-full bg-panel-hover px-2 font-medium text-text-muted hover:text-text-primary">
                                    <span className="flex items-center gap-1.5">
                                        <Icon name={selectedModeInfo.icon} size={14} />
                                        {selectedMode}
                                    </span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-52">
                                {CHAT_MODES.map((mode) => (
                                    <DropdownMenuItem
                                        key={mode.id}
                                        onClick={() => setSelectedMode(mode.id)}
                                        className={cn(
                                            "flex items-center cursor-pointer w-full",
                                            selectedMode === mode.id && "bg-panel-hover",
                                        )}
                                    >
                                        <div className="flex items-center gap-1.5 w-full">
                                            <Icon name={mode.icon} size={16} />
                                            <span className="flex-1 font-regular text-sm text-text-primary">
                                                {mode.id}
                                            </span>
                                            {selectedMode === mode.id && (
                                                <Icon name="check" size={14} className="text-text-primary" />
                                            )}
                                        </div>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Model Selection - next to Ask */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild disabled={needsSignIn}>
                                <Button variant="ghost" size="xs" disabled={needsSignIn} className="h-8 rounded-full px-2 font-medium text-text-muted hover:text-text-primary max-w-[140px]">
                                    <div className="flex items-center gap-1.5 text-sm min-w-0">
                                        {providerIcon(selectedModel, 14)}
                                        <span className="truncate">{modelInfo.name === "auto" ? "Auto" : modelInfo.name}</span>
                                    </div>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-55 overflow-hidden">
                                <div className="relative">
                                    <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                                        <ModelItem
                                            model={autoModel}
                                            isSelected={selectedModel === "auto"}
                                            onSelect={() => setSelectedModel("auto")}
                                        />

                                        {providerOrder.filter((p) => p !== "Auto").map((provider) => {
                                            const providerModels = MODELS.filter(m => m.provider === provider);
                                            if (providerModels.length === 0) return null;
                                            return (
                                            <div key={provider} className="">
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
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {shapeAuth.loggedIn ? (
                            <Tooltip content={usageDisplay.tooltip}>
                                <button
                                    type="button"
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:text-text-primary transition-colors"
                                    onClick={() =>
                                        void import("@/lib/open-settings").then(({ openSettingsWindow }) =>
                                            openSettingsWindow({ category: "general" }),
                                        )
                                    }
                                    aria-label={usageDisplay.tooltip}
                                >
                                    <UsageRing
                                        percent={usageDisplay.percent}
                                        size={14}
                                    />
                                </button>
                            </Tooltip>
                        ) : null}
                        <button
                            onClick={isLoading ? onStopMessage : () => onSendMessage()}
                            disabled={needsSignIn || (!isLoading && !inputValue.trim() && uploadedFiles.length === 0)}
                            className={cn(
                                "flex items-center justify-center w-7 h-7 rounded-full transition-all disabled:opacity-40",
                                (inputValue.trim() || isLoading || uploadedFiles.length > 0)
                                    ? "bg-text-primary text-panel hover:opacity-90"
                                    : "bg-panel-hover text-text-muted",
                            )}
                        >
                            {isLoading ? (
                                <div className="w-2.5 h-2.5 bg-current rounded-[2px] animate-pulse" />
                            ) : (
                                <Icon name="arrow_upward" size={16} />
                            )}
                        </button>
                    </div>
                </div>
                </div>
                </div>
    );

    return (
        <div className="relative shrink-0 px-3 pb-3 pt-1">
            <div className="relative z-10 flex flex-col">
                {pendingEdits.length > 0 && onAcceptAllEdits && onRejectAllEdits ? (
                    <PendingEditsPanel
                        embedded
                        edits={pendingEdits}
                        onAcceptAll={onAcceptAllEdits}
                        onRejectAll={onRejectAllEdits}
                        onAccept={onAcceptEdit}
                        onReject={onRejectEdit}
                    />
                ) : null}
                {taskItems.length > 0 ? (
                    <div
                        className={cn(
                            "overflow-hidden border mx-2 border-border bg-panel border-b-0",
                            pendingEdits.length > 0
                                ? "rounded-none border-t-0"
                                : "rounded-t-xl",
                        )}
                    >
                        <ComposerTasksStrip items={taskItems} />
                    </div>
                ) : null}
                {needsSignIn ? (
                    <Tooltip side="top" content="Sign in to Shape to use AI chat.">
                        <div className="w-full cursor-not-allowed">{inputPanel}</div>
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



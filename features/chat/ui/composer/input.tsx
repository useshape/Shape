"use client";

import { RiAddLine, RiArrowDownSLine, RiArrowUpLine, RiBrushFill, RiCheckLine, RiSpyFill, RiMicLine, RiStopCircleLine, RiChat2Fill, RiCalendarFill, RiCommandLine } from "@remixicon/react";
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
import { MentionPicker } from "./mentions";
import { PendingEditsPanel } from "./edits";
import { ComposerContextBar, ComposerRuntimeSelect } from "./context-bar";
import {
    ComposerTasksStrip,
    type ComposerTaskItem,
} from "./activity";
import { QueuedMessagesPanel, type QueuedMessage } from "./queue";
import { ComposerAttachments, ComposerAttachmentsStrip, isImageFile, isAudioFile, type ComposerAttachment } from "./attachments";
import { MediaLightbox } from "../blocks/lightbox";
import { mentionRanges, shortenMentionTokensInText } from "@/lib/chat/mentions";
import { slashCommandRanges } from "@/lib/chat/workflows";
import { resolveChatUsageDisplay } from "@/lib/chat/usage-display";
import { getLastTurnUsage, subscribeLastTurnUsage } from "@/lib/chat/last-turn-usage";
import { UsageRing } from "./usage";
import { getVisibleModels, isApiModel, resolveChatModels, type ModelInfo } from "@/lib/settings/models";
import {
    getCatalogModels,
    getCatalogProviderOrder,
    isCatalogModelAllowed,
    useShapeCatalog,
} from "@/lib/catalog/store";
import { useSettings, hasByokApiKeys } from "@/lib/settings";
import { useShapeAuth } from "@/lib/cloud/store";
import { notify } from "@/features/notifications";
import { SearchInput } from "@/components/ui/search";

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



function formatContextWindow(raw?: string): string {
    const t = (raw ?? "").trim();
    if (!t) return "";
    return t.replace(/([0-9.]+)\s*K\b/i, "$1k").replace(/([0-9.]+)\s*M\b/i, "$1m");
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
    const effortName = effortLabel(effort).toLowerCase();

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
    { id: "Code", icon: RiCommandLine, color: "#3B82F6", bg: "rgba(59, 130, 246, 0.16)", description: "Build and edit files in the project" },
    { id: "Ask", icon: RiChat2Fill, color: "#22C55E", bg: "rgba(34, 197, 94, 0.16)", description: "Answer questions without making changes" },
    { id: "Plan", icon: RiCalendarFill, color: "#F97316", bg: "rgba(249, 115, 22, 0.16)", description: "Create a plan before proceeding" },
    { id: "Visual", icon: RiBrushFill, color: "#F43F5E", bg: "rgba(244, 63, 94, 0.16)", description: "Design and iterate on the UI" },
    { id: "Review", icon: RiSpyFill, color: "#A855F7", bg: "rgba(168, 85, 247, 0.16)", description: "Review code for bugs and edge cases" },
] as const;

const COMPOSER_HINTS = [
    "@ files, / for workflows",
    "Visual: ask to see a few button styles first",
    "Drop a screenshot to redesign",
    "Ask with @codebase before you build",
    "Paste a stack trace to debug",
    "Review a PR or file for edge cases",
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
        const wOld = measureOldRef.current?.getBoundingClientRect().width ?? 0;
        const natural = leaving ? Math.max(wOld, wNew) : wNew;

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

function ModeMenu({
    compactTrigger,
    selectedMode,
    setSelectedMode,
    disabled,
}: {
    compactTrigger?: boolean;
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
                    className={cn(
                        "font-medium text-[color:var(--mode-fg)] bg-[var(--mode-bg)] hover:bg-[var(--mode-bg)] hover:text-[color:var(--mode-fg)] hover:brightness-110",
                        "transition-[color,background-color,filter] duration-200 ease-[var(--ease-out)]",
                        compactTrigger ? "h-7 gap-1 rounded-full px-1.5" : "h-8 px-2",
                    )}
                    style={{
                        ["--mode-fg" as string]: selected.color,
                        ["--mode-bg" as string]: selected.bg,
                    }}
                    aria-label={selected.id}
                >
                    <div className="flex items-center gap-1.5 text-sm ">
                        <Icon icon={selected.icon} style={{ color: selected.color }} />
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

function VoiceInputButton({
    disabled,
    onTranscript,
}: {
    disabled?: boolean;
    onTranscript: (text: string) => void;
}) {
    const [listening, setListening] = React.useState(false);
    const recRef = React.useRef<{ stop: () => void } | null>(null);

    const toggle = () => {
        const w = window as typeof window & {
            SpeechRecognition?: new () => {
                continuous: boolean;
                interimResults: boolean;
                onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
                onend: (() => void) | null;
                onerror: (() => void) | null;
                start: () => void;
                stop: () => void;
            };
            webkitSpeechRecognition?: new () => {
                continuous: boolean;
                interimResults: boolean;
                onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
                onend: (() => void) | null;
                onerror: (() => void) | null;
                start: () => void;
                stop: () => void;
            };
        };
        const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
        if (!SR) {
            notify.warn("Voice input isn't available in this window.");
            return;
        }
        if (listening) {
            recRef.current?.stop();
            setListening(false);
            return;
        }
        const rec = new SR();
        rec.continuous = false;
        rec.interimResults = false;
        rec.onresult = (e) => {
            const text = Array.from(e.results)
                .map((r) => r[0]?.transcript ?? "")
                .join(" ")
                .trim();
            if (text) onTranscript(text);
        };
        rec.onend = () => setListening(false);
        rec.onerror = () => setListening(false);
        rec.start();
        recRef.current = rec;
        setListening(true);
    };

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={toggle}
            aria-label={listening ? "Stop listening" : "Voice input"}
            className={cn(
                "size-8 shrink-0 text-text-muted hover:text-text-primary",
                listening && "text-accent hover:text-accent",
            )}
        >
            <Icon icon={listening ? RiStopCircleLine : RiMicLine} />
        </Button>
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
    const allModels = resolveChatModels(getCatalogModels(), {
        openaiKey: Boolean(settings.ai.openaiApiKey.trim()),
        openRouterKey: Boolean(settings.ai.openRouterApiKey.trim()),
        signedIn: Boolean(shapeAuth.loggedIn && !shapeAuth.offline),
    });
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

    const [modelQuery, setModelQuery] = React.useState("");
    const MODELS = getVisibleModels(allModels, settings.ai.enabledModels);
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
    const modelName =
        selectedModel === "auto" || modelInfo.name === "auto" ? "Auto" : modelInfo.name;
    const modelTriggerLabel = compact
        ? modelName
        : [modelName, effortLabel(reasoningEffort), fastMode ? "Fast" : null]
            .filter(Boolean)
            .join(" ");
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

    const inputPanel = (
                <div
                    className={cn(
                        "relative flex w-full flex-col border border-border-subtle bg-surface-4 transition-colors focus-within:border-border",
                        compact ? "squircle-full h-12 px-0.5" : "squircle-3xl",
                        dragOver && "border-border-subtle bg-surface-3/80",
                        needsSignIn && "cursor-default",
                    )}
                    ref={composerBoxRef}
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
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => document.getElementById("chat-media-upload")?.click()}
                            className="size-8 ml-0.5 shrink-0 p-0 rounded-full text-text-muted hover:text-text-primary"
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
                                return inputValue.endsWith("\n") ? `${inputValue}\n` : inputValue || "\u00a0";
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
                            if (inputValue.endsWith("\n")) nodes.push("\n");
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
                                    const overlay = mentionOverlayRef.current;
                                    if (overlay) overlay.scrollTop = e.currentTarget.scrollTop;
                                }}
                                placeholder=""
                                aria-label={
                                    needsSignIn
                                        ? "Sign in to use the chat"
                                        : COMPOSER_HINTS[0]
                                }
                                rows={1}
                                className={cn(
                                    "relative z-[1] w-full resize-none overflow-y-auto border-none bg-transparent text-sm font-medium text-transparent outline-none custom-scrollbar placeholder:text-text-muted selection:bg-accent/30 whitespace-pre-wrap break-words",
                                    compact ? "h-7 min-h-7 max-h-7 p-0 leading-7" : "min-h-7 leading-relaxed",
                                )}
                                style={{ caretColor: "var(--text-primary)" }}
                            />
                        </ContextMenuTrigger>
                        <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
                            <ContextMenuItem
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
                            onClick={() => document.getElementById("chat-media-upload")?.click()}
                            className="size-8 shrink-0 p-0 text-text-muted hover:text-text-primary"
                            aria-label="Attach file"
                        >
                            <Icon icon={RiAddLine} />
                        </Button>
                        <ModeMenu
                            selectedMode={selectedMode}
                            setSelectedMode={setSelectedMode}
                        />
                    </div>
                    ) : null}

                    <div className="flex shrink-0 items-center gap-0.5">
                        {compact ? (
                            <ModeMenu
                                compactTrigger
                                selectedMode={selectedMode}
                                setSelectedMode={setSelectedMode}
                            />
                        ) : null}
                        <DropdownMenu
                            onOpenChange={(open) => {
                                if (!open) setModelQuery("");
                            }}
                        >
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    className={cn(
                                        "h-8 font-normal text-text-foreground font-medium hover:text-text-primary",
                                        compact ? "max-w-[132px] px-1.5" : "max-w-[260px] px-2",
                                    )}
                                    aria-label={modelTriggerLabel}
                                >
                                    {compact ? (
                                        <div className="flex min-w-0 max-w-[120px] items-center gap-1 text-sm">
                                            {providerIcon(selectedModel === "auto" ? "auto" : modelInfo.id, 14)}
                                            <span className="min-w-0 truncate">{modelName}</span>
                                            <Icon icon={RiArrowDownSLine} className="shrink-0 opacity-60" />
                                        </div>
                                    ) : (
                                        <div className="flex min-w-0 items-center gap-1.5 text-sm">
                                            {providerIcon(selectedModel === "auto" ? "auto" : modelInfo.id, 14)}
                                            <span className="min-w-0 truncate">{modelName}</span>
                                            {isApiModel(modelInfo) ? (
                                                <span className="shrink-0 text-sm font-normal text-text-muted">API</span>
                                            ) : null}
                                            <SwapText value={effortLabel(reasoningEffort)} />
                                            <SwapText value={fastMode ? "Fast" : ""} />
                                            <Icon icon={RiArrowDownSLine} className="shrink-0 opacity-60" />
                                        </div>
                                    )}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[200px]">
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
                                        <span className="flex min-w-0 items-center gap-1 text-sm text-text-muted">
                                            <SwapText value={effortLabel(reasoningEffort)} />
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
                                        {modelMatches(autoModel) ? (
                                            <ModelItem
                                                model={autoModel}
                                                isSelected={selectedModel === "auto"}
                                                onSelect={() => setSelectedModel("auto")}
                                                effort={reasoningEffort}
                                            />
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
                                                        const allowed = isCatalogModelAllowed(m.id) || isApiModel(m);
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
                                        {!modelMatches(autoModel) &&
                                        !MODELS.some(modelMatches) ? (
                                            <div className="px-2.5 py-3 text-sm text-text-muted">
                                                No models match
                                            </div>
                                        ) : null}
                                    </div>
                                </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <VoiceInputButton
                            onTranscript={(text) => {
                                const el = textareaRef.current;
                                if (!el) return;
                                const next = inputValue.trim() ? `${inputValue.trim()} ${text}` : text;
                                const native = Object.getOwnPropertyDescriptor(
                                    HTMLTextAreaElement.prototype,
                                    "value",
                                )?.set;
                                native?.call(el, next);
                                el.dispatchEvent(new Event("input", { bubbles: true }));
                            }}
                        />
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

    const usageChip = (
        <Tooltip content={usageDisplay.tooltip}>
            <button
                type="button"
                className="flex h-6 shrink-0 items-center gap-1.5 rounded-md px-1 text-sm text-text-muted hover:text-text-primary"
                onClick={() =>
                    void import("@/lib/window/open-settings").then(({ openSettingsWindow }) =>
                        openSettingsWindow({ category: "account" }),
                    )
                }
                aria-label={usageDisplay.tooltip}
            >
                <UsageRing percent={usageDisplay.percent} size={16} />
                <span className="tabular-nums">{usageDisplay.percent}%</span>
            </button>
        </Tooltip>
    );

    const contextExtras = (
        <>
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
            {taskItems.length > 0 ? <ComposerTasksStrip items={taskItems} /> : null}
        </>
    );

    return (
        <div
            className={cn(
                "relative shrink-0 overflow-visible",
                variant === "empty" ? "w-full px-0 pb-0 pt-0" : "px-0 pb-3 pt-0",
            )}
        >
            <div className="relative z-10 overflow-visible">
                {compact && uploadedFiles.length > 0 ? (
                    <div className="mb-2">
                        <ComposerAttachmentsStrip
                            attachments={uploadedFiles}
                            onRemove={(id) =>
                                setUploadedFiles((prev) => prev.filter((a) => a.id !== id))
                            }
                        />
                    </div>
                ) : null}
                {compact ? (
                    <>
                        <div className="relative">
                            {inputPanel}
                        </div>
                        <div className="relative flex min-w-0 items-center gap-2 px-2 pt-1.5">
                            {contextExtras}
                            <ComposerContextBar compact className="min-w-0 flex-1" />
                            <div className="flex shrink-0 items-center gap-0.5">
                                <ComposerRuntimeSelect compact />
                                {usageChip}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="relative flex flex-col">
                        <div className="relative z-0 -mb-2.5 flex items-end mx-4 squircle-t-2xl! border border-b-0 border-border-subtle bg-surface-3 px-2 pt-1 pb-3.5">
                            <div className="flex h-7 w-full min-w-0 items-center gap-1">
                                {contextExtras}
                                <ComposerContextBar compact className="min-w-0 flex-1" />
                                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                                    <ComposerRuntimeSelect compact />
                                    {usageChip}
                                </div>
                            </div>
                        </div>
                        <div className="relative z-10">{inputPanel}</div>
                    </div>
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



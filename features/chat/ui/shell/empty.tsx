"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";
import { PluginLogo } from "@/components/ui/plugin-logo";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Checkmark20Regular } from "@fluentui/react-icons/headless/svg/checkmark";
import { useProjectState } from "@/lib/backend";
import { fetchPlugins, peekPluginsCache, subscribePlugins, type PluginRow } from "@/lib/plugins/api";
import { getRepoName } from "@/lib/workspace/repo-history";
import {
    setWorkspaceMode,
    useWorkspaceMode,
    WORKSPACE_MODES,
    workspaceMode,
} from "@/lib/ui/workspace-mode";

/** Drop image files here. The card stays a card if the file is missing. */
const HOME_CARD_MEDIA = {
    generateImage: "/home/generate.jpg",
    generateSvg: "/home/svg.png",
} as const;

export function ChatEmptyState() {
    const modeId = useWorkspaceMode();
    const mode = workspaceMode(modeId);
    const { project_path } = useProjectState();
    const folder = modeId === "Code" && project_path ? getRepoName(project_path) : null;

    return (
        <div className="flex w-full items-center justify-center px-2">
            <h1 className="flex min-w-0 flex-wrap items-baseline justify-center gap-x-2 text-3xl leading-tight text-text-primary">
                <span>What do you want to</span>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="underline decoration-text-muted underline-offset-4 hover:decoration-text-primary"
                        >
                            {mode.verb}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72">
                        {WORKSPACE_MODES.map((item) => (
                            <DropdownMenuItem key={item.id} onSelect={() => setWorkspaceMode(item.id)}>
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span>{item.id}</span>
                                    <span className="text-xs text-text-muted">{item.description}</span>
                                </span>
                                {item.id === modeId ? (
                                    <Icon icon={Checkmark20Regular} className="text-text-muted" />
                                ) : null}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                {folder ? <span>in {folder}</span> : null}
            </h1>
        </div>
    );
}

const EMPTY_PLUGINS: PluginRow[] = [];
let connectedCache: { source: PluginRow[] | null; list: PluginRow[] } = {
    source: null,
    list: EMPTY_PLUGINS,
};

function connectedPluginsSnapshot() {
    const plugins = peekPluginsCache()?.plugins ?? null;
    if (connectedCache.source === plugins) return connectedCache.list;
    const list = (plugins ?? []).filter((plugin) => plugin.connected).slice(0, 4);
    connectedCache = { source: plugins, list };
    return list;
}

function useConnectedPlugins() {
    const plugins = useSyncExternalStore(subscribePlugins, connectedPluginsSnapshot, () => EMPTY_PLUGINS);
    useEffect(() => {
        void fetchPlugins().catch(() => {});
    }, []);
    return plugins;
}

/** Stacked backdrop blurs, each masked to a band, so the photo ramps instead of fading hard. */
function ProgressiveBlur() {
    const layers = [
        { blur: 1, mask: "linear-gradient(to bottom, transparent 0%, black 18%, black 42%, transparent 62%)" },
        { blur: 3, mask: "linear-gradient(to bottom, transparent 20%, black 40%, black 62%, transparent 78%)" },
        { blur: 8, mask: "linear-gradient(to bottom, transparent 38%, black 58%, black 78%, transparent 90%)" },
        { blur: 18, mask: "linear-gradient(to bottom, transparent 55%, black 74%, black 100%)" },
        { blur: 36, mask: "linear-gradient(to bottom, transparent 70%, black 88%, black 100%)" },
    ];
    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5" aria-hidden>
            {layers.map((layer) => (
                <div
                    key={layer.blur}
                    className="absolute inset-0"
                    style={{
                        backdropFilter: `blur(${layer.blur}px)`,
                        WebkitBackdropFilter: `blur(${layer.blur}px)`,
                        maskImage: layer.mask,
                        WebkitMaskImage: layer.mask,
                    }}
                />
            ))}
            <div
                className="absolute inset-0 bg-linear-to-t from-black/55 to-transparent"
                style={{
                    maskImage: "linear-gradient(to bottom, transparent 30%, black 100%)",
                    WebkitMaskImage: "linear-gradient(to bottom, transparent 30%, black 100%)",
                }}
            />
        </div>
    );
}

function CardCaption({ title, body }: { title: string; body: string }) {
    return (
        <div className="absolute inset-x-0 bottom-0 z-10 p-4">
            <div className="text-base font-medium text-text-primary">{title}</div>
            <div className="mt-0.5 text-sm text-text-muted">{body}</div>
        </div>
    );
}

function PhotoCard({
    src,
    title,
    body,
    onOpen,
}: {
    src: string;
    title: string;
    body: string;
    onOpen: () => void;
}) {
    const [missing, setMissing] = useState(false);
    return (
        <div className="relative aspect-[4/3] w-full overflow-hidden squircle-2xl bg-surface-4">
            <button type="button" onClick={onOpen} className="absolute inset-0 text-left">
                {missing ? null : (
                    <img
                        src={src}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={() => setMissing(true)}
                    />
                )}
                <ProgressiveBlur />
                <CardCaption title={title} body={body} />
            </button>
        </div>
    );
}

export function HomeStarterCards({ onPick }: { onPick: (prompt: string) => void }) {
    const plugins = useConnectedPlugins();

    return (
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
            <PhotoCard
                src={HOME_CARD_MEDIA.generateImage}
                title="Generate an image"
                body="A picture from a short description"
                onOpen={() => onPick("Generate an image of ")}
            />
            <PhotoCard
                src={HOME_CARD_MEDIA.generateSvg}
                title="Generate an SVG"
                body="A vector mark or icon"
                onOpen={() => onPick("Generate an SVG of ")}
            />
            <div className="relative aspect-[4/3] w-full overflow-hidden squircle-2xl bg-surface-4">
                <button
                    type="button"
                    onClick={() => onPick("Refine this image ")}
                    className="absolute inset-0 text-left"
                >
                    <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-4">
                        {plugins.map((plugin) => (
                            <PluginLogo
                                key={plugin.toolkit}
                                toolkit={plugin.toolkit}
                                name={plugin.name}
                                logo={plugin.logo}
                                size={28}
                                className="rounded-md"
                            />
                        ))}
                    </div>
                    <CardCaption
                        title="Connected plugins"
                        body="Give the agent deeper access to the tools you need"
                    />
                </button>
            </div>
        </div>
    );
}

"use client";

import { Airplane20Regular } from "@fluentui/react-icons/headless/svg/airplane";
import { Beaker20Regular } from "@fluentui/react-icons/headless/svg/beaker";
import { Book20Regular } from "@fluentui/react-icons/headless/svg/book";
import { Bookmark20Regular } from "@fluentui/react-icons/headless/svg/bookmark";
import { Bot20Regular } from "@fluentui/react-icons/headless/svg/bot";
import { Bug20Regular } from "@fluentui/react-icons/headless/svg/bug";
import { Calendar20Regular } from "@fluentui/react-icons/headless/svg/calendar";
import { Camera20Regular } from "@fluentui/react-icons/headless/svg/camera";
import { Cloud20Regular } from "@fluentui/react-icons/headless/svg/cloud";
import { Code20Regular } from "@fluentui/react-icons/headless/svg/code";
import { Flag20Regular } from "@fluentui/react-icons/headless/svg/flag";
import { Flash20Regular } from "@fluentui/react-icons/headless/svg/flash";
import { Gift20Regular } from "@fluentui/react-icons/headless/svg/gift";
import { Globe20Regular } from "@fluentui/react-icons/headless/svg/globe";
import { Heart20Regular } from "@fluentui/react-icons/headless/svg/heart";
import { Home20Regular } from "@fluentui/react-icons/headless/svg/home";
import { Key20Regular } from "@fluentui/react-icons/headless/svg/key";
import { LeafOne20Regular } from "@fluentui/react-icons/headless/svg/leaf-one";
import { Lightbulb20Regular } from "@fluentui/react-icons/headless/svg/lightbulb";
import { Mail20Regular } from "@fluentui/react-icons/headless/svg/mail";
import { MusicNote220Regular } from "@fluentui/react-icons/headless/svg/music-note";
import { People20Regular } from "@fluentui/react-icons/headless/svg/people";
import { Planet20Regular } from "@fluentui/react-icons/headless/svg/planet";
import { Rocket20Regular } from "@fluentui/react-icons/headless/svg/rocket";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { Shield20Regular } from "@fluentui/react-icons/headless/svg/shield";
import { Sparkle20Regular } from "@fluentui/react-icons/headless/svg/sparkle";
import { Star20Regular } from "@fluentui/react-icons/headless/svg/star";
import { Target20Regular } from "@fluentui/react-icons/headless/svg/target";
import { Trophy20Regular } from "@fluentui/react-icons/headless/svg/trophy";
import { Wrench20Regular } from "@fluentui/react-icons/headless/svg/wrench";
import { useMemo, useState } from "react";
import { Icon, type IconGlyph } from "@/components/ui/icon";
import {
    AlertDialog,
    AlertDialogBody,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
    CHAT_COLORS,
    CHAT_COLOR_HEX,
    COLLECTION_ICONS,
    createCollection,
    updateCollection,
    type ChatCollection,
    type ChatColor,
    type CollectionIcon,
} from "@/lib/sidebar/chat-list-meta";

export const COLLECTION_GLYPH: Record<CollectionIcon, IconGlyph> = {
    star: Star20Regular,
    flag: Flag20Regular,
    bookmark: Bookmark20Regular,
    rocket: Rocket20Regular,
    lightbulb: Lightbulb20Regular,
    beaker: Beaker20Regular,
    code: Code20Regular,
    book: Book20Regular,
    heart: Heart20Regular,
    target: Target20Regular,
    home: Home20Regular,
    people: People20Regular,
    calendar: Calendar20Regular,
    camera: Camera20Regular,
    cloud: Cloud20Regular,
    globe: Globe20Regular,
    mail: Mail20Regular,
    shield: Shield20Regular,
    bug: Bug20Regular,
    gift: Gift20Regular,
    key: Key20Regular,
    trophy: Trophy20Regular,
    bot: Bot20Regular,
    sparkle: Sparkle20Regular,
    planet: Planet20Regular,
    flash: Flash20Regular,
    music: MusicNote220Regular,
    leaf: LeafOne20Regular,
    wrench: Wrench20Regular,
    airplane: Airplane20Regular,
};

export function CollectionDialog({
    chatIds,
    existing,
    onClose,
}: {
    chatIds: string[];
    existing?: ChatCollection | null;
    onClose: () => void;
}) {
    const [step, setStep] = useState(0);
    const [name, setName] = useState(existing?.name ?? "");
    const [icon, setIcon] = useState<CollectionIcon>(existing?.icon ?? "star");
    const [color, setColor] = useState<ChatColor>(existing?.color ?? "blue");
    const [query, setQuery] = useState("");
    const icons = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return COLLECTION_ICONS.filter((id) => !needle || id.includes(needle));
    }, [query]);

    const finish = () => {
        if (existing) {
            updateCollection(existing.id, { name: name.trim() || existing.name, icon, color });
        } else if (chatIds.length > 0) {
            createCollection({ name: name.trim() || "Collection", icon, color, chatIds });
        }
        onClose();
    };

    return (
        <AlertDialog open onOpenChange={(next) => { if (!next) onClose(); }}>
            <AlertDialogContent sizeClassName="max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {step === 0 ? "Name the collection" : step === 1 ? "Choose an icon" : "Choose a color"}
                    </AlertDialogTitle>
                </AlertDialogHeader>
                <AlertDialogBody>
                {step === 0 ? (
                    <input
                        autoFocus
                        value={name}
                        placeholder="Collection name"
                        onChange={(event) => setName(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") setStep(1);
                        }}
                        className="h-9 rounded-md bg-transparent px-2 text-sm text-text-primary outline-none ring-1 ring-border"
                    />
                ) : null}
                {step === 1 ? (
                    <>
                        <div className="flex items-center gap-2 rounded-md px-2 ring-1 ring-border">
                            <Icon icon={Search20Regular} className="icon-sm text-text-muted" />
                            <input
                                autoFocus
                                value={query}
                                placeholder="Search icons"
                                onChange={(event) => setQuery(event.target.value)}
                                className="h-9 min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none"
                            />
                        </div>
                        <div className="grid max-h-52 grid-cols-6 gap-1 overflow-y-auto">
                            {icons.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    aria-label={id}
                                    aria-pressed={icon === id}
                                    onClick={() => setIcon(id)}
                                    className={cn(
                                        "flex h-9 items-center justify-center rounded-md hover:bg-panel-hover",
                                        icon === id && "bg-panel-active",
                                    )}
                                >
                                    <Icon icon={COLLECTION_GLYPH[id]} className="icon-sm" style={{ color: CHAT_COLOR_HEX[color] }} />
                                </button>
                            ))}
                        </div>
                    </>
                ) : null}
                {step === 2 ? (
                    <div className="flex flex-wrap gap-2 py-2">
                        {CHAT_COLORS.map((entry) => (
                            <button
                                key={entry}
                                type="button"
                                aria-label={entry}
                                aria-pressed={color === entry}
                                onClick={() => setColor(entry)}
                                className={cn(
                                    "size-7 rounded-full",
                                    color === entry && "ring-2 ring-text-primary ring-offset-2 ring-offset-surface-2",
                                )}
                                style={{ background: CHAT_COLOR_HEX[entry] }}
                            />
                        ))}
                    </div>
                ) : null}
                </AlertDialogBody>
                <AlertDialogFooter>
                    {step === 0 ? (
                        <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setStep((value) => value - 1)}
                            className="h-8 rounded-md px-3 text-sm text-text-muted hover:bg-panel-hover hover:text-text-primary"
                        >
                            Back
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => (step === 2 ? finish() : setStep((value) => value + 1))}
                        className="h-8 rounded-md bg-accent px-3 text-sm text-accent-fg"
                    >
                        {step === 2 ? (existing ? "Save" : "Create") : "Next"}
                    </button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

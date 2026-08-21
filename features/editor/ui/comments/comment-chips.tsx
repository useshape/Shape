"use client";

import { FileIcon } from "@/components/ui/file-icon";
import { Favicon } from "@/components/ui/favicon";
import { Icon } from "@/components/ui/icon";
import { commands } from "@/lib/backend";
import { resolveGithubAvatarUrl } from "@/lib/git/github-avatar";
import { openProjectFile } from "@/lib/open-project-file";
import type { CommentTag } from "@/lib/editor-comments";
import { cn } from "@/lib/utils";

export function CommentChips({
    tags,
    onRemove,
}: {
    tags: CommentTag[];
    onRemove?: (index: number) => void;
}) {
    if (tags.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-1">
            {tags.map((tag, index) => (
                <CommentChip
                    key={`${tag.kind}-${index}-${tag.kind === "file" ? tag.path : tag.kind === "url" ? tag.href : tag.name}`}
                    tag={tag}
                    onRemove={onRemove ? () => onRemove(index) : undefined}
                />
            ))}
        </div>
    );
}

export function CommentChip({
    tag,
    onRemove,
}: {
    tag: CommentTag;
    onRemove?: () => void;
}) {
    if (tag.kind === "file") {
        return (
            <span
                className="chat-link-chip cursor-pointer"
                title={tag.path}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void openProjectFile(tag.path, tag.label);
                }}
            >
                <span className="chat-link-favicon">
                    <FileIcon name={tag.label} className="h-3 w-3" />
                </span>
                <span className="truncate">{tag.label}</span>
                <ChipRemove onRemove={onRemove} />
            </span>
        );
    }

    if (tag.kind === "url") {
        return (
            <span
                className="chat-link-chip cursor-pointer"
                title={tag.href}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void commands.openUrlExternal(tag.href);
                }}
            >
                <span className="chat-link-favicon">
                    <Favicon url={tag.href} size={12} />
                </span>
                <span className="truncate">{tag.label}</span>
                <ChipRemove onRemove={onRemove} />
            </span>
        );
    }

    const avatar = tag.avatarUrl || resolveGithubAvatarUrl(tag.email, tag.login || tag.name, 32);
    return (
        <span className="chat-link-chip" title={tag.email || tag.name}>
            <span className="chat-link-favicon">
                {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" width={12} height={12} className="h-3 w-3 rounded-sm object-cover" />
                ) : (
                    <Icon name="person" size={12} className="text-text-muted" />
                )}
            </span>
            <span className="truncate">{tag.name}</span>
            <ChipRemove onRemove={onRemove} />
        </span>
    );
}

function ChipRemove({ onRemove }: { onRemove?: () => void }) {
    if (!onRemove) return null;
    return (
        <span
            role="button"
            tabIndex={-1}
            className={cn(
                "ml-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-sm",
                "text-text-muted hover:bg-panel-hover hover:text-text-primary",
            )}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove();
            }}
        >
            <Icon name="close" size={10} />
        </span>
    );
}

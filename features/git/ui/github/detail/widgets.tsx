"use client";

import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend";
import { GitMarkdown, type GitMarkdownCtx } from "../markdown";
import type { Comment, Person } from "./types";
import { formatRelative } from "./types";

export function StateBadge({ status, merged }: { status?: string; merged?: boolean }) {
    if (merged) {
        return (
            <span className="inline-flex shrink-0 items-center rounded-full bg-accent/20 px-2 py-0.5 text-2xs font-medium text-accent">
                Merged
            </span>
        );
    }
    const s = (status || "").toLowerCase();
    const tone =
        s === "open"
            ? "bg-success/15 text-success"
            : s === "closed"
              ? "bg-error/15 text-error"
              : "bg-panel-hover text-text-muted";
    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-2xs font-medium capitalize",
                tone,
            )}
        >
            {status || "unknown"}
        </span>
    );
}

export function Avatar({
    person,
    size = 20,
    className,
}: {
    person?: Person | null;
    size?: number;
    className?: string;
}) {
    if (!person?.login) {
        return (
            <span
                className={cn("shrink-0 rounded-full bg-panel-hover", className)}
                style={{ width: size, height: size }}
            />
        );
    }
    const src =
        person.avatar_url || `https://github.com/${person.login}.png?size=${size * 2}`;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt=""
            width={size}
            height={size}
            className={cn("shrink-0 rounded-full", className)}
            loading="lazy"
        />
    );
}

export function openGitHubUser(login?: string | null) {
    if (!login) return;
    void commands.openUrlExternal(`https://github.com/${login}`);
}

export function SidebarSection({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="px-3 py-3 last:border-b-0">
            <div className="mb-1.5 text-sm font-medium text-text-muted">{title}</div>
            <div className="text-sm text-text-primary">{children}</div>
        </div>
    );
}

/** Reddit-style thread row: avatar + vertical line outside, card with username inside. */
export function ThreadMessage({
    person,
    association,
    when,
    children,
    isLast,
}: {
    person?: Person | null;
    association?: string;
    when?: string;
    children: React.ReactNode;
    isLast?: boolean;
}) {
    return (
        <div className={cn("flex gap-3", !isLast && "pb-3")}>
            <div className="flex w-8 shrink-0 flex-col items-center">
                <button
                    type="button"
                    className="shrink-0 rounded-full outline-none ring-border-focus hover:opacity-90 focus-visible:ring-1"
                    onClick={() => openGitHubUser(person?.login)}
                    title={person?.login ? `Open @${person.login}` : undefined}
                >
                    <Avatar person={person} size={32} />
                </button>
                {!isLast ? (
                    <div
                        aria-hidden
                        className="mt-1 w-px min-h-4 flex-1 bg-border-subtle"
                    />
                ) : null}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border-subtle bg-surface-2">
                <div className="flex items-center gap-2 px-3 py-2">
                    <button
                        type="button"
                        className="text-sm font-medium text-text-primary hover:text-accent hover:underline"
                        onClick={() => openGitHubUser(person?.login)}
                    >
                        {person?.login ?? "unknown"}
                    </button>
                    {association && association !== "NONE" ? (
                        <span className="rounded-lg bg-surface-3 px-1.5 py-0.5 text-xs text-text-muted">
                            {association.toLowerCase().replace(/_/g, " ")}
                        </span>
                    ) : null}
                    {when ? (
                        <span className="ml-auto text-2xs text-text-muted">{when}</span>
                    ) : null}
                </div>
                <div className="min-w-0 overflow-x-auto px-3 pb-3">{children}</div>
            </div>
        </div>
    );
}

export function CommentCard({
    comment,
    ctx,
    isLast,
}: {
    comment: Comment;
    ctx?: GitMarkdownCtx;
    isLast?: boolean;
}) {
    return (
        <ThreadMessage
            person={comment.user}
            association={comment.author_association}
            when={formatRelative(comment.created_at)}
            isLast={isLast}
        >
            <GitMarkdown content={comment.body || ""} ctx={ctx} />
        </ThreadMessage>
    );
}

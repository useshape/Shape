"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { commands, useProjectState } from "@/lib/backend";
import { getShapeAccessToken } from "@/lib/cloud/store";
import { notify } from "@/features/notifications";
import { loginGitHub, useGitHubAuth } from "@/lib/github/store";
import {
    GenerateStarButton,
    streamTextInto,
} from "@/features/git/ui/shared/generate-star";
import { cn } from "@/lib/utils";

function parseDraft(raw: string): { title: string; body: string } {
    const text = raw.trim();
    const nl = text.indexOf("\n");
    if (nl < 0) return { title: text.slice(0, 72), body: "" };
    return {
        title: text.slice(0, nl).replace(/^#+\s*/, "").trim().slice(0, 120),
        body: text.slice(nl + 1).trim(),
    };
}

export function CreatePullRequestDialog({
    open,
    onOpenChange,
    owner,
    repo,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    owner: string | null;
    repo: string | null;
    onCreated?: (url: string, number: number) => void;
}) {
    const { project_path } = useProjectState();
    const auth = useGitHubAuth();
    const [base, setBase] = useState("main");
    const [head, setHead] = useState("");
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [drafting, setDrafting] = useState(false);
    const [publishing, setPublishing] = useState(false);

    const loadRefs = useCallback(async () => {
        if (!project_path) return;
        try {
            const current = await commands.gitCurrentBranch(project_path);
            setHead(current);
        } catch {
            /* ignore */
        }
        if (owner && repo && auth.loggedIn) {
            try {
                const raw = await commands.githubApiGet(`/repos/${owner}/${repo}`);
                const data = typeof raw === "string" ? JSON.parse(raw) : raw;
                const def = (data as { default_branch?: string }).default_branch;
                if (def) setBase(def);
            } catch {
                /* keep main */
            }
        }
    }, [auth.loggedIn, owner, project_path, repo]);

    useEffect(() => {
        if (!open) return;
        setTitle("");
        setBody("");
        void loadRefs();
    }, [loadRefs, open]);

    const draft = async () => {
        if (!project_path || !head || !base) return;
        const token = getShapeAccessToken();
        if (!token) {
            notify.error("AI Error", "Sign in to Shape to draft a pull request.");
            return;
        }
        setDrafting(true);
        try {
            const raw = await commands.draftPullRequest(base, head, {
                repoPath: project_path,
                accessToken: token,
            });
            const next = parseDraft(raw);
            setTitle("");
            setBody("");
            await streamTextInto(next.title, setTitle);
            if (next.body) {
                await streamTextInto(next.body, setBody, { msPerChar: 4 });
            }
            void import("@/lib/cloud/store")
                .then(({ refreshShapeAuth }) => {
                    void refreshShapeAuth();
                })
                .catch(() => undefined);
        } catch (err) {
            notify.error("AI Error", err instanceof Error ? err.message : String(err));
        } finally {
            setDrafting(false);
        }
    };

    const publish = async () => {
        if (!owner || !repo || !title.trim() || !head || !base) return;
        if (!auth.loggedIn) {
            void loginGitHub();
            return;
        }
        setPublishing(true);
        try {
            const raw = await commands.githubApiRequest(
                "POST",
                `/repos/${owner}/${repo}/pulls`,
                JSON.stringify({
                    title: title.trim(),
                    body: body.trim(),
                    head,
                    base,
                }),
            );
            const data = typeof raw === "string" ? JSON.parse(raw) : raw;
            const url = String((data as { html_url?: string }).html_url ?? "");
            const number = Number((data as { number?: number }).number);
            notify.success("Pull request", url ? `Opened #${number}` : "Created");
            onOpenChange(false);
            if (url && Number.isFinite(number)) onCreated?.(url, number);
            if (url) void commands.openUrlExternal(url);
        } catch (err) {
            notify.error("GitHub", err instanceof Error ? err.message : String(err));
        } finally {
            setPublishing(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-lg">
                <AlertDialogHeader>
                    <AlertDialogTitle>Create pull request</AlertDialogTitle>
                    <AlertDialogDescription>
                        Compare branches and publish a pull request to GitHub.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex flex-col gap-2 px-1">
                    <div className="grid grid-cols-2 gap-2">
                        <label className="flex min-w-0 flex-col gap-1 text-xs text-text-muted">
                            Base
                            <Input value={base} onChange={(e) => setBase(e.target.value)} className="h-8" />
                        </label>
                        <label className="flex min-w-0 flex-col gap-1 text-xs text-text-muted">
                            Compare
                            <Input value={head} onChange={(e) => setHead(e.target.value)} className="h-8" />
                        </label>
                    </div>
                    <div
                        className={cn(
                            "relative",
                            drafting && "git-generate-shimmer rounded-md",
                        )}
                    >
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Title"
                            className="h-8 pr-9"
                        />
                        <GenerateStarButton
                            className="absolute right-0.5 top-1/2 -translate-y-1/2"
                            loading={drafting}
                            disabled={!head || !base}
                            onClick={() => void draft()}
                        />
                    </div>
                    <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Description"
                        className="min-h-32 text-sm"
                    />
                </div>
                <AlertDialogFooter>
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        disabled={publishing || !title.trim() || !head || !base}
                        onClick={() => void publish()}
                    >
                        {publishing ? "Creating…" : "Create PR"}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

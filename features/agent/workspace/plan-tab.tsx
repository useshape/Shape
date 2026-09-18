"use client";

import { useCallback, useEffect, useState } from "react";
import { commands, useProjectState } from "@/lib/backend";
import { MarkdownPreview } from "@/features/editor/ui/markdown/markdown";
import { PlanEditorHeader } from "@/features/editor/ui/main/ui/plan-editor-header";
import { Button } from "@/components/ui/button";

function resolvePlanPath(filePath: string, projectPath: string | null): string {
    if (/^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("/")) return filePath;
    if (!projectPath) return filePath;
    return `${projectPath.replace(/\\/g, "/")}/${filePath.replace(/\\/g, "/")}`.replace(/\/+/g, "/");
}

/** Cursor-style plan document: header + editable markdown, then Build. */
export function PlanTabView({ path, markdown }: { path: string; markdown?: string }) {
    const { project_path } = useProjectState();
    const absPath = resolvePlanPath(path, project_path);
    const [content, setContent] = useState(markdown?.trim() ? markdown : "");
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        if (markdown?.trim() && !path) {
            setContent(markdown);
            setError(null);
            return;
        }
        void commands
            .readFile(absPath)
            .then((text) => {
                if (cancelled) return;
                setContent(text);
                setError(null);
            })
            .catch((e) => {
                if (cancelled) return;
                if (markdown?.trim()) {
                    setContent(markdown);
                    setError(null);
                    return;
                }
                setError(e instanceof Error ? e.message : String(e));
            });
        return () => {
            cancelled = true;
        };
    }, [absPath, markdown, path]);

    const persist = useCallback(
        async (next: string) => {
            setContent(next);
            if (!absPath) return;
            setSaving(true);
            try {
                try {
                    await commands.createFile(absPath);
                } catch {
                    /* exists */
                }
                await commands.saveFile(absPath, next);
            } catch {
                /* keep local */
            } finally {
                setSaving(false);
            }
        },
        [absPath],
    );

    const saveToWorkspace = async () => {
        if (!project_path || !content.trim()) return;
        const name = absPath.split(/[\\/]/).pop() || "plan.md";
        const dest = `${project_path.replace(/\\/g, "/")}/.shape/plans/${name}`.replace(/\/+/g, "/");
        try {
            await commands.createDir(`${project_path.replace(/\\/g, "/")}/.shape/plans`);
        } catch {
            /* exists */
        }
        try {
            await commands.createFile(dest);
        } catch {
            /* exists */
        }
        await commands.saveFile(dest, content);
        window.dispatchEvent(
            new CustomEvent("shape-open-workspace-plan", {
                detail: { path: dest, title: name, markdown: content },
            }),
        );
    };

    if (error) {
        return (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-text-muted">
                {error}
            </div>
        );
    }

    if (!content && !markdown) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
                Loading…
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-editor">
            <PlanEditorHeader path={absPath || path} />
            <div className="min-h-0 flex-1 overflow-hidden">
                <MarkdownPreview
                    content={content}
                    filePath={absPath || path}
                    projectPath={project_path}
                    onApplyContent={(next) => {
                        void persist(next);
                    }}
                    className="border-l-0"
                />
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border-subtle px-3 py-2">
                <span className="text-xs text-text-muted">{saving ? "Saving…" : "Select text to edit"}</span>
                {project_path ? (
                    <Button variant="ghost" size="xs" onClick={() => void saveToWorkspace()}>
                        Save to workspace
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

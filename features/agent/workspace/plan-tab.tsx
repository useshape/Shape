"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { commands, useProjectState } from "@/lib/backend";
import { MarkdownLiveEditor } from "@/features/editor/ui/markdown/live-editor";
import { PlanEditorHeader } from "@/features/editor/ui/main/ui/plan-editor-header";
import { displayPlanName, parsePlanMarkdown } from "@/lib/plan/preview";

function resolvePlanPath(filePath: string, projectPath: string | null): string {
    if (/^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("/")) return filePath;
    if (!projectPath) return filePath;
    return `${projectPath.replace(/\\/g, "/")}/${filePath.replace(/\\/g, "/")}`.replace(/\/+/g, "/");
}

/** Plan document: formatted markdown with a raw source switch, then Build. */
export function PlanTabView({ path, markdown }: { path: string; markdown?: string }) {
    const { project_path } = useProjectState();
    const absPath = resolvePlanPath(path, project_path);
    const [raw, setRaw] = useState(false);
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

    const saveTimer = useRef<number | null>(null);
    const pending = useRef<string | null>(null);

    const flush = useCallback(async () => {
        const next = pending.current;
        pending.current = null;
        if (next === null || !absPath) return;
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
    }, [absPath]);

    // Typing autosaves shortly after the last keystroke.
    const persist = useCallback(
        (next: string) => {
            setContent(next);
            pending.current = next;
            if (saveTimer.current) window.clearTimeout(saveTimer.current);
            saveTimer.current = window.setTimeout(() => {
                saveTimer.current = null;
                void flush();
            }, 600);
        },
        [flush],
    );

    useEffect(() => {
        return () => {
            if (saveTimer.current) window.clearTimeout(saveTimer.current);
            void flush();
        };
    }, [flush]);

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

    const parsed = parsePlanMarkdown(content);
    const title = displayPlanName(parsed.title || path.split(/[\\/]/).pop() || "Plan");

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-editor">
            <PlanEditorHeader
                path={absPath || path}
                title={title}
                raw={raw}
                onRawChange={setRaw}
                onSaveToWorkspace={project_path ? () => void saveToWorkspace() : undefined}
            />
            <div className="min-h-0 flex-1 overflow-hidden">
                <MarkdownLiveEditor content={content} onChange={persist} raw={raw} />
            </div>
            {saving ? (
                <div className="shrink-0 px-3 py-1.5 text-xs text-text-muted">Saving…</div>
            ) : null}
        </div>
    );
}

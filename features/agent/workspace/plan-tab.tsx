"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { commands, useProjectState } from "@/lib/backend";
import { MarkdownLiveEditor } from "@/features/editor/ui/markdown/live-editor";
import { PlanEditorHeader } from "@/features/editor/ui/main/ui/plan-editor-header";
import {
    displayPlanName,
    joinPlanDocument,
    parsePlanMarkdown,
    splitPlanDocument,
    type PlanTodo,
} from "@/lib/plan/preview";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function resolvePlanPath(filePath: string, projectPath: string | null): string {
    if (/^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("/")) return filePath;
    if (!projectPath) return filePath;
    return `${projectPath.replace(/\\/g, "/")}/${filePath.replace(/\\/g, "/")}`.replace(/\/+/g, "/");
}

/** Plan document: markdown body, checklist below (not inside the doc). */
export function PlanTabView({ path, markdown }: { path: string; markdown?: string }) {
    const { project_path } = useProjectState();
    const absPath = resolvePlanPath(path, project_path);
    const [raw, setRaw] = useState(false);
    const [body, setBody] = useState("");
    const [todos, setTodos] = useState<PlanTodo[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const applySource = (text: string) => {
        const split = splitPlanDocument(text);
        setBody(split.body);
        setTodos(split.todos);
    };

    useEffect(() => {
        let cancelled = false;
        if (markdown?.trim() && !path) {
            applySource(markdown);
            setError(null);
            return;
        }
        void commands
            .readFile(absPath)
            .then((text) => {
                if (cancelled) return;
                applySource(text);
                setError(null);
            })
            .catch((e) => {
                if (cancelled) return;
                if (markdown?.trim()) {
                    applySource(markdown);
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

    const persistDoc = useCallback(
        (nextBody: string, nextTodos: PlanTodo[]) => {
            pending.current = joinPlanDocument(nextBody, nextTodos);
            if (saveTimer.current) window.clearTimeout(saveTimer.current);
            saveTimer.current = window.setTimeout(() => {
                saveTimer.current = null;
                void flush();
            }, 600);
        },
        [flush],
    );

    const persistBody = useCallback(
        (next: string) => {
            setBody(next);
            persistDoc(next, todos);
        },
        [persistDoc, todos],
    );

    const persistTodos = useCallback(
        (next: PlanTodo[]) => {
            setTodos(next);
            persistDoc(body, next);
        },
        [body, persistDoc],
    );

    useEffect(() => {
        return () => {
            if (saveTimer.current) window.clearTimeout(saveTimer.current);
            void flush();
        };
    }, [flush]);

    const saveToWorkspace = async () => {
        const content = joinPlanDocument(body, todos);
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

    if (!body && !markdown && todos.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
                Loading…
            </div>
        );
    }

    const parsed = parsePlanMarkdown(joinPlanDocument(body, todos));
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
                <MarkdownLiveEditor content={body} onChange={persistBody} raw={raw} />
            </div>
            <div className="shrink-0 border-t border-border-subtle px-3 py-2">
                <div className="mb-1.5 text-xs text-text-muted">Todos</div>
                <div className="flex flex-col gap-1">
                    {todos.map((todo, i) => (
                        <div key={i} className="flex h-chrome items-center gap-2">
                            <button
                                type="button"
                                aria-label={todo.done ? "Mark incomplete" : "Mark complete"}
                                onClick={() => {
                                    persistTodos(
                                        todos.map((t, j) => (j === i ? { ...t, done: !t.done } : t)),
                                    );
                                }}
                                className={cn(
                                    "size-4 shrink-0 rounded-full border",
                                    todo.done ? "border-success bg-success" : "border-text-muted/45",
                                )}
                            />
                            <Input
                                value={todo.label}
                                onChange={(e) => {
                                    persistTodos(
                                        todos.map((t, j) =>
                                            j === i ? { ...t, label: e.target.value } : t,
                                        ),
                                    );
                                }}
                                className="h-chrome min-w-0 flex-1"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => persistTodos(todos.filter((_, j) => j !== i))}
                            >
                                Remove
                            </Button>
                        </div>
                    ))}
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="self-start"
                        onClick={() => persistTodos([...todos, { label: "", done: false }])}
                    >
                        Add todo
                    </Button>
                </div>
            </div>
            {saving ? (
                <div className="shrink-0 px-3 py-1.5 text-xs text-text-muted">Saving…</div>
            ) : null}
        </div>
    );
}

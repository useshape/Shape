"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { editor as MonacoEditor } from "monaco-editor";
import { commands } from "@/lib/backend/commands";
import type { GitHunk } from "@/lib/backend/types";
import { notify } from "@/features/notifications";
import { Icon } from "@/components/ui/icon";

export type DiffHunkMode = "staged" | "unstaged";

export function parseDiffTabPath(path: string): {
  mode: DiffHunkMode | null;
  filePath: string;
} {
  if (path.startsWith("diff:staged:")) {
    return { mode: "staged", filePath: path.slice("diff:staged:".length) };
  }
  if (path.startsWith("diff:unstaged:")) {
    return { mode: "unstaged", filePath: path.slice("diff:unstaged:".length) };
  }
  return { mode: null, filePath: path };
}

function selectionLineIndices(
  hunk: GitHunk,
  selectedNewLines: Set<number>,
): number[] | null {
  if (selectedNewLines.size === 0) return null;
  const indices: number[] = [];
  for (let i = 0; i < hunk.lines.length; i++) {
    const line = hunk.lines[i];
    if (line.type !== "add" && line.type !== "del") continue;
    const nl = line.newLine;
    const ol = line.oldLine;
    const hit =
      (nl != null && selectedNewLines.has(nl)) ||
      (line.type === "del" && ol != null && selectedNewLines.has(ol));
    if (hit) indices.push(i);
  }
  return indices.length > 0 ? indices : null;
}

export function DiffHunkToolbar({
  repoPath,
  filePath,
  mode,
  hunks,
  activeHunkIndex,
  selectedNewLines,
  modifiedEditor,
  containerEl,
  onDone,
}: {
  repoPath: string;
  filePath: string;
  mode: DiffHunkMode;
  hunks: GitHunk[];
  activeHunkIndex: number;
  selectedNewLines: Set<number>;
  modifiedEditor: MonacoEditor.ICodeEditor | null;
  containerEl: HTMLElement | null;
  onDone: () => void;
}) {
  const hunk = hunks[activeHunkIndex] ?? null;
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const run = useCallback(
    async (op: "stage" | "unstage" | "restore") => {
      if (!hunk || busy) return;
      const lines = selectionLineIndices(hunk, selectedNewLines);
      setBusy(true);
      try {
        if (op === "stage") {
          await commands.gitStageHunk(repoPath, filePath, hunk.index, lines);
        } else if (op === "unstage") {
          await commands.gitUnstageHunk(repoPath, filePath, hunk.index, lines);
        } else {
          await commands.gitRestoreHunk(repoPath, filePath, hunk.index, lines);
        }
        window.dispatchEvent(new Event("shape-git-refresh"));
        onDone();
      } catch (err) {
        notify.error(
          "Git",
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        setBusy(false);
      }
    },
    [hunk, busy, selectedNewLines, repoPath, filePath, onDone],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "y" && !e.shiftKey && mode === "unstaged") {
        e.preventDefault();
        void run("stage");
      } else if (key === "y" && e.shiftKey && mode === "staged") {
        e.preventDefault();
        void run("unstage");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, mode]);

  useLayoutEffect(() => {
    if (!hunk || !modifiedEditor || !containerEl) {
      setPos(null);
      return;
    }

    const update = () => {
      const line = Math.max(1, hunk.newStart);
      const visible = modifiedEditor.getScrolledVisiblePosition({
        lineNumber: line,
        column: 1,
      });
      const editorDom = modifiedEditor.getDomNode();
      if (!visible || !editorDom) {
        setPos(null);
        return;
      }
      const editorRect = editorDom.getBoundingClientRect();
      const parentRect = containerEl.getBoundingClientRect();
      const top = editorRect.top - parentRect.top + visible.top;
      const right = Math.max(8, parentRect.right - editorRect.right + 8);
      const editorHeight = editorDom.clientHeight;
      if (visible.top < -24 || visible.top > editorHeight) {
        setPos(null);
        return;
      }
      setPos({ top: Math.max(4, top), right });
    };

    update();
    const d1 = modifiedEditor.onDidScrollChange(update);
    const d2 = modifiedEditor.onDidLayoutChange(update);
    window.addEventListener("resize", update);
    return () => {
      d1.dispose();
      d2.dispose();
      window.removeEventListener("resize", update);
    };
  }, [hunk, modifiedEditor, containerEl, activeHunkIndex]);

  if (!hunk || !pos) return null;

  const lineHint =
    selectionLineIndices(hunk, selectedNewLines) != null
      ? "selection"
      : "hunk";

  return (
    <div
      className="absolute z-20 flex items-center gap-1 rounded-lg border border-border bg-panel p-1 shadow-sm"
      style={{ top: pos.top, right: pos.right }}
    >
      <span className="px-1.5 text-xs text-text-muted tabular-nums">
        Hunk {activeHunkIndex + 1}/{hunks.length}
        {lineHint === "selection" ? " · lines" : ""}
      </span>
      {mode === "unstaged" && (
        <>
          <button
            type="button"
            disabled={busy}
            title="Stage hunk (Ctrl+Y)"
            onClick={() => void run("stage")}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-success hover:text-text-primary disabled:opacity-40"
          >
            <Icon name="add" size={12} /> Stage
          </button>
          <button
            type="button"
            disabled={busy}
            title="Restore hunk"
            onClick={() => void run("restore")}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted hover:text-text-primary disabled:opacity-40"
          >
            <Icon name="undo" size={12} /> Restore
          </button>
        </>
      )}
      {mode === "staged" && (
        <button
          type="button"
          disabled={busy}
          title="Unstage hunk (Ctrl+Shift+Y)"
          onClick={() => void run("unstage")}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted hover:text-text-primary disabled:opacity-40"
        >
          <Icon name="remove" size={12} /> Unstage
        </button>
      )}
    </div>
  );
}

export function useDiffHunkState(
  repoPath: string | null,
  filePath: string,
  mode: DiffHunkMode | null,
  modifiedEditor: MonacoEditor.ICodeEditor | null,
) {
  const [hunks, setHunks] = useState<GitHunk[]>([]);
  const [activeHunkIndex, setActiveHunkIndex] = useState(0);
  const [selectedNewLines, setSelectedNewLines] = useState<Set<number>>(
    () => new Set(),
  );
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!repoPath || !mode) {
      setHunks([]);
      return;
    }
    let cancelled = false;
    void commands
      .gitListHunks(repoPath, filePath, mode === "staged")
      .then((list) => {
        if (cancelled) return;
        setHunks(list.hunks);
        setActiveHunkIndex((i) =>
          list.hunks.length === 0 ? 0 : Math.min(i, list.hunks.length - 1),
        );
      })
      .catch(() => {
        if (!cancelled) setHunks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, filePath, mode, reloadToken]);

  useEffect(() => {
    const onRefresh = () => reload();
    window.addEventListener("shape-git-refresh", onRefresh);
    return () => window.removeEventListener("shape-git-refresh", onRefresh);
  }, [reload]);

  useEffect(() => {
    if (!modifiedEditor || hunks.length === 0) return;

    const syncFromCursor = () => {
      const pos = modifiedEditor.getPosition();
      const sel = modifiedEditor.getSelection();
      if (sel && !sel.isEmpty()) {
        const lines = new Set<number>();
        for (let ln = sel.startLineNumber; ln <= sel.endLineNumber; ln++) {
          lines.add(ln);
        }
        setSelectedNewLines(lines);
      } else {
        setSelectedNewLines(new Set());
      }
      if (!pos) return;
      const line = pos.lineNumber;
      let best = 0;
      for (let i = 0; i < hunks.length; i++) {
        const h = hunks[i];
        const end = h.newStart + Math.max(h.newLines, 1) - 1;
        if (line >= h.newStart && line <= end) {
          best = i;
          break;
        }
        if (line >= h.newStart - 2 && line <= end + 2) best = i;
      }
      setActiveHunkIndex(best);
    };

    syncFromCursor();
    const d1 = modifiedEditor.onDidChangeCursorPosition(syncFromCursor);
    const d2 = modifiedEditor.onDidChangeCursorSelection(syncFromCursor);
    return () => {
      d1.dispose();
      d2.dispose();
    };
  }, [modifiedEditor, hunks]);

  return useMemo(
    () => ({
      hunks,
      activeHunkIndex,
      selectedNewLines,
      reload,
    }),
    [hunks, activeHunkIndex, selectedNewLines, reload],
  );
}

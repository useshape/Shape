"use client";

import type { RemixiconComponentType } from "@remixicon/react";
import { RiAddLine, RiArrowDownSLine, RiArrowUpLine, RiCloseLine, RiEyeLine, RiGitMergeLine, RiGitPullRequestLine, RiMoreLine, RiTerminalBoxLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

/* StatusGlyph + FileRow + ChangesView chrome copied from
   shape/features/agent/workspace/changes.tsx
   Tabs copied from workbench-tab-styles.ts + workspace/tabs.tsx */

function StatusGlyph({ status }: { status: string }) {
  const s = status.toUpperCase();
  if (s === "A" || s === "U" || s === "?" || s === "??") {
    return (
      <span
        className="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] bg-success/25 text-[11px] font-semibold leading-none text-success"
        aria-label="Added"
      >
        +
      </span>
    );
  }
  if (s === "D") {
    return (
      <span
        className="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] bg-error/25 text-[11px] font-semibold leading-none text-error"
        aria-label="Deleted"
      >
        −
      </span>
    );
  }
  return (
    <span
      className="flex size-3.5 shrink-0 items-center justify-center rounded-[3px]"
      style={{ background: "color-mix(in srgb, var(--git-modified) 35%, transparent)" }}
      aria-label="Modified"
    >
      <span className="size-1.5 rounded-[1px]" style={{ background: "var(--git-modified)" }} />
    </span>
  );
}

export type DemoFile = { name: string; add: number; del: number; status?: string };

function FileRow({
  file,
  selected,
  target,
  onSelect,
}: {
  file: DemoFile;
  selected?: boolean;
  target?: string;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      data-demo-target={target}
      onClick={onSelect}
      className={cn(
        "group flex h-9 w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-panel-hover",
        selected && "bg-panel-active",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center overflow-hidden font-sans text-sm leading-none">
        <span className="shrink-0 font-medium text-text-primary">{file.name}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {file.add > 0 || file.del > 0 ? (
          <span className="flex items-center gap-1.5 text-xs tabular-nums">
            {file.add > 0 ? <span className="text-success">+{file.add}</span> : null}
            {file.del > 0 ? <span className="text-error">−{file.del}</span> : null}
          </span>
        ) : null}
        {(file.status ?? (file.del > 0 ? "M" : "A")).toUpperCase() === "A" ? (
          <span className="text-xs font-medium text-success">New</span>
        ) : (
          <StatusGlyph status={file.status ?? (file.del > 0 ? "M" : "A")} />
        )}
      </span>
    </button>
  );
}

function workbenchTabItemClass(active: boolean) {
  return cn(
    "workbench-tab-item group relative box-border flex h-7.5 shrink-0 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm font-medium transition-colors",
    active
      ? "is-active min-w-[72px] bg-surface-3 text-text-primary"
      : "text-text-muted hover:bg-panel-hover hover:text-text-secondary",
  );
}

export type WorkspaceTabId = "changes" | "terminal";

function ChangesView({
  files,
  selected,
  onSelectFile,
}: {
  files: DemoFile[];
  selected: string | null;
  onSelectFile: (name: string) => void;
}) {
  const [panelTab, setPanelTab] = useState<"changes" | "checks" | "review">("changes");
  const plus = files.reduce((s, f) => s + f.add, 0);
  const minus = files.reduce((s, f) => s + f.del, 0);
  const statusLabel =
    files.length === 0 ? "Up to date" : `${files.length} change${files.length === 1 ? "" : "s"}`;
  const toneBg = "color-mix(in srgb, var(--color-success) 14%, var(--color-panel))";
  const toneFg = "var(--color-success)";
  const toneChipBg = "color-mix(in srgb, var(--color-success) 22%, transparent)";
  const tabs: { id: "changes" | "checks" | "review"; label: string; icon?: RemixiconComponentType }[] = [
    { id: "changes", label: `Changes${files.length ? ` ${files.length}` : ""}` },
    { id: "checks", label: "Checks" },
    { id: "review", label: "Review", icon: RiEyeLine },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div
        className="mx-2 flex h-8 shrink-0 items-center gap-2 rounded-lg px-1"
        style={{ background: toneBg }}
      >
        <span
          className="inline-flex h-6 items-center rounded-md px-2 text-sm font-medium"
          style={{ background: toneChipBg, color: toneFg }}
        >
          main
        </span>
        <span
          className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-medium"
          style={{ color: toneFg }}
        >
          <Icon icon={RiArrowUpLine} />
          {statusLabel}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          disabled={files.length === 0}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium disabled:opacity-40"
          style={{ background: toneChipBg, color: toneFg }}
        >
          <Icon icon={RiGitMergeLine} />
          Commit & Push
        </button>
      </div>

      <div className="mt-2 flex h-10 shrink-0 items-center gap-0.5 px-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPanelTab(t.id)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-sm px-2 text-sm font-medium transition-colors",
              panelTab === t.id
                ? "bg-surface-3 text-text-primary"
                : "text-text-muted hover:bg-panel-hover hover:text-text-secondary",
            )}
          >
            {t.icon ? <Icon icon={t.icon} /> : null}
            {t.label}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover"
          aria-label="More"
        >
          <Icon icon={RiMoreLine} />
        </button>
      </div>

      {panelTab === "checks" ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-text-muted">
          No checks for this branch yet.
        </div>
      ) : panelTab === "review" ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-text-muted">
          No open pull request on this branch.
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
          No local changes
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          <section>
            <div className="flex items-center gap-2 px-2 pb-0.5 text-sm font-medium text-text-muted">
              <span className="min-w-0 flex-1 truncate">
                {files.length} Uncommitted change{files.length === 1 ? "" : "s"}
              </span>
              {plus > 0 || minus > 0 ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums">
                  {plus > 0 ? <span className="text-success">+{plus}</span> : null}
                  {minus > 0 ? <span className="text-error">−{minus}</span> : null}
                </span>
              ) : null}
            </div>
            <div className="flex flex-col">
              {files.map((file, i) => (
                <FileRow
                  key={file.name}
                  file={file}
                  selected={selected === file.name}
                  target={i === 0 ? "change-file" : undefined}
                  onSelect={() => onSelectFile(file.name)}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export const TERMINAL_PROMPT = "PS C:\\Users\\alex\\docs-site>";

function TerminalView({ lines }: { lines: string[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const idle = lines.length === 0;

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [lines]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="workbench-tab-bar box-border flex h-[36px] w-full shrink-0 items-center gap-1 bg-sidebar px-2">
        <div className="no-scrollbar flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <div className={workbenchTabItemClass(true)}>
            <span className="truncate whitespace-nowrap text-sm">PowerShell 1</span>
          </div>
        </div>
        <div className="box-border flex h-full shrink-0 items-center gap-0.5 px-1">
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted"
            aria-label="New Terminal"
            tabIndex={-1}
          >
            <Icon icon={RiAddLine} />
          </button>
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted"
            aria-label="Terminal profiles"
            tabIndex={-1}
          >
            <Icon icon={RiArrowDownSLine} />
          </button>
        </div>
      </div>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[13px] leading-[1.45] text-text-primary"
      >
        {idle ? (
          <div>
            <span className="text-text-primary">{TERMINAL_PROMPT}</span>
            <span className="ml-1 inline-block h-[1.05em] w-[7px] translate-y-px bg-text-primary" />
          </div>
        ) : (
          lines.map((line, i) => (
            <div key={`${i}-${line.slice(0, 24)}`} className="whitespace-pre-wrap">
              {line === "" ? " " : line}
              {i === lines.length - 1 ? (
                <span className="ml-0.5 inline-block h-[1.05em] w-[7px] translate-y-px bg-text-primary" />
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function DemoPanel({
  files,
  tab,
  selected,
  onTab,
  onSelectFile,
  terminalLines = [],
}: {
  files: DemoFile[];
  tab: WorkspaceTabId;
  selected: string | null;
  onTab: (id: WorkspaceTabId) => void;
  onSelectFile: (name: string) => void;
  terminalLines?: string[];
}) {
  const [tabs, setTabs] = useState<{ id: WorkspaceTabId; title: string; icon: RemixiconComponentType }[]>([
    { id: "changes", title: "Changes", icon: RiGitPullRequestLine },
    { id: "terminal", title: "Terminal", icon: RiTerminalBoxLine },
  ]);
  const [menu, setMenu] = useState(false);
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];

  useEffect(() => {
    if (!menu) return;
    const onDown = () => setMenu(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menu]);

  const closeTab = (id: WorkspaceTabId) => {
    if (tabs.length <= 1) return;
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (tab === id) onTab(next[0].id);
  };

  const addTab = (id: WorkspaceTabId) => {
    setMenu(false);
    const existing = tabs.find((t) => t.id === id);
    if (existing) {
      onTab(existing.id);
      return;
    }
    setTabs((p) => [
      ...p,
      { id, title: id === "terminal" ? "Terminal" : "Changes", icon: id === "terminal" ? RiTerminalBoxLine : RiGitPullRequestLine },
    ]);
    onTab(id);
  };

  return (
    <aside className="flex h-full w-full min-w-0 overflow-hidden bg-sidebar">
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <div className="workbench-tab-bar box-border flex h-[36px] w-full shrink-0 items-center gap-1 bg-sidebar px-2">
          <div className="workbench-tab-scroll no-scrollbar flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                data-demo-target={t.id === "changes" ? "changes" : "terminal"}
                onClick={() => onTab(t.id)}
                className={workbenchTabItemClass(t.id === active.id)}
              >
                <div className="relative z-[1] flex h-full min-w-0 items-center gap-1.5">
                  <Icon icon={t.icon} className="text-text-muted" />
                  <span className="truncate whitespace-nowrap text-sm">{t.title}</span>
                  {tabs.length > 1 ? (
                    <span
                      role="button"
                      aria-label={`Close ${t.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(t.id);
                      }}
                      className="invisible ml-1 flex h-4 w-4 shrink-0 items-center justify-center text-text-muted group-hover:visible hover:text-text-primary"
                    >
                      <Icon icon={RiCloseLine} />
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
          <div
            className="relative box-border flex h-full shrink-0 items-center gap-0.5 px-1"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-panel-hover hover:text-text-primary"
              aria-label="New tab"
              onClick={(e) => {
                e.stopPropagation();
                setMenu((v) => !v);
              }}
            >
              <Icon icon={RiAddLine} />
            </button>
            {menu ? (
              <div className="absolute right-0 top-full z-40 w-56 overflow-hidden rounded-xl border border-border-subtle bg-surface-3 py-1 shadow-md">
                <button
                  type="button"
                  onClick={() => addTab("terminal")}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-panel-hover"
                >
                  <Icon icon={RiTerminalBoxLine} />
                  <span className="flex-1">Terminal</span>
                  <span className="text-xs text-text-muted">Ctrl+J</span>
                </button>
                <button
                  type="button"
                  onClick={() => addTab("changes")}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-panel-hover"
                >
                  <Icon icon={RiGitPullRequestLine} />
                  <span className="flex-1">Changes</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {active.id === "terminal" ? (
            <TerminalView lines={terminalLines} />
          ) : (
            <ChangesView files={files} selected={selected} onSelectFile={onSelectFile} />
          )}
        </div>
      </div>
    </aside>
  );
}

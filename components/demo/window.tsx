"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./theme.css";
import { DemoSidebar, type DemoChatId, DEMO_CHATS } from "./sidebar";
import { DemoChrome, type DemoRunStatus } from "./chrome";
import { DemoChat } from "./chat";
import { DemoPanel, TERMINAL_PROMPT, type DemoFile, type WorkspaceTabId } from "./panel";
import { type DemoStepId } from "./steps";
import { MacCursor, useDemoTour } from "./tour";
import { usePlayDemo } from "./play-tour";
import { cn } from "@/lib/utils";

const WORKSPACE_WIDTH = 480;

const DEFAULT_FILES: DemoFile[] = [
  { name: "checkout.ts", add: 52, del: 8, status: "M" },
  { name: "rate-limit.ts", add: 31, del: 0, status: "A" },
  { name: "auth.ts", add: 12, del: 19, status: "M" },
];

const RUN_CHUNKS: { at: number; lines: string[]; status?: DemoRunStatus }[] = [
  { at: 0, lines: [`${TERMINAL_PROMPT} npm run dev`], status: "starting" },
  { at: 520, lines: ["", "> docs-site@0.1.0 dev", "> next dev", ""] },
  {
    at: 1100,
    lines: [
      "▲ Next.js 15.5.2",
      "- Local:        http://localhost:3000",
      "- Network:      http://192.168.0.24:3000",
      "",
    ],
  },
  { at: 1880, lines: ["✓ Starting..."] },
  { at: 2900, lines: ["✓ Ready in 1.4s"], status: "running" },
];

/** Layout copied from shape/app/client-layout.tsx + features/agent/layout.tsx */
export function ShapeWindow({
  onTour,
  jumpRef,
  tour = true,
  playDemo = false,
  initialChat = "review",
  workspace = false,
  sidebar = true,
  workspaceTab: initialWorkspaceTab = "changes",
  initialFiles,
  workspaceWidth = WORKSPACE_WIDTH,
}: {
  onTour?: (step: DemoStepId, progress: number) => void;
  jumpRef?: React.MutableRefObject<((id: DemoStepId) => void) | null>;
  tour?: boolean;
  playDemo?: boolean;
  initialChat?: DemoChatId;
  workspace?: boolean;
  sidebar?: boolean;
  workspaceTab?: WorkspaceTabId;
  initialFiles?: DemoFile[];
  workspaceWidth?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [chatId, setChatId] = useState<DemoChatId>(initialChat);
  const [working, setWorking] = useState(false);
  const [files, setFiles] = useState<DemoFile[]>(initialFiles ?? (workspace ? DEFAULT_FILES : []));
  const [sidebarOpen, setSidebarOpen] = useState(sidebar);
  const [workspaceOpen, setWorkspaceOpen] = useState(workspace);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTabId>(initialWorkspaceTab);
  const [selectedChange, setSelectedChange] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [runStatus, setRunStatus] = useState<DemoRunStatus>("idle");
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const runTimers = useRef<number[]>([]);

  const clearRunTimers = useCallback(() => {
    for (const id of runTimers.current) window.clearTimeout(id);
    runTimers.current = [];
  }, []);

  const resetRun = useCallback(() => {
    clearRunTimers();
    setRunStatus("idle");
    setTerminalLines([]);
  }, [clearRunTimers]);

  const startRun = useCallback(() => {
    clearRunTimers();
    setRunStatus("starting");
    setTerminalLines([]);
    for (const chunk of RUN_CHUNKS) {
      const id = window.setTimeout(() => {
        setTerminalLines((prev) => [...prev, ...chunk.lines]);
        if (chunk.status) setRunStatus(chunk.status);
      }, chunk.at);
      runTimers.current.push(id);
    }
  }, [clearRunTimers]);

  useEffect(() => () => clearRunTimers(), [clearRunTimers]);

  const handleTour = useCallback(
    (step: DemoStepId, progress: number) => {
      onTour?.(step, progress);
    },
    [onTour],
  );

  const { cursor, jumpTo } = useDemoTour(rootRef, handleTour, tour && !playDemo);
  const playCursor = usePlayDemo(rootRef, playDemo, resetRun);
  if (jumpRef) jumpRef.current = jumpTo;

  const onWorking = useCallback((v: boolean) => setWorking(v), []);
  const onFiles = useCallback((next: DemoFile[]) => setFiles(next), []);

  const ids = useMemo(() => DEMO_CHATS.map((c) => c.id), []);
  const idx = ids.indexOf(chatId);
  const title = DEMO_CHATS.find((c) => c.id === chatId)?.title ?? "New chat";

  const selectChat = (id: DemoChatId) => {
    setChatId(id);
    setSelectedChange(null);
  };

  const onNewChat = () => {
    setChatId("review");
    setResetKey((n) => n + 1);
  };

  const shownCursor = playDemo ? playCursor : cursor;

  return (
    <div
      ref={rootRef}
      className="shape-demo relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl bg-background"
    >
      {tour || playDemo ? <MacCursor {...shownCursor} /> : null}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {sidebar ? (
          <DemoSidebar
            expanded={sidebarOpen}
            activeId={chatId}
            working={working}
            onToggle={() => setSidebarOpen((v) => !v)}
            onSelect={selectChat}
            onNewChat={onNewChat}
          />
        ) : null}
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-panel",
              sidebar && "rounded-l-xl border-l border-border",
            )}
          >
            <DemoChrome
              title={title}
              repo={DEMO_CHATS.find((c) => c.id === chatId)?.repo ?? "shape"}
              canBack={idx < ids.length - 1}
              canForward={idx > 0}
              rightOpen={workspaceOpen}
              showRun={playDemo}
              showWorkspace={workspace}
              runStatus={runStatus}
              onRun={startRun}
              onBack={() => {
                const older = ids[idx + 1];
                if (older) selectChat(older);
              }}
              onForward={() => {
                const newer = ids[idx - 1];
                if (newer) selectChat(newer);
              }}
              onToggleRight={() => setWorkspaceOpen((v) => !v)}
            />
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <DemoChat
                chatId={chatId}
                resetKey={resetKey}
                onWorking={onWorking}
                onFiles={onFiles}
              />
            </div>
          </div>
          {workspace ? (
            <div
              style={{ width: workspaceOpen ? workspaceWidth : 0, flex: "0 0 auto" }}
              className="h-full overflow-hidden border-l border-border-subtle bg-sidebar transition-[width] duration-200 ease-[var(--ease-out)]"
            >
              <div style={{ width: workspaceWidth }} className="flex h-full flex-col bg-sidebar">
                <div className="h-titlebar shrink-0 bg-sidebar" />
                <DemoPanel
                  files={files}
                  tab={workspaceTab}
                  selected={selectedChange}
                  onTab={setWorkspaceTab}
                  onSelectFile={setSelectedChange}
                  terminalLines={terminalLines}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

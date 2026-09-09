"use client";

import { RiArrowLeftLine, RiArrowRightLine, RiPlayFill, RiStopFill } from "@remixicon/react";
import { Icon } from "./icon";
import { AnimatedSecondarySidebarIcon } from "./panel-icons";
import { cn } from "@/lib/utils";

/* Copied from shape/features/chat/ui/shell/titlebar.tsx + features/agent/chrome.tsx */

function NavBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors",
        "hover:bg-panel-hover hover:text-text-primary",
        "disabled:pointer-events-none disabled:opacity-30",
      )}
    >
      {children}
    </button>
  );
}

function Btn({
  label,
  active,
  target,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  target?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-demo-target={target}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-text-muted transition-colors",
        "hover:bg-panel-hover hover:text-text-primary",
        active && "text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

export type DemoRunStatus = "idle" | "starting" | "running";

function RunStatusDot({ status }: { status: DemoRunStatus }) {
  if (status === "idle") return null;
  if (status === "running") {
    return (
      <span
        className="pointer-events-none absolute -bottom-px -right-px size-1.5 rounded-full bg-success"
        aria-hidden
      />
    );
  }
  return (
    <span
      className="pointer-events-none absolute -bottom-0.5 -right-0.5 size-2 animate-spin rounded-full border-[1.5px] border-t-transparent"
      style={{ borderColor: "#3946ff", borderTopColor: "transparent" }}
      aria-hidden
    />
  );
}

export function DemoChrome({
  title,
  ago = "just now",
  canBack,
  canForward,
  rightOpen,
  onBack,
  onForward,
  onToggleRight,
  showRun = false,
  showWorkspace = true,
  runStatus = "idle",
  onRun,
}: {
  title: string;
  ago?: string;
  canBack: boolean;
  canForward: boolean;
  rightOpen: boolean;
  onBack: () => void;
  onForward: () => void;
  onToggleRight: () => void;
  showRun?: boolean;
  showWorkspace?: boolean;
  runStatus?: DemoRunStatus;
  onRun?: () => void;
}) {
  const busy = runStatus === "starting" || runStatus === "running";

  return (
    <div className="flex h-titlebar shrink-0 items-stretch bg-panel">
      <div className="flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-hidden pl-2">
        <NavBtn label="Back" disabled={!canBack} onClick={onBack}>
          <Icon icon={RiArrowLeftLine} />
        </NavBtn>
        <NavBtn label="Forward" disabled={!canForward} onClick={onForward}>
          <Icon icon={RiArrowRightLine} />
        </NavBtn>
        <span className="ml-1 min-w-0 truncate text-sm text-text-secondary">{title}</span>
        {ago ? <span className="shrink-0 pl-1 text-sm text-text-muted">{ago}</span> : null}
      </div>
      <div className="flex items-center gap-0.5 px-2">
        {showRun ? (
          <Btn
            label={busy ? (runStatus === "starting" ? "Starting…" : "Running") : "Run npm run dev"}
            target="run"
            onClick={() => onRun?.()}
          >
            <span className="relative inline-flex">
              <Icon icon={runStatus === "running" ? RiStopFill : RiPlayFill} />
              <RunStatusDot status={runStatus} />
            </span>
          </Btn>
        ) : null}
        {showWorkspace ? (
          <Btn
            label={rightOpen ? "Hide panel" : "Show panel"}
            active={rightOpen}
            target="workspace"
            onClick={onToggleRight}
          >
            <AnimatedSecondarySidebarIcon active={rightOpen} size={16} />
          </Btn>
        ) : null}
      </div>
    </div>
  );
}


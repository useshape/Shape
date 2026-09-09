"use client";

import type { RemixiconComponentType } from "@remixicon/react";
import { RiAddLine, RiGithubFill, RiHistoryLine, RiNotification3Line, RiSearchLine, RiSettings3Line, RiSortDesc } from "@remixicon/react";
import { Icon } from "./icon";
import { DemoAvatar } from "./avatar";
import { WorkingDots } from "./bubble";
import { AnimatedSidebarIcon } from "./panel-icons";
import { cn } from "@/lib/utils";

/* Layout/classes copied from shape/features/agent/sidebar/index.tsx, chats.tsx, account.tsx, menu.tsx */

export const DEMO_CHATS = [
  { id: "review", title: "Adversarial review", ago: "now" },
  { id: "emails", title: "Send the follow-up", ago: "8m" },
  { id: "ops", title: "Launch follow-through", ago: "4m" },
  { id: "stripe", title: "Connect billing events", ago: "32m" },
  { id: "ratelimit", title: "Guard the checkout route", ago: "2h" },
] as const;

export type DemoChatId = (typeof DEMO_CHATS)[number]["id"];

const HEADER_CLASS = "flex h-10 shrink-0 items-center gap-0.5";

function NavItem({
  label,
  icon,
  collapsed,
  onClick,
}: {
  label: string;
  icon: RemixiconComponentType;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-panel-hover hover:text-text-primary"
      >
        <Icon icon={icon} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full items-center gap-3 font-medium rounded-md px-1.5 text-left text-sm text-text-primary hover:bg-panel-hover hover:text-text-primary"
    >
      <Icon icon={icon} className="shrink-0 text-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function ChatRow({
  title,
  ago,
  active,
  working,
  target,
  onSelect,
}: {
  title: string;
  ago: string;
  active: boolean;
  working: boolean;
  target?: string;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "group/chat w-full rounded-lg px-2.5 py-2 text-sm",
        "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
        active ? "bg-panel-hover font-medium text-text-primary" : "text-text-primary font-medium hover:bg-panel-hover",
      )}
    >
      <button
        type="button"
        data-demo-target={target}
        onClick={onSelect}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{title}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-text-muted">
            {working ? (
              <>
                <WorkingDots />
                <span>Working...</span>
              </>
            ) : (
              <span className="truncate">{ago}</span>
            )}
          </span>
        </span>
        {working ? (
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="Working" />
        ) : null}
      </button>
    </div>
  );
}

export function DemoSidebar({
  expanded,
  activeId,
  working,
  onToggle,
  onSelect,
  onNewChat,
}: {
  expanded: boolean;
  activeId: DemoChatId;
  working: boolean;
  onToggle: () => void;
  onSelect: (id: DemoChatId) => void;
  onNewChat: () => void;
}) {
  const items = [
    { label: "New Chat", icon: RiAddLine, onClick: onNewChat },
    { label: "Search", icon: RiSearchLine },
    { label: "GitHub", icon: RiGithubFill },
    { label: "Customize", icon: RiSettings3Line },
  ] as const;

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden bg-sidebar text-text-primary",
        "transition-[width] duration-[var(--transition-base)] ease-[var(--ease-out)]",
        expanded ? "w-76" : "w-12",
      )}
    >
      <div className={cn(HEADER_CLASS, expanded ? "justify-between px-2" : "justify-center px-1.5")}>
        <button
          type="button"
          aria-label={expanded ? "Hide sidebar" : "Show sidebar"}
          onClick={onToggle}
          className={cn(
            "flex items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary",
            expanded ? "size-7" : "size-9",
          )}
        >
          <AnimatedSidebarIcon active={expanded} size={16} />
        </button>
        {expanded ? (
          <button
            type="button"
            aria-label="History"
            className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
          >
            <Icon icon={RiHistoryLine} />
          </button>
        ) : null}
      </div>

      <nav
        className={cn(
          "flex shrink-0 gap-0.5",
          expanded ? "flex-col px-2" : "flex-col items-center px-1.5",
        )}
      >
        {items.map((item) => (
          <NavItem
            key={item.label}
            label={item.label}
            icon={item.icon}
            collapsed={!expanded}
            onClick={"onClick" in item ? item.onClick : undefined}
          />
        ))}
      </nav>

      {expanded ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between pb-1 pl-3 pr-1 pt-3">
            <span className="text-sm font-medium text-text-muted">Chats</span>
            <div className="flex items-center">
              <span className="flex size-7 items-center justify-center rounded-md text-text-muted">
                <Icon icon={RiSearchLine} />
              </span>
              <span className="flex size-7 items-center justify-center rounded-md text-text-muted">
                <Icon icon={RiSortDesc} />
              </span>
              <button
                type="button"
                aria-label="New chat"
                onClick={onNewChat}
                className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
              >
                <Icon icon={RiAddLine} />
              </button>
            </div>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
            <div className="space-y-0.5">
              {DEMO_CHATS.map((c) => (
                <ChatRow
                  key={c.id}
                  title={c.title}
                  ago={c.ago}
                  active={c.id === activeId}
                  working={c.id === activeId && working}
                  target={`chat-${c.id}`}
                  onSelect={() => onSelect(c.id)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      <div
        className={cn(
          "mt-auto shrink-0",
          expanded ? "px-1 pb-1" : "flex flex-col items-center gap-1 px-1 pb-2",
        )}
      >
        {expanded ? (
          <div className="flex h-10 items-center gap-1.5 px-2">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left hover:bg-panel-hover"
            >
              <DemoAvatar name="Alex" size={28} />
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">Alex</span>
            </button>
            <button
              type="button"
              aria-label="Notifications"
              className="relative flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
            >
              <Icon icon={RiNotification3Line} />
            </button>
            <button
              type="button"
              aria-label="Settings"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
            >
              <Icon icon={RiSettings3Line} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              aria-label="Notifications"
              className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
            >
              <Icon icon={RiNotification3Line} />
            </button>
            <button
              type="button"
              aria-label="Settings"
              className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
            >
              <Icon icon={RiSettings3Line} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

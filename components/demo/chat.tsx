"use client";

import { RiAddLine, RiArrowDownSLine, RiArrowGoBackLine, RiArrowRightSLine, RiArrowUpLine, RiChat3Line, RiCheckLine, RiClipboardLine, RiCodeLine, RiListCheck3, RiPaletteLine, RiPencilLine, RiShieldLine } from "@remixicon/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icon";
import { MorphMenu } from "./morph";
import { TypingDots, UserMessageCard } from "./bubble";
import { DemoAvatar } from "./avatar";
import { Button } from "./ui/button";
import { Collapse } from "./ui/collapse";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown";
import { GmailLogo, SlackLogo, FirebaseLogo } from "./gmail";
import { providerIcon } from "./provider";
import { cn } from "@/lib/utils";
import type { DemoChatId } from "./sidebar";
import type { DemoFile } from "./panel";

/* Composer copied from shape/features/chat/ui/composer/input.tsx
   EditApprovalRow / WorkflowEditPreview from blocks/turn.tsx
   Tasks strip from composer/activity.tsx */

const CHAT_MODES = [
  { id: "Code", icon: RiCodeLine, color: "#3B82F6" },
  { id: "Ask", icon: RiChat3Line, color: "#22C55E" },
  { id: "Plan", icon: RiListCheck3, color: "#A855F7" },
  { id: "Visual", icon: RiPaletteLine, color: "#EC4899" },
  { id: "Review", icon: RiShieldLine, color: "#F59E0B" },
] as const;

const COMPOSER_HINTS = [
  "Plan, Build, / for skills, @ for context",
  "Drop an image or screenshot to redesign",
  "Ask to explore the codebase with @codebase",
  "Paste a stack trace to debug",
  "Describe a UI change and preview it in Visual",
  "Review a PR or file for bugs and edge cases",
] as const;

const REVIEW_PROMPT =
  "Run an adversarial review on the auth module. Hunt for CVEs, not style nits.";
const REVIEW_REPLY =
  "jwt.decode without verify in src/lib/auth.ts matches CVE-2022-23529. Tokens can be forged with alg none. Switched it to jwt.verify with an HS256 allowlist.";

const REVIEW_DIFF = {
  kind: "edit" as const,
  file: "src/lib/auth.ts",
  original: `export function readToken(token: string) {
  return jwt.decode(token);
}
`,
  replacement: `export function readToken(token: string) {
  return jwt.verify(token, secret, { algorithms: ["HS256"] });
}
`,
  add: 1,
  del: 1,
};

const REVIEW_TEST_DIFF = {
  kind: "edit" as const,
  file: "src/lib/auth.test.ts",
  original: `test("readToken returns the payload", () => {
  expect(readToken(token).sub).toBe("u_1");
});
`,
  replacement: `test("rejects a forged none-algorithm token", () => {
  expect(() => readToken(forgedNoneToken)).toThrow();
});
`,
  add: 2,
  del: 2,
};

const REVIEW_FILES: DemoFile[] = [
  { name: "src/lib/auth.ts", add: 6, del: 3, status: "M" },
  { name: "src/lib/auth.test.ts", add: 18, del: 2, status: "M" },
];

const EMAIL_FOLLOWUP = {
  kind: "email" as const,
  to: "waitlist (12)",
  subject: "Still want in? Shape is ready when you are.",
  body: `Hi,

You are on the list. Open the app, point it at your project, and send the first task.

Alex`,
  via: "Gmail",
};

type DoneTurn = {
  prompt: string;
  tools: { action: string; detail?: string; preview?: "slack" | "search" }[];
  reply: string;
};

const REVIEW_SEED: DoneTurn[] = [
  {
    prompt: "Walk the auth module and flag anything unsafe.",
    reply: "jwt.decode is used without verify in src/lib/auth.ts. That is the first place I would attack.",
    tools: [
      { action: "Explored", detail: "src/lib/auth.ts" },
      { action: "Searched", detail: "jwt.decode" },
    ],
  },
];

const EMAIL_SEED: DoneTurn[] = [
  {
    prompt: "Send the launch note to everyone on the waitlist through Gmail.",
    reply: "Drafted the note and sent it to 48 people on the waitlist through Gmail.",
    tools: [
      { action: "Used", detail: "Gmail" },
      { action: "Listed", detail: "waitlist" },
      { action: "Sent", detail: "48 emails" },
    ],
  },
];

const OPS_SEED: DoneTurn[] = [];

const OPS_PROMPT =
  "Send the waitlist note, check Slack, update Firebase, then email the team.";

const OPS_WAITLIST = {
  kind: "email" as const,
  to: "waitlist (48)",
  subject: "Shape is ready",
  body: `Hi,

You are on the list. Open the app, point it at a folder, and send the first task.

Alex`,
  via: "Gmail",
};

const OPS_SLACK = {
  channel: "#launch-week",
  from: "mia",
  text: "Waitlist is at 2.4k. Any blockers before we send the Friday update?",
};

const OPS_SEARCH = [
  { title: "Waitlist conversion", detail: "12.4% this week · 2,412 signups" },
  { title: "firestore/waitlist", detail: "status: invited · followUp: null" },
];

const OPS_FIREBASE = {
  kind: "edit" as const,
  file: "firestore/waitlist.json",
  original: `{
  "status": "invited",
  "followUp": null
}
`,
  replacement: `{
  "status": "notified",
  "followUp": "2026-09-06"
}
`,
  add: 2,
  del: 2,
};

const OPS_EMAIL = {
  kind: "email" as const,
  to: "team@useshape.org",
  subject: "Launch: Slack is clear, waitlist notified",
  body: `Team,

Checked #launch-week. No blockers. Firebase waitlist is marked notified, and the Friday note is out.

Alex`,
  via: "Gmail",
};

const STATIC: Record<
  Exclude<DemoChatId, "review" | "emails" | "ops">,
  { files: DemoFile[]; turns: DoneTurn[] }
> = {
  stripe: {
    files: [
      { name: "src/app/api/webhooks/stripe/route.ts", add: 62, del: 0, status: "A" },
      { name: "src/lib/stripe.ts", add: 14, del: 2, status: "M" },
    ],
    turns: [
      {
        prompt: "Wire Stripe webhooks for checkout.session.completed and cover the signature check.",
        reply:
          "The webhook route verifies the Stripe signature and marks the order paid on checkout.session.completed.",
        tools: [
          { action: "Explored", detail: "src/app/api" },
          { action: "Searched", detail: "stripe" },
          { action: "Edited", detail: "src/app/api/webhooks/stripe/route.ts" },
          { action: "Edited", detail: "src/lib/stripe.ts" },
        ],
      },
      {
        prompt: "Also handle invoice.paid and write a test for a bad signature.",
        reply: "invoice.paid now marks the subscription active. The bad-signature test is in stripe.test.ts.",
        tools: [
          { action: "Edited", detail: "src/app/api/webhooks/stripe/route.ts" },
          { action: "Edited", detail: "src/lib/stripe.test.ts" },
        ],
      },
    ],
  },
  ratelimit: {
    files: [
      { name: "src/lib/rate-limit.ts", add: 41, del: 0, status: "A" },
      { name: "src/app/api/checkout/route.ts", add: 9, del: 1, status: "M" },
    ],
    turns: [
      {
        prompt: "Add rate limiting to the /api/checkout route and cover it with tests.",
        reply: "Checkout now allows 10 requests a minute per IP. Tests are in src/lib/rate-limit.test.ts.",
        tools: [
          { action: "Explored", detail: "src/app/api/checkout" },
          { action: "Edited", detail: "src/lib/rate-limit.ts" },
          { action: "Edited", detail: "src/app/api/checkout/route.ts" },
        ],
      },
      {
        prompt: "Return 429 with a Retry-After header when the limit is hit.",
        reply: "Over-limit requests now return 429 and a Retry-After header from the checkout route.",
        tools: [{ action: "Edited", detail: "src/app/api/checkout/route.ts" }],
      },
    ],
  },
};

type Phase = "idle" | "typing" | "thinking" | "working" | "approval" | "streaming" | "done";
type TaskStatus = "running" | "pending" | "done";
type TaskItem = { id: string; label: string; status: TaskStatus };
type ToolStep = { action: string; detail?: string; preview?: "slack" | "search" };
type Approval =
  | {
      kind: "edit";
      file: string;
      original: string;
      replacement: string;
      add: number;
      del: number;
      status: "pending" | "applied" | "rejected";
    }
  | {
      kind: "email";
      to: string;
      subject: string;
      body: string;
      via: string;
      status: "pending" | "applied" | "rejected";
    };

const ANIMATED = new Set<DemoChatId>(["review", "emails", "ops"]);

function RotatingComposerHint({ paused }: { paused: boolean }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "out" | "enter">("in");
  const indexRef = useRef(0);

  useEffect(() => {
    if (paused) {
      setPhase("in");
      return;
    }
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    let enterTimer: ReturnType<typeof setTimeout> | undefined;
    const hold = window.setInterval(() => {
      setPhase("out");
      exitTimer = setTimeout(() => {
        indexRef.current = (indexRef.current + 1) % COMPOSER_HINTS.length;
        setIndex(indexRef.current);
        setPhase("enter");
        enterTimer = setTimeout(() => setPhase("in"), 30);
      }, 320);
    }, 8000);
    return () => {
      window.clearInterval(hold);
      if (exitTimer) clearTimeout(exitTimer);
      if (enterTimer) clearTimeout(enterTimer);
    };
  }, [paused]);

  return (
    <div className="t-composer-hint" aria-hidden>
      <span className="t-composer-hint__text text-sm!" data-phase={phase}>
        {COMPOSER_HINTS[index]}
      </span>
    </div>
  );
}

function SendSpiral() {
  return (
    <span className="send-spiral relative inline-block size-4" role="status" aria-label="Generating">
      {Array.from({ length: 8 }, (_, index) => (
        <span
          key={index}
          aria-hidden
          className="send-spiral-dot absolute inline-block rounded-full bg-current"
          style={{ "--spiral-i": index } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

function ComposerTasksStrip({ items }: { items: TaskItem[] }) {
  if (items.length === 0) return null;
  const active = items.find((i) => i.status === "running") ?? items[0];
  const openH = Math.min(220, 48 + items.length * 36);
  return (
    <MorphMenu
      aria-label="Tasks"
      align="start"
      openWidth={280}
      openHeight={openH}
      closedHeight={32}
      trigger={
        <>
          {active.status === "running" ? (
            <span className="t-spin-check shrink-0" data-state="spin">
              <span className="t-spin-check__ring" />
            </span>
          ) : (
            <span className="size-3.5 shrink-0 rounded-full border-2 border-text-muted/45" />
          )}
          <span className="max-w-[180px] truncate">{active.label}</span>
        </>
      }
    >
      <div className="flex flex-col py-1">
        {items.map((item) => (
          <div key={item.id} className="flex min-h-8 items-center gap-2 px-3 py-1.5 text-sm">
            {item.status === "running" ? (
              <span className="t-spin-check shrink-0" data-state="spin">
                <span className="t-spin-check__ring" />
              </span>
            ) : item.status === "done" ? (
              <Icon icon={RiCheckLine} className="text-success" />
            ) : (
              <span className="size-3.5 shrink-0 rounded-full border-2 border-text-muted/45" />
            )}
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                item.status === "running" ? "text-text-primary" : "text-text-muted",
              )}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </MorphMenu>
  );
}

function PendingEditsPanel({
  files,
  onAcceptAll,
  onUndoAll,
}: {
  files: DemoFile[];
  onAcceptAll: () => void;
  onUndoAll: () => void;
}) {
  if (files.length === 0) return null;
  const addTotal = files.reduce((s, f) => s + f.add, 0);
  const openH = Math.min(240, 56 + files.length * 36);
  return (
    <MorphMenu
      aria-label="Changes"
      align="start"
      openWidth={280}
      openHeight={openH}
      closedHeight={32}
      trigger={
        <>
          <span>Changes</span>
          {addTotal > 0 ? (
            <span className="text-success">+{addTotal}</span>
          ) : (
            <span className="tabular-nums text-text-muted">{files.length}</span>
          )}
        </>
      }
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-sm text-text-muted">
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onUndoAll}
              className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-panel-hover hover:text-text-primary"
            >
              Undo All
            </button>
            <button
              type="button"
              onClick={onAcceptAll}
              className="rounded-md bg-accent px-2 py-1 text-sm text-white"
            >
              Keep All
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {files.map((f) => (
            <div key={f.name} className="flex min-h-8 items-center gap-2 px-3 py-1.5 text-sm">
              <Icon icon={RiPencilLine} className="text-text-muted" />
              <span className="min-w-0 flex-1 truncate text-text-primary">{f.name}</span>
              <span className="text-success">+{f.add}</span>
              {f.del > 0 ? <span className="text-error">−{f.del}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </MorphMenu>
  );
}

function Composer({
  draft,
  sending,
  modeId,
  onDraft,
  onSend,
  tasks,
  pending,
  onAcceptAll,
  onUndoAll,
}: {
  draft: string;
  sending: boolean;
  modeId: (typeof CHAT_MODES)[number]["id"];
  onDraft: (v: string) => void;
  onSend: () => void;
  tasks: TaskItem[];
  pending: DemoFile[];
  onAcceptAll: () => void;
  onUndoAll: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<(typeof CHAT_MODES)[number]>(
    () => CHAT_MODES.find((m) => m.id === modeId) ?? CHAT_MODES[0],
  );
  const hasText = draft.length > 0;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  return (
    <div className="relative z-20 w-full shrink-0 overflow-visible px-5">
      <div className="relative mx-auto w-full max-w-4xl overflow-visible">
        <div
          className="pointer-events-none absolute inset-x-0 bottom-full h-40"
          style={{
            background:
              "linear-gradient(to top, var(--color-panel) 0%, color-mix(in srgb, var(--color-panel) 78%, transparent) 28%, color-mix(in srgb, var(--color-panel) 38%, transparent) 62%, transparent 100%)",
          }}
          aria-hidden
        />
        <div className="relative shrink-0 overflow-visible px-0 pb-3 pt-1">
          {sending || pending.length > 0 ? (
            <div className="mb-2 flex flex-wrap items-end justify-start gap-1.5 pl-1">
              <PendingEditsPanel files={pending} onAcceptAll={onAcceptAll} onUndoAll={onUndoAll} />
              <ComposerTasksStrip items={tasks} />
            </div>
          ) : null}
          <div className="relative z-10 overflow-visible">
            <div className="relative flex w-full flex-col rounded-3xl border border-border-subtle bg-secondary transition-colors focus-within:border-border">
              <div className="flex min-h-0 flex-col overflow-hidden rounded-[inherit]">
                <div className="relative px-4 py-3">
                  {!hasText ? (
                    <div className="pointer-events-none absolute inset-x-4 inset-y-3 z-0">
                      <RotatingComposerHint paused={sending} />
                    </div>
                  ) : null}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-4 inset-y-3 z-0 overflow-hidden whitespace-pre-wrap wrap-break-word text-sm font-medium leading-relaxed text-text-primary"
                  >
                    {hasText ? draft : "\u00a0"}
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => onDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSend();
                      }
                    }}
                    placeholder=""
                    rows={1}
                    aria-label={COMPOSER_HINTS[0]}
                    className="relative z-1 min-h-7 max-h-50 w-full resize-none field-sizing-content overflow-x-hidden overflow-y-auto border-none bg-transparent text-sm font-medium leading-relaxed text-transparent outline-none placeholder:text-text-muted"
                    style={{ caretColor: "var(--text-primary)" }}
                  />
                </div>
                <div className="flex items-center justify-between px-2 pb-2 pt-0">
                  <div className="flex min-w-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      className="size-8 shrink-0 p-0 text-text-muted hover:text-text-primary"
                      aria-label="Attach file"
                    >
                      <Icon icon={RiAddLine} />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="xs"
                            className="h-8 rounded-full px-2.5 font-medium"
                            style={{ backgroundColor: `${mode.color}22`, color: mode.color }}
                            aria-label={mode.id}
                        >
                        <div className="flex items-center gap-1.5 text-sm">
                          <Icon icon={mode.icon} />
                          <span className="truncate">{mode.id}</span>
                          <Icon icon={RiArrowDownSLine} className="opacity-70" />
                        </div>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" side="top" className="w-48">
                        {CHAT_MODES.map((m) => (
                          <DropdownMenuItem key={m.id} onClick={() => setMode(m)}>
                            <Icon icon={m.icon} />
                            <span className="flex-1">{m.id}</span>
                            {mode.id === m.id ? <Icon icon={RiCheckLine} className="text-text-muted" /> : null}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="xs"
                            className="h-8 max-w-[200px] rounded-full px-2 font-medium"
                            aria-label="Auto"
                        >
                        <div className="flex min-w-0 items-center gap-1 text-sm">
                          {providerIcon("auto", 14)}
                          <span className="truncate text-text-primary">Auto</span>
                          <span className="shrink-0 text-text-muted">Low Fast</span>
                          <Icon icon={RiArrowDownSLine} className="shrink-0 text-text-muted opacity-70" />
                        </div>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" side="top" className="w-[260px]">
                        <DropdownMenuItem>
                          <span className="flex-1">Auto</span>
                          <Icon icon={RiCheckLine} className="text-text-muted" />
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                      type="button"
                      aria-label={sending ? "Generating" : "Send"}
                      onClick={onSend}
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full transition-all",
                        hasText || sending ? "bg-accent text-white" : "bg-panel-hover text-text-muted",
                      )}
                    >
                      {sending ? <SendSpiral /> : <Icon icon={RiArrowUpLine} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolRow({ action, detail, preview }: ToolStep) {
  const key = `${action} ${detail ?? ""}`.toLowerCase();
  const brand = key.includes("gmail")
    ? "gmail"
    : key.includes("slack") || key.includes("#launch")
      ? "slack"
      : key.includes("firebase") || key.includes("firestore")
        ? "firebase"
        : null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 animate-in fade-in py-0.5 duration-300 chat-text font-medium text-text-primary/80">
        {brand === "gmail" ? <GmailLogo size={14} className="shrink-0" /> : null}
        {brand === "slack" ? <SlackLogo size={14} className="shrink-0" /> : null}
        {brand === "firebase" ? <FirebaseLogo size={14} className="shrink-0" /> : null}
        <span>
          {action}
          {detail ? (
            <>
              {" "}
              <span className="text-text-secondary">{detail}</span>
            </>
          ) : null}
        </span>
      </div>
      {preview === "slack" ? (
        <div className="my-1 ml-5 overflow-hidden rounded-xl border border-border-subtle bg-surface-3">
          <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
            <SlackLogo size={14} />
            <span className="chat-text font-medium text-text-primary">{OPS_SLACK.channel}</span>
          </div>
          <div className="px-3 py-2.5">
            <p className="chat-text font-medium text-text-primary">{OPS_SLACK.from}</p>
            <p className="mt-0.5 chat-text text-text-secondary">{OPS_SLACK.text}</p>
          </div>
        </div>
      ) : null}
      {preview === "search" ? (
        <div className="my-1 ml-5 overflow-hidden rounded-xl border border-border-subtle bg-surface-3">
          {OPS_SEARCH.map((hit) => (
            <div key={hit.title} className="border-b border-border-subtle px-3 py-2 last:border-b-0">
              <p className="chat-text font-medium text-text-primary">{hit.title}</p>
              <p className="mt-0.5 chat-text text-text-secondary">{hit.detail}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DiffPreview({ original, replacement }: { original: string; replacement: string }) {
  const rows = useMemo(() => {
    const out: { type: "add" | "remove"; line: string; num: number }[] = [];
    const oldLines = original.split("\n");
    const newLines = replacement.split("\n");
    if (oldLines[oldLines.length - 1] === "") oldLines.pop();
    if (newLines[newLines.length - 1] === "") newLines.pop();
    oldLines.forEach((line, i) => out.push({ type: "remove", line, num: i + 1 }));
    newLines.forEach((line, i) => out.push({ type: "add", line, num: i + 1 }));
    return out.slice(0, 24);
  }, [original, replacement]);

  if (rows.length === 0) return null;

  return (
    <div className="my-1.5 overflow-hidden rounded-xl border border-border-subtle bg-surface-3 max-w-full">
      <div className="max-h-[220px] overflow-y-auto chat-text font-mono">
        {rows.map((row, i) => (
          <div
            key={`${row.type}-${i}`}
            className={cn(
              "flex items-start gap-2 border-l-2 px-2 py-px",
              row.type === "add" ? "border-l-success/50 bg-success/[0.04]" : "border-l-error/40 bg-error/[0.04]",
            )}
          >
            <span className="w-8 shrink-0 select-none text-right tabular-nums text-text-disabled">{row.num}</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap">{row.line || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditApprovalRow({
  file,
  original,
  replacement,
  add,
  del,
  onResolve,
}: {
  file: string;
  original: string;
  replacement: string;
  add: number;
  del: number;
  onResolve: (approved: boolean) => void;
}) {
  const [diffOpen, setDiffOpen] = useState(true);
  const name = file.split(/[\\/]/).pop() || file;
  return (
    <div className="my-1 overflow-hidden rounded-xl border border-border-subtle bg-surface-3">
      <button
        type="button"
        onClick={() => setDiffOpen((v) => !v)}
        className="flex w-full items-center gap-2 p-2 text-left"
      >
        <Icon icon={RiPencilLine} className="shrink-0 text-text-muted" />
        <span className="truncate chat-text text-text-muted">Edit file</span>
        <span className="truncate chat-text text-text-primary">{name}</span>
        <span className="flex shrink-0 items-center gap-1 chat-text">
          <span className="text-success">+{add}</span>
          <span className="text-error">-{del}</span>
        </span>
        <Icon
          icon={RiArrowRightSLine}
          className={cn("ml-auto shrink-0 opacity-50 transition-transform duration-200", diffOpen && "rotate-90")}
        />
      </button>
      <Collapse open={diffOpen}>
        <DiffPreview original={original} replacement={replacement} />
      </Collapse>
      <div className="flex items-center justify-end gap-1.5 px-2 py-2">
        <Button type="button" variant="ghost" size="xs" onClick={() => onResolve(false)}>
          Skip
        </Button>
        <Button type="button" variant="default" size="xs" onClick={() => onResolve(true)}>
          Accept
          <kbd className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded px-1 py-px font-sans chat-text leading-none">
            ↵
          </kbd>
        </Button>
      </div>
    </div>
  );
}

function EmailApprovalRow({
  to,
  subject,
  body,
  via,
  onResolve,
}: {
  to: string;
  subject: string;
  body: string;
  via: string;
  onResolve: (approved: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="my-1 overflow-hidden rounded-xl border border-border-subtle bg-surface-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 p-2 text-left"
      >
        <GmailLogo size={14} className="shrink-0" />
        <span className="truncate chat-text text-text-muted">Send email</span>
        <span className="truncate chat-text text-text-primary">{via}</span>
        <Icon
          icon={RiArrowRightSLine}
          className={cn("ml-auto shrink-0 opacity-50 transition-transform duration-200", open && "rotate-90")}
        />
      </button>
      <Collapse open={open}>
        <div className="mx-2 mb-1.5 overflow-hidden rounded-xl border border-border-subtle bg-panel">
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 border-b border-border-subtle px-3 py-2 chat-text">
            <span className="text-text-muted">To</span>
            <span className="truncate text-text-primary">{to}</span>
          </div>
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 border-b border-border-subtle px-3 py-2 chat-text">
            <span className="text-text-muted">Subject</span>
            <span className="truncate text-text-primary">{subject}</span>
          </div>
          <div className="max-h-[180px] overflow-y-auto whitespace-pre-wrap px-3 py-2.5 chat-text text-text-primary">
            {body}
          </div>
        </div>
      </Collapse>
      <div className="flex items-center justify-end gap-1.5 px-2 py-2">
        <Button type="button" variant="ghost" size="xs" onClick={() => onResolve(false)}>
          Skip
        </Button>
        <Button type="button" variant="default" size="xs" onClick={() => onResolve(true)}>
          Send
          <kbd className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded px-1 py-px font-sans chat-text leading-none">
            ↵
          </kbd>
        </Button>
      </div>
    </div>
  );
}

function StreamText({ text, count, streaming }: { text: string; count: number; streaming: boolean }) {
  const tokens = useMemo(() => text.split(/(\s+)/), [text]);
  const shown = tokens.slice(0, count);
  return (
    <div className={cn("chat-markdown prose-compact max-w-none min-w-0", streaming && "chat-stream-fade-in")}>
      {shown.map((w, i) => (
        <span key={i} className="t-stream-w is-in">
          {w}
        </span>
      ))}
    </div>
  );
}

function AssistantTurn({
  phase,
  tools,
  workingOpen,
  onToggleWorking,
  approval,
  onResolve,
  reply,
  streamCount,
}: {
  phase: Phase;
  tools: ToolStep[];
  workingOpen: boolean;
  onToggleWorking: () => void;
  approval: Approval | null;
  onResolve: (approved: boolean) => void;
  reply: string | null;
  streamCount: number;
}) {
  return (
    <div className="group relative z-10 mb-2 flex w-full flex-col gap-1">
      <div className="flex min-w-0 flex-col gap-1 pr-6">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center overflow-visible">
            {providerIcon("auto", 20)}
          </span>
          <span className="text-sm font-medium text-text-muted">Auto</span>
        </div>
        <div className="min-w-0 chat-text text-text-primary">
          {phase === "thinking" ? <TypingDots /> : null}

          {tools.length > 0 || approval ? (
            <div className="mb-2 select-none">
              <button
                type="button"
                onClick={onToggleWorking}
                className="flex w-fit max-w-full items-center gap-1 py-0.5 chat-text font-medium text-text-muted"
              >
                <span className="wf-summary-text">
                  {phase === "thinking" || phase === "working" || phase === "approval" ? (
                    <>
                      <span className="wf-summary-text-strong">Working</span>…
                    </>
                  ) : (
                    <>
                      Worked for <span className="wf-summary-text-strong">12s</span>
                    </>
                  )}
                </span>
                <Icon
                  icon={RiArrowRightSLine}
                  className={cn("shrink-0 opacity-50 transition-transform duration-200", workingOpen && "rotate-90")}
                />
              </button>
              <Collapse open={workingOpen}>
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {tools.map((t, i) => (
                    <ToolRow key={`${i}-${t.action}-${t.detail ?? ""}`} action={t.action} detail={t.detail} preview={t.preview} />
                  ))}
                  {approval?.status === "pending" ? (
                    approval.kind === "email" ? (
                      <EmailApprovalRow
                        to={approval.to}
                        subject={approval.subject}
                        body={approval.body}
                        via={approval.via}
                        onResolve={onResolve}
                      />
                    ) : (
                      <EditApprovalRow
                        file={approval.file}
                        original={approval.original}
                        replacement={approval.replacement}
                        add={approval.add}
                        del={approval.del}
                        onResolve={onResolve}
                      />
                    )
                  ) : null}
                </div>
              </Collapse>
            </div>
          ) : null}

          {reply ? (
            <StreamText text={reply} count={streamCount} streaming={phase === "streaming"} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="relative mb-2 flex w-full animate-in fade-in slide-in-from-bottom-1 duration-200 select-text justify-end pl-10">
      <div className="group inline-flex max-w-[min(100%,36rem)] items-start gap-2">
        <div className="flex min-w-0 flex-col items-end gap-1">
          <UserMessageCard>{text}</UserMessageCard>
          <div className="flex items-center gap-0.5 select-none opacity-0 transition-opacity group-hover:opacity-100">
            <span className="rounded-md p-1 text-text-muted">
              <Icon icon={RiClipboardLine} />
            </span>
            <span className="rounded-md p-1 text-text-muted">
              <Icon icon={RiArrowGoBackLine} />
            </span>
          </div>
        </div>
        <DemoAvatar
          name="Alex"
          size={28}
          className="mt-0.5 size-7 shrink-0 rounded-full object-cover"
        />
      </div>
    </div>
  );
}

export function DemoChat({
  chatId,
  resetKey,
  onWorking,
  onFiles,
}: {
  chatId: DemoChatId;
  resetKey: number;
  onWorking: (v: boolean) => void;
  onFiles: (files: DemoFile[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [tools, setTools] = useState<ToolStep[]>([]);
  const [workingOpen, setWorkingOpen] = useState(true);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [streamCount, setStreamCount] = useState(0);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [pending, setPending] = useState<DemoFile[]>([]);
  const [fade, setFade] = useState(1);
  const [sentPrompt, setSentPrompt] = useState<string | null>(null);
  const [history, setHistory] = useState<DoneTurn[]>(() => {
    if (chatId === "emails") return EMAIL_SEED;
    if (chatId === "ops") return OPS_SEED;
    if (chatId === "review") return REVIEW_SEED;
    return STATIC[chatId as keyof typeof STATIC]?.turns ?? [];
  });
  const resolveRef = useRef<((approved: boolean) => void) | null>(null);
  const skipRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledFromTop, setScrolledFromTop] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    let cancelled = false;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    const waitApproval = (ms: number) =>
      new Promise<boolean>((resolve) => {
        const t = window.setTimeout(() => {
          resolveRef.current = null;
          resolve(true);
        }, ms);
        timers.push(t);
        resolveRef.current = (approved) => {
          window.clearTimeout(t);
          resolveRef.current = null;
          resolve(approved);
        };
      });

    const reset = (seed: DoneTurn[] = []) => {
      setDraft("");
      setPhase("idle");
      setTools([]);
      setWorkingOpen(true);
      setApproval(null);
      setReply(null);
      setStreamCount(0);
      setTasks([]);
      setPending([]);
      setSentPrompt(null);
      setHistory(seed);
      onWorking(false);
      onFiles([]);
    };

    if (!ANIMATED.has(chatId)) {
      const extra = STATIC[chatId as keyof typeof STATIC];
      setDraft("");
      setPhase("done");
      setTools([]);
      setWorkingOpen(true);
      setApproval(null);
      setReply(null);
      setStreamCount(0);
      setTasks([]);
      setPending([]);
      setSentPrompt(null);
      setHistory(extra.turns);
      onWorking(false);
      onFiles(extra.files);
      setFade(1);
      return () => {
        cancelled = true;
        timers.forEach((t) => window.clearTimeout(t));
      };
    }

    const isEmail = chatId === "emails";
    const isOps = chatId === "ops";

    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const streamReply = async (text: string) => {
      setPhase("streaming");
      setReply(text);
      const tokens = text.split(/(\s+)/);
      for (let i = 1; i <= tokens.length; i++) {
        if (cancelled) return;
        setStreamCount(i);
        await wait(28);
      }
    };

    const typePrompt = async (text: string) => {
      setPhase("typing");
      for (let i = 1; i <= text.length; i++) {
        if (cancelled || skipRef.current) break;
        setDraft(text.slice(0, i));
        await wait(22);
      }
      if (cancelled) return;
      if (!skipRef.current) await wait(350);
      skipRef.current = false;
      setDraft("");
      setSentPrompt(text);
    };

    const runApprovals = async (
      items: Array<{ approval: Omit<Approval, "status">; file?: DemoFile; tool: ToolStep }>,
      timeout = 12000,
    ) => {
      const collected: DemoFile[] = [];
      for (const item of items) {
        if (cancelled) return collected;
        setPhase("approval");
        setApproval({ ...item.approval, status: "pending" } as Approval);
        const ok = await waitApproval(timeout);
        if (cancelled) return collected;
        if (ok) {
          setApproval({ ...item.approval, status: "applied" } as Approval);
          await wait(280);
          if (cancelled) return collected;
          setTools((prev) => [...prev, item.tool]);
          if (item.file) {
            collected.push(item.file);
            setPending([...collected]);
            onFiles([...collected]);
          }
        } else {
          setTools((prev) => [...prev, { action: "Skipped", detail: item.tool.detail }]);
        }
        setApproval(null);
      }
      return collected;
    };

    const finishTurn = async (prompt: string, replyText: string, turnTools: ToolStep[]) => {
      await streamReply(replyText);
      if (cancelled) return;
      setHistory((prev) => [...prev, { prompt, tools: turnTools, reply: replyText }]);
      setSentPrompt(null);
      setTools([]);
      setReply(null);
      setStreamCount(0);
      setApproval(null);
      setPhase("done");
      onWorking(false);
      setTasks([]);
    };

    const run = async () => {
      const seed = isOps ? OPS_SEED : isEmail ? EMAIL_SEED : REVIEW_SEED;
      reset(seed);
      setFade(1);
      skipRef.current = false;

      if (reduce) {
        if (isOps) {
          setHistory([
            {
              prompt: OPS_PROMPT,
              reply: "Waitlist note is out. Slack is clear. Firebase is updated. Sent the team note through Gmail.",
              tools: [
                { action: "Sent", detail: "48 emails via Gmail" },
                { action: "Read", detail: "#launch-week" },
                { action: "Searched", detail: "waitlist conversion" },
                { action: "Edited", detail: "firestore/waitlist.json" },
                { action: "Sent", detail: "team update via Gmail" },
              ],
            },
          ]);
        } else if (isEmail) {
          setHistory([
            ...EMAIL_SEED,
            {
              prompt: "Send a follow-up to the 12 people who did not open it.",
              reply: "Sent a follow-up to 12 people through Gmail.",
              tools: [
                { action: "Used", detail: "Gmail" },
                { action: "Sent", detail: "12 emails" },
              ],
            },
          ]);
        } else {
          setHistory([
            ...REVIEW_SEED,
            {
              prompt: REVIEW_PROMPT,
              reply: REVIEW_REPLY,
              tools: [
                { action: "Explored", detail: "src/lib/auth.ts" },
                { action: "Web search", detail: "CVE jwt.decode jsonwebtoken" },
                { action: "Edited", detail: "src/lib/auth.ts" },
                { action: "Edited", detail: "src/lib/auth.test.ts" },
              ],
            },
          ]);
          onFiles(REVIEW_FILES);
        }
        setPhase("done");
        return;
      }

      if (isOps) {
        await wait(800);
        if (cancelled) return;
        await typePrompt(OPS_PROMPT);
        if (cancelled) return;
        setPhase("thinking");
        onWorking(true);
        await wait(700);
        if (cancelled) return;
        setPhase("working");
        setTasks([
          { id: "1", label: "Send waitlist note", status: "running" },
          { id: "2", label: "Check Slack", status: "pending" },
          { id: "3", label: "Update Firebase", status: "pending" },
          { id: "4", label: "Email the team", status: "pending" },
        ]);
        setTools([{ action: "Used", detail: "Gmail" }]);
        await wait(400);
        await runApprovals(
          [
            {
              approval: OPS_WAITLIST,
              tool: { action: "Sent", detail: "48 emails via Gmail" },
            },
          ],
          2400,
        );
        if (cancelled) return;
        setTasks([
          { id: "1", label: "Send waitlist note", status: "done" },
          { id: "2", label: "Check Slack", status: "running" },
          { id: "3", label: "Update Firebase", status: "pending" },
          { id: "4", label: "Email the team", status: "pending" },
        ]);
        setTools((prev) => [...prev, { action: "Used", detail: "Slack" }]);
        await wait(450);
        if (cancelled) return;
        setTools((prev) => [
          ...prev,
          { action: "Read", detail: "#launch-week", preview: "slack" },
        ]);
        await wait(900);
        if (cancelled) return;
        setTools((prev) => [
          ...prev,
          { action: "Searched", detail: "waitlist conversion", preview: "search" },
        ]);
        await wait(900);
        if (cancelled) return;
        setTasks([
          { id: "1", label: "Send waitlist note", status: "done" },
          { id: "2", label: "Check Slack", status: "done" },
          { id: "3", label: "Update Firebase", status: "running" },
          { id: "4", label: "Email the team", status: "pending" },
        ]);
        setTools((prev) => [...prev, { action: "Used", detail: "Firebase" }]);
        await wait(400);
        await runApprovals(
          [
            {
              approval: OPS_FIREBASE,
              file: { name: "firestore/waitlist.json", add: 2, del: 2, status: "M" },
              tool: { action: "Edited", detail: "firestore/waitlist.json" },
            },
          ],
          2400,
        );
        if (cancelled) return;
        setTasks([
          { id: "1", label: "Send waitlist note", status: "done" },
          { id: "2", label: "Check Slack", status: "done" },
          { id: "3", label: "Update Firebase", status: "done" },
          { id: "4", label: "Email the team", status: "running" },
        ]);
        setTools((prev) => [...prev, { action: "Used", detail: "Gmail" }]);
        await wait(400);
        await runApprovals(
          [
            {
              approval: OPS_EMAIL,
              tool: { action: "Sent", detail: "team update via Gmail" },
            },
          ],
          2400,
        );
        if (cancelled) return;
        await finishTurn(
          OPS_PROMPT,
          "Waitlist note is out. Slack is clear. Firebase is updated. Sent the team note through Gmail.",
          [
            { action: "Used", detail: "Gmail" },
            { action: "Sent", detail: "48 emails via Gmail" },
            { action: "Used", detail: "Slack" },
            { action: "Read", detail: "#launch-week", preview: "slack" },
            { action: "Searched", detail: "waitlist conversion", preview: "search" },
            { action: "Used", detail: "Firebase" },
            { action: "Edited", detail: "firestore/waitlist.json" },
            { action: "Used", detail: "Gmail" },
            { action: "Sent", detail: "team update via Gmail" },
          ],
        );
      } else if (isEmail) {
        await wait(900);
        if (cancelled) return;
        await typePrompt("Send a follow-up to the 12 people who did not open it.");
        if (cancelled) return;
        setPhase("thinking");
        onWorking(true);
        await wait(800);
        if (cancelled) return;
        setPhase("working");
        setTasks([{ id: "1", label: "Draft follow-up", status: "running" }]);
        setTools([{ action: "Used", detail: "Gmail" }]);
        await wait(500);
        await runApprovals([
          {
            approval: EMAIL_FOLLOWUP,
            tool: { action: "Sent", detail: "12 emails via Gmail" },
          },
        ]);
        if (cancelled) return;
        await finishTurn(
          "Send a follow-up to the 12 people who did not open it.",
          "Sent a follow-up to 12 people through Gmail.",
          [
            { action: "Used", detail: "Gmail" },
            { action: "Sent", detail: "12 emails via Gmail" },
          ],
        );
      } else {
        await wait(700);
        if (cancelled) return;
        await typePrompt(REVIEW_PROMPT);
        if (cancelled) return;
        setPhase("thinking");
        onWorking(true);
        await wait(900);
        if (cancelled) return;
        setPhase("working");
        setTasks([
          { id: "1", label: "Adversarial review", status: "running" },
          { id: "2", label: "Confirm CVE", status: "pending" },
        ]);
        const explore: ToolStep[] = [
          { action: "Explored", detail: "src/lib/auth.ts" },
          { action: "Searched", detail: "jwt.decode" },
          { action: "Web search", detail: "CVE-2022-23529 jsonwebtoken decode" },
        ];
        for (const row of explore) {
          if (cancelled) return;
          setTools((prev) => [...prev, row]);
          await wait(520);
        }
        setTasks([
          { id: "1", label: "Adversarial review", status: "done" },
          { id: "2", label: "Confirm CVE", status: "running" },
        ]);
        const firstFiles = await runApprovals([
          {
            approval: REVIEW_DIFF,
            file: { name: "src/lib/auth.ts", add: 6, del: 3, status: "M" },
            tool: { action: "Edited", detail: "src/lib/auth.ts" },
          },
        ]);
        if (cancelled) return;
        await wait(400);
        const secondFiles = await runApprovals([
          {
            approval: REVIEW_TEST_DIFF,
            file: { name: "src/lib/auth.test.ts", add: 18, del: 2, status: "M" },
            tool: { action: "Edited", detail: "src/lib/auth.test.ts" },
          },
        ]);
        if (cancelled) return;
        const reviewFiles = [...firstFiles, ...secondFiles];
        if (reviewFiles.length) {
          setPending(REVIEW_FILES.filter((f) => reviewFiles.some((x) => x.name === f.name)));
          onFiles(REVIEW_FILES.filter((f) => reviewFiles.some((x) => x.name === f.name)));
        }
        await finishTurn(REVIEW_PROMPT, REVIEW_REPLY, [
          ...explore,
          { action: "Edited", detail: "src/lib/auth.ts" },
          { action: "Edited", detail: "src/lib/auth.test.ts" },
        ]);
      }

      if (cancelled) return;
      await wait(10000);
      if (cancelled) return;
      setFade(0);
      await wait(400);
      if (!cancelled) void run();
    };

    void run();
    return () => {
      cancelled = true;
      resolveRef.current = null;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [chatId, resetKey, onFiles, onWorking]);

  useEffect(() => {
    if (phase !== "approval") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        resolveRef.current?.(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setScrolledFromTop(el.scrollTop > 4);
  }, [history.length, sentPrompt, streamCount, phase, tools.length]);

  const sending = phase === "thinking" || phase === "working" || phase === "approval" || phase === "streaming";

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-panel font-sans"
      style={{ opacity: fade, transition: "opacity 280ms ease" }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="pointer-events-none relative z-20 h-0 shrink-0 overflow-visible">
          <div
            className="absolute inset-x-0 top-0 h-40 transition-opacity duration-200"
            style={{
              opacity: scrolledFromTop ? 1 : 0,
              background:
                "linear-gradient(to bottom, var(--color-panel) 0%, color-mix(in srgb, var(--color-panel) 78%, transparent) 28%, color-mix(in srgb, var(--color-panel) 38%, transparent) 62%, transparent 100%)",
            }}
            aria-hidden
          />
        </div>
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            className="absolute inset-0 z-0 flex flex-col overflow-y-auto px-5 pt-8 no-scrollbar select-text"
            onScroll={(e) => setScrolledFromTop(e.currentTarget.scrollTop > 4)}
          >
            <div className="mx-auto flex min-h-full w-full min-w-0 max-w-4xl flex-col pb-72">
            {history.map((turn, i) => (
              <div key={`${turn.prompt}-${i}`}>
                <UserBubble text={turn.prompt} />
                <AssistantTurn
                  phase="done"
                  tools={turn.tools}
                  workingOpen={false}
                  onToggleWorking={() => undefined}
                  approval={null}
                  onResolve={() => undefined}
                  reply={turn.reply}
                  streamCount={turn.reply.split(/(\s+)/).length}
                />
              </div>
            ))}
            {sentPrompt ? <UserBubble text={sentPrompt} /> : null}
            {sentPrompt ? (
              <AssistantTurn
                phase={phase}
                tools={tools}
                workingOpen={workingOpen}
                onToggleWorking={() => setWorkingOpen((v) => !v)}
                approval={approval}
                onResolve={(approved) => resolveRef.current?.(approved)}
                reply={reply}
                streamCount={streamCount}
              />
            ) : null}
            <div />
          </div>
        </div>
      </div>
      <Composer
        key={chatId}
        draft={ANIMATED.has(chatId) ? draft : ""}
        sending={ANIMATED.has(chatId) && sending}
        modeId={chatId === "review" ? "Review" : chatId === "ops" || chatId === "emails" ? "Ask" : "Code"}
        onDraft={(v) => {
          if (phase === "idle" || phase === "typing") setDraft(v);
        }}
        onSend={() => {
          if (phase === "typing" || phase === "idle") skipRef.current = true;
        }}
        tasks={tasks}
        pending={pending}
        onAcceptAll={() => setPending([])}
        onUndoAll={() => {
          setPending([]);
          onFiles([]);
        }}
      />
    </div>
    </div>
  );
}

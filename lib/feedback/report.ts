import { commands } from "@/lib/backend";
import { getShapeAccessToken } from "@/lib/cloud/store";
import { SHAPE_API_BASE } from "@/lib/cloud/api";
import { redactChatForReport } from "@/lib/diagnostics/scrub";
import type { Conversation } from "@/lib/backend/types";

export const REPORT_CATEGORIES = [
  "Billing & payments",
  "Account & login",
  "Usage & credits",
  "MCPs & Skills",
  "Dashboard UI",
  "Docs & help",
  "Performance",
  "Agent / AI",
  "Misc",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export async function submitProblemReport(opts: {
  category: ReportCategory;
  message: string;
  conversation?: Conversation | null;
}) {
  const token = getShapeAccessToken();
  if (!token) throw new Error("Sign in to send a report");

  const linkedChat = opts.conversation
    ? {
        id: opts.conversation.id,
        title: opts.conversation.title,
        messages: redactChatForReport(
          opts.conversation.history.map((m) => ({ role: m.role, content: m.content })),
        ),
      }
    : undefined;

  const res = await fetch(`${SHAPE_API_BASE}/api/feedback/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      category: opts.category,
      message: opts.message,
      source: "desktop",
      page: typeof window !== "undefined" ? window.location.pathname : undefined,
      feature: "desktop-report",
      linkedChat,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Report failed");
  }
}

export async function chatsInCurrentProject(projectPath: string | null): Promise<Conversation[]> {
  return commands.getConversations(projectPath ?? undefined);
}

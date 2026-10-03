/** Privacy filter applied before anything is sent to Sentry or analytics. */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const HOME_PATH_RE =
  /(?:[A-Z]:\\Users\\[^\\]+|\/Users\/[^/]+|\/home\/[^/]+|C:\\Users\\[^\\]+)/gi;
const SECRET_RE =
  /(?:(?:sk|pk|rk|whsec|api)[_-](?:live|test)?[_-]?[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----)/gi;

export function redactText(input: string, max = 2000): string {
  return input
    .replace(EMAIL_RE, "[email]")
    .replace(HOME_PATH_RE, "~")
    .replace(SECRET_RE, "[redacted]")
    .slice(0, max);
}

export function redactChatForReport(
  messages: { role?: string; content?: string }[],
  maxMessages = 40,
  maxChars = 12000,
): { role: string; content: string }[] {
  const out: { role: string; content: string }[] = [];
  let used = 0;
  for (const msg of messages.slice(-maxMessages)) {
    const role = msg.role === "assistant" ? "assistant" : "user";
    let content = redactText(String(msg.content ?? ""), 800);
    if (used + content.length > maxChars) {
      content = content.slice(0, Math.max(0, maxChars - used));
    }
    if (!content) continue;
    out.push({ role, content });
    used += content.length;
    if (used >= maxChars) break;
  }
  return out;
}

export function sentryBeforeSend<T extends { request?: unknown; extra?: unknown }>(event: T): T | null {
  if (event.request && typeof event.request === "object") {
    const req = event.request as { headers?: Record<string, string>; cookies?: unknown };
    if (req.headers) {
      for (const key of Object.keys(req.headers)) {
        if (/authorization|cookie|token|secret/i.test(key)) req.headers[key] = "[redacted]";
      }
    }
    delete req.cookies;
  }
  return event;
}

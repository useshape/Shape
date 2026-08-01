/** Strip PII and content from telemetry payloads before they leave the client. */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const HOME_PATH_RE =
  /(?:[A-Z]:\\Users\\[^\\]+|\/Users\/[^/]+|\/home\/[^/]+|C:\\Users\\[^\\]+)/gi;

export function messageLengthBucket(length: number): "xs" | "sm" | "md" | "lg" | "xl" {
  if (length < 100) return "xs";
  if (length < 500) return "sm";
  if (length < 2000) return "md";
  if (length < 8000) return "lg";
  return "xl";
}

export function classifyError(message: string, stack?: string): string {
  const text = `${message} ${stack ?? ""}`.toLowerCase();
  if (/next(\.js)?|hydration|webpack-internal|__next|rsc/.test(text)) return "nextjs";
  if (/react|did not match|minified react|rendered more hooks/.test(text)) return "react";
  if (/tauri|invoke|ipc|webview/.test(text)) return "tauri";
  if (/fetch|network|econnrefused|failed to fetch|timeout/.test(text)) return "network";
  if (/typescript|tsc|diagnostic/.test(text)) return "typescript";
  if (/openrouter|usage not allowed|credits/.test(text)) return "billing";
  if (/chat|agent|subagent/.test(text)) return "ai";
  return "unknown";
}

function redactText(input: string, max = 180): string {
  return input
    .replace(EMAIL_RE, "[email]")
    .replace(HOME_PATH_RE, "~")
    .replace(/\/[^\s'"]+\/[^\s'"]+\/[^\s'"]+/g, (m) => {
      const parts = m.split("/");
      return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : m;
    })
    .slice(0, max);
}

export function sanitizeError(err: unknown): {
  error_type: string;
  error_message: string;
  stack_hint?: string;
} {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  const stack = err instanceof Error ? err.stack : undefined;
  const error_type = classifyError(message, stack);
  const error_message = redactText(message);
  const stack_hint = stack
    ? redactText(
        stack
          .split("\n")
          .slice(0, 2)
          .join(" | "),
        240,
      )
    : undefined;
  return { error_type, error_message, ...(stack_hint ? { stack_hint } : {}) };
}

export function sanitizeTelemetryProperties(
  properties?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!properties) return undefined;

  const blocked = new Set([
    "content",
    "message",
    "prompt",
    "response",
    "text",
    "body",
    "password",
    "token",
    "email",
    "name",
    "code",
    "source",
    "file_content",
    "chat",
  ]);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    const lower = key.toLowerCase();
    if (blocked.has(lower) || lower.includes("password") || lower.includes("secret")) continue;

    if (typeof value === "string") {
      out[key] = redactText(value, 120);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value
        .slice(0, 8)
        .map((item) => (typeof item === "string" ? redactText(item, 60) : item));
    } else if (typeof value === "object") {
      out[key] = sanitizeTelemetryProperties(value as Record<string, unknown>);
    }
  }
  return out;
}

type Line = { at: number; text: string };

const lines: Line[] = [];
const listeners = new Set<() => void>();
const startedAt = typeof performance !== "undefined" ? performance.now() : 0;

function emit() {
    listeners.forEach((listener) => listener());
}

/** Append a tab-switch timing line. Shown in the in-app log panel. */
export function tabLog(text: string) {
    const at = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    lines.push({ at, text });
    if (lines.length > 200) lines.splice(0, lines.length - 200);
    emit();
}

export function tabLogText(): string {
    if (lines.length === 0) return "No tab switches yet. Click a chat tab, then copy this log.";
    return lines.map((line) => `${line.at.toFixed(1).padStart(9, " ")} ms  ${line.text}`).join("\n");
}

export function clearTabLog() {
    lines.splice(0, lines.length);
    emit();
}

export function subscribeTabLog(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

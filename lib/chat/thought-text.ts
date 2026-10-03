/** Collapse word-per-line thought dumps into readable prose. */
export function joinThoughtLines(content: string): string {
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    if (lines.length < 4) return content;
    const nonempty = lines.filter((l) => l.trim().length > 0);
    if (nonempty.length < 4) return content;
    const short = nonempty.filter((l) => l.trim().split(/\s+/).length <= 2);
    if (short.length < nonempty.length * 0.7) return content;
    return nonempty.map((l) => l.trim()).join(" ");
}

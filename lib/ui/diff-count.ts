import { diffLines } from "diff";

export type DiffRow = { type: "add" | "remove"; line: string; num: number };

export type UnifiedDiffRow = {
    type: "add" | "remove" | "context" | "hunk";
    line: string;
    oldNum?: number;
    newNum?: number;
};

/** Changed lines only, counted the same way a diff preview renders them. */
export function changedDiffLines(original: string, replacement: string): DiffRow[] {
    const changes = diffLines(original || "", replacement || "");
    const out: DiffRow[] = [];
    let oldNum = 1;
    let newNum = 1;
    for (const part of changes) {
        const lines = part.value.split("\n");
        if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
        for (const line of lines) {
            if (part.added) {
                out.push({ type: "add", line, num: newNum });
                newNum += 1;
            } else if (part.removed) {
                out.push({ type: "remove", line, num: oldNum });
                oldNum += 1;
            } else {
                oldNum += 1;
                newNum += 1;
            }
        }
    }
    return out;
}

/** Unified diff with a few context lines around each change. */
export function unifiedDiffRows(
    original: string,
    replacement: string,
    context = 2,
): UnifiedDiffRow[] {
    const changes = diffLines(original || "", replacement || "");
    type Raw = { type: "add" | "remove" | "same"; line: string; oldNum?: number; newNum?: number };
    const raw: Raw[] = [];
    let oldNum = 1;
    let newNum = 1;
    for (const part of changes) {
        const lines = part.value.split("\n");
        if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
        for (const line of lines) {
            if (part.added) {
                raw.push({ type: "add", line, newNum });
                newNum += 1;
            } else if (part.removed) {
                raw.push({ type: "remove", line, oldNum });
                oldNum += 1;
            } else {
                raw.push({ type: "same", line, oldNum, newNum });
                oldNum += 1;
                newNum += 1;
            }
        }
    }

    const keep = new Set<number>();
    for (let i = 0; i < raw.length; i++) {
        if (raw[i]!.type === "same") continue;
        for (let j = Math.max(0, i - context); j <= Math.min(raw.length - 1, i + context); j++) {
            keep.add(j);
        }
    }
    if (keep.size === 0) return [];

    const out: UnifiedDiffRow[] = [];
    let lastKept = -2;
    for (let i = 0; i < raw.length; i++) {
        if (!keep.has(i)) continue;
        if (i - lastKept > 1) {
            const r = raw[i]!;
            out.push({
                type: "hunk",
                line: `@@ -${r.oldNum ?? r.newNum ?? 0},… +${r.newNum ?? r.oldNum ?? 0},… @@`,
            });
        }
        lastKept = i;
        const r = raw[i]!;
        if (r.type === "same") {
            out.push({ type: "context", line: r.line, oldNum: r.oldNum, newNum: r.newNum });
        } else if (r.type === "add") {
            out.push({ type: "add", line: r.line, newNum: r.newNum });
        } else {
            out.push({ type: "remove", line: r.line, oldNum: r.oldNum });
        }
    }
    return out;
}

/** Parse a unified git/patch body into display rows. */
export function parseUnifiedDiffBody(body: string): UnifiedDiffRow[] {
    const out: UnifiedDiffRow[] = [];
    for (const line of body.split("\n")) {
        if (line.startsWith("@@")) {
            out.push({ type: "hunk", line });
        } else if (line.startsWith("+") && !line.startsWith("+++")) {
            out.push({ type: "add", line: line.slice(1) });
        } else if (line.startsWith("-") && !line.startsWith("---")) {
            out.push({ type: "remove", line: line.slice(1) });
        } else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
            out.push({ type: "hunk", line });
        } else {
            const text = line.startsWith(" ") ? line.slice(1) : line;
            out.push({ type: "context", line: text });
        }
    }
    return out;
}

export function countChangedLines(original: string, replacement: string): { add: number; del: number } {
    let add = 0;
    let del = 0;
    for (const row of changedDiffLines(original, replacement)) {
        if (row.type === "add") add += 1;
        else del += 1;
    }
    return { add, del };
}

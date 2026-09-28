import { diffLines } from "diff";

export type DiffRow = { type: "add" | "remove"; line: string; num: number };

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

export function countChangedLines(original: string, replacement: string): { add: number; del: number } {
    let add = 0;
    let del = 0;
    for (const row of changedDiffLines(original, replacement)) {
        if (row.type === "add") add += 1;
        else del += 1;
    }
    return { add, del };
}

export type PlanTodo = { label: string; done: boolean };

export type PlanPreview = {
    title: string;
    goal: string;
    todos: string[];
};

const TODO_BLOCK = /(?:\n|^)<!--shape-todos\r?\n([\s\S]*?)-->\s*$/;

function todoLabel(line: string): string | null {
    const trimmed = line.trim();
    const checkbox = trimmed.match(/^[-*]\s*\[[^\]]*\]\s*(.+)/);
    if (checkbox?.[1]) return checkbox[1].trim();
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (numbered?.[1]) return numbered[1].trim();
    const plain = trimmed.match(/^[-*]\s+(.+)/);
    if (plain?.[1] && !plain[1].startsWith("[")) return plain[1].trim();
    return null;
}

function parseTodoLine(line: string): PlanTodo | null {
    const trimmed = line.trim();
    const checkbox = trimmed.match(/^[-*]\s*\[([^\]]*)\]\s*(.+)/);
    if (checkbox?.[2]) {
        return {
            label: checkbox[2].trim(),
            done: checkbox[1].toLowerCase().includes("x"),
        };
    }
    const label = todoLabel(trimmed);
    return label ? { label, done: false } : null;
}

function extractSection(markdown: string, heading: string): string {
    const pattern = new RegExp(
        `(?:^|\\n)##\\s*${heading}\\s*\\n+([\\s\\S]*?)(?=\\n## |\\n# |$)`,
        "i",
    );
    return pattern.exec(markdown)?.[1]?.trim() ?? "";
}

function stripTodosSection(markdown: string): string {
    return markdown.replace(
        /(?:^|\n)##\s*Todos?\s*\n[\s\S]*?(?=\n## |\n# |$)/i,
        "\n",
    );
}

/** Body (no todo section) + checklist stored outside the document. */
export function splitPlanDocument(markdown: string): { body: string; todos: PlanTodo[] } {
    const normalized = markdown.replace(/\r\n/g, "\n");
    const block = TODO_BLOCK.exec(normalized);
    let body = block ? normalized.slice(0, block.index).trimEnd() : normalized;
    const fromBlock: PlanTodo[] = [];
    if (block?.[1]) {
        for (const line of block[1].split("\n")) {
            const t = parseTodoLine(line);
            if (t) fromBlock.push(t);
        }
    }
    const section = extractSection(body, "Todos?") || extractSection(body, "Todo");
    const fromSection: PlanTodo[] = [];
    if (section) {
        for (const line of section.split("\n")) {
            const t = parseTodoLine(line);
            if (t) fromSection.push(t);
        }
        body = stripTodosSection(body).replace(/\n{3,}/g, "\n\n").trim();
    }
    return { body, todos: fromBlock.length ? fromBlock : fromSection };
}

export function joinPlanDocument(body: string, todos: PlanTodo[]): string {
    const trimmed = body.replace(/\r\n/g, "\n").trimEnd();
    if (todos.length === 0) return `${trimmed}\n`;
    const lines = todos
        .map((t) => `- [${t.done ? "x" : " "}] ${t.label}`)
        .join("\n");
    return `${trimmed}\n\n<!--shape-todos\n${lines}\n-->\n`;
}

/** Plan name from the document heading, otherwise a readable form of the slug or filename. */
export function displayPlanName(fallback: string, markdownTitle?: string): string {
    const fromDoc = markdownTitle?.trim();
    if (fromDoc && !/^plan$/i.test(fromDoc)) return fromDoc;
    const raw = fallback.trim();
    if (!raw) return "Plan";
    const slug = raw.replace(/\.plan\.md$/i, "").replace(/\.md$/i, "").replace(/\.plan$/i, "");
    if (/\s/.test(slug)) return slug;
    return humanizePlanTitle(slug);
}

export function humanizePlanTitle(slug: string): string {
    return slug
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

function extractTitle(markdown: string): string {
    const heading = markdown.match(/^#\s+(.+)$/m)?.[1] ?? "";
    return heading.replace(/[*_`]/g, "").trim();
}

export function parsePlanMarkdown(markdown: string): PlanPreview {
    const { body, todos } = splitPlanDocument(markdown);
    const title = extractTitle(body);

    const goalBlock = extractSection(body, "Goal");
    const goal =
        goalBlock
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line && !line.startsWith("#")) ?? "";

    return { title, goal, todos: todos.map((t) => t.label) };
}

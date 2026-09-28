export type PlanPreview = {
    title: string;
    goal: string;
    todos: string[];
};

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

function extractSection(markdown: string, heading: string): string {
    const pattern = new RegExp(
        `(?:^|\\n)##\\s*${heading}\\s*\\n+([\\s\\S]*?)(?=\\n## |\\n# |$)`,
        "i",
    );
    return pattern.exec(markdown)?.[1]?.trim() ?? "";
}

function extractTitle(markdown: string): string {
    const heading = markdown.match(/^#\s+(.+)$/m)?.[1] ?? "";
    return heading.replace(/[*_`]/g, "").trim();
}

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

export function parsePlanMarkdown(markdown: string): PlanPreview {
    const normalized = markdown.replace(/\r\n/g, "\n");
    const title = extractTitle(normalized);

    const goalBlock = extractSection(normalized, "Goal");
    const goal =
        goalBlock
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line && !line.startsWith("#")) ?? "";

    const todosBlock =
        extractSection(normalized, "Todos?")
        || extractSection(normalized, "Todo")
        || extractSection(normalized, "Tasks?");
    const todos: string[] = [];
    if (todosBlock) {
        for (const line of todosBlock.split("\n")) {
            const label = todoLabel(line);
            if (label) todos.push(label);
        }
    }

    return { title, goal, todos };
}

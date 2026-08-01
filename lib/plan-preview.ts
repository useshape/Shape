export type PlanPreview = {
    goal: string;
    todos: string[];
};

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

export function parsePlanMarkdown(markdown: string): PlanPreview {
    const normalized = markdown.replace(/\r\n/g, "\n");

    const goalBlock = extractSection(normalized, "Goal");
    const goal =
        goalBlock
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line && !line.startsWith("#")) ?? "";

    const todosBlock = extractSection(normalized, "Todos?") || extractSection(normalized, "Todo");
    const todos: string[] = [];
    if (todosBlock) {
        for (const line of todosBlock.split("\n")) {
            const checkbox = line.match(/^-\s*\[[^\]]*\]\s*(.+)/);
            const plain = line.match(/^-\s+(.+)/);
            const label = checkbox?.[1] ?? plain?.[1];
            if (label?.trim()) todos.push(label.trim());
        }
    }

    return { goal, todos };
}

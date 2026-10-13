"use client";

/**
 * A parsed `SKILL.md`: metadata from YAML frontmatter plus the instruction body.
 * See the Agent Skills specification (agentskills.io/specification) for the
 * fields — `name` and `description` are the ones Shape uses.
 */
export type SkillDocument = {
    /** Frontmatter `name`, or the folder/file name when it is absent. */
    name: string;
    /** Frontmatter `description` (with `when_to_use` appended), or "". */
    description: string;
    /** Instructions with the frontmatter removed. */
    body: string;
};

const FRONTMATTER_RE = /^\uFEFF?\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const KEY_RE = /^([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$/;
const BLOCK_SCALAR_RE = /^[>|][+-]?$/;
const INDENTED_RE = /^[ \t]+\S/;

function stripQuotes(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return trimmed.slice(1, -1).trim();
        }
    }
    return trimmed;
}

/**
 * Parse the frontmatter block. Scalars, quoted scalars, and `>`/`|` block
 * scalars are supported — the shapes skill authors actually use.
 */
function parseFrontmatterBlock(block: string): Record<string, string> {
    const values: Record<string, string> = {};
    const lines = block.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
        const match = KEY_RE.exec(lines[index]);
        if (!match) continue;
        const key = match[1].toLowerCase();
        let value = match[2].trim();

        if (BLOCK_SCALAR_RE.test(value)) {
            const literal = value.startsWith("|");
            const collected: string[] = [];
            while (index + 1 < lines.length && (INDENTED_RE.test(lines[index + 1]) || lines[index + 1].trim() === "")) {
                collected.push(lines[index + 1].replace(/^[ \t]{2}/, "").replace(/^[ \t]/, ""));
                index += 1;
            }
            while (collected.length > 0 && collected[collected.length - 1].trim() === "") collected.pop();
            value = literal ? collected.join("\n") : collected.map((line) => line.trim()).join(" ").trim();
        } else {
            value = stripQuotes(value);
        }

        if (key && value) values[key] = value;
    }

    return values;
}

/**
 * Split a skill file into metadata and instructions. Files without frontmatter
 * are treated as plain instructions, which keeps the loose `.agents/*.md` and
 * `.claude/*.mdc` conventions working.
 */
export function parseSkillDocument(raw: string, fallbackName: string): SkillDocument {
    const match = FRONTMATTER_RE.exec(raw);
    if (!match) {
        return { name: fallbackName, description: "", body: raw.trim() };
    }

    const front = parseFrontmatterBlock(match[1]);
    const body = raw.slice(match[0].length).trim();
    const description = [front.description, front.when_to_use].filter(Boolean).join(" ").trim();

    return {
        name: front.name || fallbackName,
        description,
        body,
    };
}

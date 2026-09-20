import { commands } from "@/lib/backend/commands";

const RULES_FILE = ".shape/rules.md";
const RULES_DIR = ".shape/rules";

async function readRulesFile(relativePath: string, projectPath: string): Promise<string | null> {
    const sep = projectPath.includes("\\") ? "\\" : "/";
    const fullPath = `${projectPath.replace(/[\\/]+$/, "")}${sep}${relativePath.replace(/\//g, sep)}`;
    try {
        const content = await commands.readFile(fullPath);
        return content.trim() || null;
    } catch {
        return null;
    }
}

async function collectRulesFromDir(projectPath: string): Promise<string[]> {
    const sep = projectPath.includes("\\") ? "\\" : "/";
    const dirPath = `${projectPath.replace(/[\\/]+$/, "")}${sep}${RULES_DIR.replace(/\//g, sep)}`;
    try {
        const entries = await commands.lsDir(dirPath);
        const parts: string[] = [];
        for (const entry of entries) {
            if (entry.is_dir) continue;
            if (!/\.(md|mdc|txt)$/i.test(entry.name)) continue;
            const content = await readRulesFile(`${RULES_DIR}/${entry.name}`, projectPath);
            if (content) {
                parts.push(`## ${entry.name}\n\n${content}`);
            }
        }
        return parts;
    } catch {
        return [];
    }
}

/** Load project rules from `.shape/rules.md` and `.shape/rules/*`. */
export async function loadProjectRules(projectPath: string | null): Promise<string> {
    if (!projectPath) return "";

    const sections: string[] = [];
    const rootRules = await readRulesFile(RULES_FILE, projectPath);
    if (rootRules) {
        sections.push(rootRules);
    }

    const dirRules = await collectRulesFromDir(projectPath);
    sections.push(...dirRules);

    return sections.join("\n\n").trim();
}

export async function ensureProjectRulesScaffold(projectPath: string): Promise<void> {
    const existing = await loadProjectRules(projectPath);
    if (existing) return;
    const sep = projectPath.includes("\\") ? "\\" : "/";
    const rulesPath = `${projectPath.replace(/[\\/]+$/, "")}${sep}${RULES_FILE.replace(/\//g, sep)}`;
    const template = `# Project rules

Add conventions, stack notes, and patterns for the agent to follow in this repo.
`;
    try {
        await commands.createFile(rulesPath);
        await commands.saveFile(rulesPath, template);
    } catch {
        // Best-effort scaffold only.
    }
}

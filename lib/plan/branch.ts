import { commands } from "@/lib/backend";

function planBranchName(title?: string): string {
    const slug =
        (title || "plan")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "plan";
    return `shape/${slug}`;
}

/** Create and switch to a `shape/<plan>` branch so Build work stays off the user's current branch. */
export async function isolatePlanBranch(
    projectPath: string | null | undefined,
    title?: string,
): Promise<string | null> {
    if (!projectPath) return null;
    const branch = planBranchName(title);
    try {
        const current = await commands.gitCurrentBranch(projectPath);
        if (!current) return null;
        if (current === branch || current.startsWith("shape/")) return current;
        try {
            await commands.gitCreateBranch(projectPath, branch);
        } catch {
            /* already exists */
        }
        await commands.gitSwitchBranch(projectPath, branch);
        return branch;
    } catch {
        return null;
    }
}

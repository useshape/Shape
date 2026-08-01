/** Structured continue actions shown as a connected bar under "Continue" in chat. */

export type ShapeContinueAction = { type: "plan_build"; path: string; title: string };

const ACTION_RE = /<shape_action\s+type="(plan_build)"([^>]*)\/>\s*/i;

function attr(attrs: string, name: string): string {
    return attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
}

export function parseShapeContinueAction(content: string): {
    action: ShapeContinueAction | null;
    displayText: string;
} {
    const match = content.match(ACTION_RE);
    if (!match) {
        return { action: null, displayText: content };
    }
    const attrs = match[2] ?? "";

    return {
        action: {
            type: "plan_build",
            path: attr(attrs, "path"),
            title: attr(attrs, "title") || "Plan",
        },
        displayText: "Continue",
    };
}

export function buildPlanBuildMessage(path: string, title?: string): string {
    const safeTitle = (title || "Plan").replace(/"/g, "'");
    const safePath = path.replace(/"/g, "'");
    return [
        `<shape_action type="plan_build" path="${safePath}" title="${safeTitle}" />`,
        "Continue.",
        "",
        `Build the plan at ${path}. Follow it step by step.`,
        "",
        "First read the plan file. Then call update_todos with the full checklist derived from the plan's ## Todos checkboxes (or numbered implementation steps).",
        "Keep exactly one todo in_progress while working. Call update_todos again whenever you complete a step or switch active work. Mark all todos completed before calling finish.",
    ].join("\n");
}

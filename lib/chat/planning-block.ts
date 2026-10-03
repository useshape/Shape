export function todoCountLabel(completed: number, total: number): string {
    return `${completed}/${total}`;
}

export type PlanStepStatus = "done" | "active" | "pending" | "cancelled";

export function freezeActiveSteps<T extends { status: PlanStepStatus }>(
    steps: T[],
    isGenerating?: boolean,
): T[] {
    return steps.map((step) =>
        !isGenerating && step.status === "active" ? { ...step, status: "pending" as const } : step,
    );
}

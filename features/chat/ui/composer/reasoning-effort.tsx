export type ReasoningEffort = "low" | "high" | "ultra" | "max";

export const REASONING_EFFORTS: { value: ReasoningEffort; label: string }[] = [
    { value: "low", label: "Low" },
    { value: "high", label: "Medium" },
    { value: "ultra", label: "High" },
    { value: "max", label: "Extra High" },
];

export function effortDisplayLabel(id: ReasoningEffort): string {
    return REASONING_EFFORTS.find((o) => o.value === id)?.label ?? "Low";
}

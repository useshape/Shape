export type ReasoningEffort = "low" | "high" | "ultra" | "max" | "super";

export const REASONING_EFFORTS: { value: ReasoningEffort; label: string; super?: boolean }[] = [
    { value: "low", label: "Low" },
    { value: "high", label: "Medium" },
    { value: "ultra", label: "High" },
    { value: "max", label: "Extra High" },
    { value: "super", label: "Super", super: true },
];

export function effortDisplayLabel(id: ReasoningEffort): string {
    return REASONING_EFFORTS.find((o) => o.value === id)?.label ?? "Low";
}

/** Flagship reasoning models. Fast / mini variants stay on the normal stops. */
export function modelSupportsSuperThinking(modelId: string): boolean {
    const id = modelId.trim().toLowerCase();
    if (!id || id === "auto" || id.endsWith("/auto")) return true;
    if (/flash|haiku|mini|nano|luna|27b/.test(id)) return false;
    return /opus|sonnet|gpt-5|grok|gemini-3\.1-pro|deepseek-v4-pro|qwen3\.8-max|glm-5\.3/.test(id);
}

export function effortsForModel(modelId: string) {
    const superOk = modelSupportsSuperThinking(modelId);
    return REASONING_EFFORTS.filter((stop) => !stop.super || superOk);
}

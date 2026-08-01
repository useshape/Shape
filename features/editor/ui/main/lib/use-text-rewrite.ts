"use client";

import { useCallback, useState } from "react";
import { commands } from "@/lib/backend/commands";
import { getSettings } from "@/lib/settings";
import { checkUsage } from "@/lib/shape-auth/api";
import { getShapeAccessToken, refreshShapeAuth, useShapeAuth } from "@/lib/shape-auth/store";
import { notificationStore } from "@/features/notifications";
import { captureTelemetry, captureTelemetryError } from "@/lib/telemetry";
import { messageLengthBucket } from "@/lib/telemetry-sanitize";

export type TextRewriteAction =
    | "rewrite"
    | "shorter"
    | "longer"
    | "professional"
    | "casual"
    | "friendly";

const ACTION_PROMPTS: Record<TextRewriteAction, string> = {
    rewrite: "Rewrite the following text to improve clarity while keeping the same meaning. Return only the rewritten text with no quotes or explanation:",
    shorter: "Make the following text shorter while keeping the core meaning. Return only the shortened text:",
    longer: "Expand the following text with more detail. Return only the expanded text:",
    professional: "Rewrite the following text in a professional tone. Return only the rewritten text:",
    casual: "Rewrite the following text in a casual tone. Return only the rewritten text:",
    friendly: "Rewrite the following text in a friendly tone. Return only the rewritten text:",
};

function stripAssistantResponse(raw: string): string {
    const trimmed = raw.trim();
    const codeFence = trimmed.match(/^```(?:\w+)?\n?([\s\S]*?)\n?```$/);
    if (codeFence) return codeFence[1].trim();
    return trimmed.replace(/^["']|["']$/g, "");
}

export function useTextRewrite(model = "auto") {
    const shapeAuth = useShapeAuth();
    const [loading, setLoading] = useState(false);

    const rewrite = useCallback(async (text: string, action: TextRewriteAction): Promise<string | null> => {
        if (!shapeAuth.loggedIn) {
            notificationStore.add("Sign in to use AI", "warning", undefined, { autoHide: true });
            return null;
        }

        const token = shapeAuth.accessToken ?? (await getShapeAccessToken());
        if (!token) {
            notificationStore.add("Sign in to use AI", "warning", undefined, { autoHide: true });
            return null;
        }

        setLoading(true);
        try {
            const usageCheck = await checkUsage(token, model);
            if (!usageCheck.allowed) {
                notificationStore.add(usageCheck.reason ?? "Usage not allowed", "error", undefined, { autoHide: true });
                return null;
            }

            const prompt = `${ACTION_PROMPTS[action]}\n\n${text}`;
            const settings = getSettings();
            void captureTelemetry("ai_rewrite_started", {
                action,
                model,
                selection_length_bucket: messageLengthBucket(text.length),
            });
            const response = await commands.sendChatMessage(
                prompt,
                model,
                "Ask",
                settings.ai.customSystemPrompt || undefined,
                settings.ai.customRules || undefined,
                token,
            );

            await refreshShapeAuth();
            void captureTelemetry("ai_rewrite_complete", { action, model });
            return stripAssistantResponse(response);
        } catch (err) {
            void captureTelemetryError(err, { feature: "ai_rewrite", action, model });
            const message = err instanceof Error ? err.message : String(err);
            notificationStore.add("AI rewrite failed", "error", message, { autoHide: true });
            return null;
        } finally {
            setLoading(false);
        }
    }, [model, shapeAuth.accessToken, shapeAuth.loggedIn]);

    return { rewrite, loading, loggedIn: shapeAuth.loggedIn };
}

/** @deprecated use useTextRewrite */
export const usePreviewTextRewrite = useTextRewrite;

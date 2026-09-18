"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogBody,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { classifyAiError, errorDocsUrl } from "@/lib/errors/catalog";
import { commands } from "@/lib/backend";

export function ChatErrorDialog({
    message,
    onDismiss,
    onRetry,
}: {
    message: string | null;
    onDismiss: () => void;
    onRetry?: () => void;
}) {
    const entry = classifyAiError(message ?? "");
    const openaiBilling = /platform\.openai\.com/i.test(message ?? "");
    const isQuota = entry.code === 2001;
    const docsUrl = openaiBilling
        ? "https://platform.openai.com/settings/organization/billing/"
        : errorDocsUrl(entry.code);
    const isModelBusy = /model_busy|model is busy|high\s*(load|demand)/i.test(message ?? "");
    const isTransient =
        Boolean(message)
        && !isQuota
        && (entry.code === 2100
            || /rate\s*limit/i.test(message ?? "")
            || isModelBusy
            || /too many requests/i.test(message ?? ""));

    const title = !message
        ? entry.title
        : isTransient
            ? isModelBusy
                ? "Model busy"
                : "Rate limited"
            : entry.title;

    const hint = !message
        ? ""
        : isTransient
            ? isModelBusy
                ? "This model is under heavy load. Wait a moment or switch models."
                : "Try again or switch models."
            : openaiBilling || (isQuota && /openai api error/i.test(message))
                ? "(api.openai.com) has exausted its credits, Add credits to continue."
                : isQuota && /openrouter api error/i.test(message)
                    ? "(openrouter.ai) has exausted its credits, Add credits to continue."
                    : entry.description;

    return (
        <AlertDialog open={Boolean(message)} onOpenChange={(open) => { if (!open) onDismiss(); }}>
            <AlertDialogContent sizeClassName="max-w-[400px]">
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription className="sr-only">{hint}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogBody className="flex flex-col text-start">
                    {hint ? (
                        <p className="text-sm text-text-secondary leading-snug">{hint}</p>
                    ) : null}
                </AlertDialogBody>
                <AlertDialogFooter>
                    <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        className="w-full bg-panel-hover"
                        onClick={() => void commands.openUrlExternal(docsUrl)}
                    >
                        {openaiBilling ? "Add credits" : "Learn more"}
                    </Button>
                    {onRetry && isTransient ? (
                        <AlertDialogAction asChild>
                            <Button type="button" size="lg" className="w-full" onClick={onRetry}>
                                Try again
                            </Button>
                        </AlertDialogAction>
                    ) : (
                        <AlertDialogAction asChild>
                            <Button type="button" size="lg" className="w-full" onClick={onDismiss}>
                                OK
                            </Button>
                        </AlertDialogAction>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

"use client";

import React from "react";
import type { IconModule } from "thesvg";
import anthropic from "thesvg/anthropic";
import openai from "thesvg/openai";
import gemini from "thesvg/gemini";
import grok from "thesvg/grok";
import deepseek from "thesvg/deepseek";
import qwen from "thesvg/qwen";
import minimax from "thesvg/minimax";
import moonshot from "thesvg/moonshot-ai";
import mistral from "thesvg/mistral-ai";
import meta from "thesvg/meta";
import cohere from "thesvg/cohere";
import zhipu from "thesvg/zhipu";
import { ShapeLogo } from "@/components/ui/shape-logo";

type Provider =
    | "shape"
    | "anthropic"
    | "openai"
    | "google"
    | "x-ai"
    | "deepseek"
    | "z-ai"
    | "qwen"
    | "minimax"
    | "moonshotai"
    | "mistralai"
    | "meta"
    | "cohere";

const BRANDS: Record<Exclude<Provider, "shape">, IconModule> = {
    anthropic,
    openai,
    google: gemini,
    "x-ai": grok,
    deepseek,
    "z-ai": zhipu,
    qwen,
    minimax,
    moonshotai: moonshot,
    mistralai: mistral,
    meta,
    cohere,
};

function providerFromModelId(modelId: string): Provider {
    if (modelId === "auto" || modelId === "openrouter/auto") return "shape";
    const prefix = modelId.split("/")[0]?.toLowerCase();
    if (prefix === "meta-llama") return "meta";
    if (
        prefix === "anthropic" || prefix === "openai" || prefix === "google" || prefix === "x-ai"
        || prefix === "deepseek" || prefix === "z-ai" || prefix === "qwen" || prefix === "minimax"
        || prefix === "moonshotai" || prefix === "mistralai" || prefix === "cohere"
    ) {
        return prefix;
    }
    return "shape";
}

function BrandIcon({ icon, size }: { icon: IconModule; size: number }) {
    const html = icon.variants.dark || icon.variants.default || icon.svg;
    return (
        <span
            aria-hidden
            className="inline-flex shrink-0 [&_svg]:size-full"
            style={{ width: size, height: size }}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

export function ShapeAutoIcon({
    size = 16,
    className,
}: {
    size?: number;
    className?: string;
}) {
    return <ShapeLogo size={size} className={className} />;
}

export function providerIcon(modelId: string, size = 16): React.ReactNode {
    const provider = providerFromModelId(modelId);
    if (provider === "shape") return <ShapeAutoIcon size={size} />;
    return <BrandIcon icon={BRANDS[provider]} size={size} />;
}

export function providerLabel(modelId: string): string {
    switch (providerFromModelId(modelId)) {
        case "anthropic": return "Anthropic";
        case "openai": return "OpenAI";
        case "google": return "Google";
        case "x-ai": return "xAI";
        case "deepseek": return "DeepSeek";
        case "z-ai": return "Z.ai";
        case "qwen": return "Qwen";
        case "minimax": return "MiniMax";
        case "moonshotai": return "Moonshot";
        case "mistralai": return "Mistral";
        case "meta": return "Meta";
        case "cohere": return "Cohere";
        default: return "Shape";
    }
}

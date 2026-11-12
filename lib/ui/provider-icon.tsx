"use client";

import React from "react";
import { cn } from "@/lib/utils";
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
/** Application mark used wherever Auto is shown. */
export function ShapeAutoIcon({
    size = 16,
    className,
}: {
    size?: number;
    className?: string;
}) {
    return (
        <img
            src="/logos/logo.svg"
            alt=""
            width={size}
            height={size}
            draggable={false}
            className={cn("shrink-0", className)}
            style={{ width: size, height: size }}
        />
    );
}

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

function providerFromModelId(modelId: string): string {
    if (modelId === "auto" || modelId === "openrouter/auto") return "shape";
    const prefix = modelId.split("/")[0]?.toLowerCase() || "";
    if (prefix === "meta-llama") return "meta";
    return prefix || "shape";
}

function BrandMark({ name, size }: { name: string; size: number }) {
    const known = BRANDS[name as Exclude<Provider, "shape">];
    if (known) return <BrandIcon icon={known} size={size} />;
    const letter = (name.replace(/[^a-z0-9]/gi, "")[0] || "?").toUpperCase();
    return (
        <span
            aria-hidden
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-panel-hover text-[10px] font-medium leading-none text-text-secondary"
            style={{ width: size, height: size }}
        >
            {letter}
        </span>
    );
}

export function providerIcon(modelId: string, size = 18): React.ReactNode {
    const provider = providerFromModelId(modelId);
    if (provider === "shape") return <ShapeAutoIcon size={size} />;
    return <BrandMark name={provider} size={size} />;
}

export function providerLabel(modelId: string): string {
    const provider = providerFromModelId(modelId);
    switch (provider) {
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
        case "amazon": return "Amazon";
        case "nvidia": return "Nvidia";
        case "shape": return "Shape";
        default: return provider.replace(/(^|-)([a-z])/g, (_, gap: string, letter: string) => `${gap}${letter.toUpperCase()}`);
    }
}

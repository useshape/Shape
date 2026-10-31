"use client";

import { useEffect, useState } from "react";
import type { IconModule } from "thesvg";
import { cn } from "@/lib/utils";
import { detectProjectFramework } from "./framework";

const LOADERS: Record<string, () => Promise<{ default: IconModule }>> = {
    nextjs: () => import("thesvg/nextjs"),
    nuxt: () => import("thesvg/nuxt"),
    astro: () => import("thesvg/astro"),
    angular: () => import("thesvg/angular"),
    svelte: () => import("thesvg/svelte"),
    remix: () => import("thesvg/remix"),
    vue: () => import("thesvg/vue"),
    solid: () => import("thesvg/solid"),
    nestjs: () => import("thesvg/nestjs"),
    react: () => import("thesvg/react"),
    express: () => import("thesvg/express"),
    tauri: () => import("thesvg/tauri"),
    vite: () => import("thesvg/vite"),
    django: () => import("thesvg/django"),
    flask: () => import("thesvg/flask"),
    rust: () => import("thesvg/rust"),
    go: () => import("thesvg/go"),
    python: () => import("thesvg/python"),
    laravel: () => import("thesvg/laravel"),
};

const cache = new Map<string, IconModule>();

export function useProjectFramework(projectPath: string | null): string | null {
    const [slug, setSlug] = useState<string | null>(null);

    useEffect(() => {
        if (!projectPath) {
            setSlug(null);
            return;
        }
        let cancelled = false;
        void detectProjectFramework(projectPath).then((next) => {
            if (!cancelled) setSlug(next);
        }).catch(() => {
            if (!cancelled) setSlug(null);
        });
        return () => {
            cancelled = true;
        };
    }, [projectPath]);

    return slug;
}

export function FrameworkMark({
    slug,
    size = 15,
}: {
    slug: string | null;
    size?: number;
}) {
    const [icon, setIcon] = useState<IconModule | null>(() => (slug ? cache.get(slug) ?? null : null));

    useEffect(() => {
        if (!slug) {
            setIcon(null);
            return;
        }
        const hit = cache.get(slug);
        if (hit) {
            setIcon(hit);
            return;
        }
        const load = LOADERS[slug];
        if (!load) {
            setIcon(null);
            return;
        }
        let cancelled = false;
        void load().then((mod) => {
            cache.set(slug, mod.default);
            if (!cancelled) setIcon(mod.default);
        }).catch(() => {
            if (!cancelled) setIcon(null);
        });
        return () => {
            cancelled = true;
        };
    }, [slug]);

    if (!icon) {
        return (
            <img
                src="/logos/chat-empty.svg"
                alt=""
                width={size}
                height={size}
                draggable={false}
                className="block shrink-0"
                style={{ width: size, height: size }}
            />
        );
    }

    const html = icon.variants.dark || icon.variants.default || icon.svg;
    return (
        <span
            aria-hidden
            className={cn("inline-flex shrink-0 [&_svg]:size-full")}
            style={{ width: size, height: size }}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

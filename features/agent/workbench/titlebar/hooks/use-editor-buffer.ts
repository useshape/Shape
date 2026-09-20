"use client";

import { useEffect, useRef } from "react";
import { commands } from "@/lib/backend";

export function useEditorBuffer() {
    const activeBufferRef = useRef<Record<string, string>>({});

    useEffect(() => {
        const handleBuffer = (event: Event) => {
            const detail = (event as CustomEvent<{ path: string; content: string }>).detail;
            if (!detail?.path) return;
            activeBufferRef.current[detail.path] = detail.content;
        };
        window.addEventListener("shape-editor-buffer", handleBuffer as EventListener);
        return () => window.removeEventListener("shape-editor-buffer", handleBuffer as EventListener);
    }, []);

    const readLatestContent = async (path: string) => {
        const buffer = activeBufferRef.current[path];
        if (typeof buffer === "string") return buffer;
        return commands.readFile(path);
    };

    return { readLatestContent };
}

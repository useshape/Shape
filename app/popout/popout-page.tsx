"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { commands } from "@/lib/backend";
import FileViewer from "@/features/editor/ui/main/editor";

function readSeededPath(): string | null {
    if (typeof window === "undefined") return null;
    try {
        const params = new URLSearchParams(window.location.search);
        const fromQuery = params.get("file");
        if (fromQuery) return fromQuery;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith("shape-popout-file:")) {
                const value = localStorage.getItem(key);
                if (value) return value;
            }
        }
    } catch {
        /* ignore */
    }
    return null;
}

export default function PopoutPage() {
    const searchParams = useSearchParams();
    const fileFromQuery = searchParams.get("file");
    const [file, setFile] = useState<string | null>(() => fileFromQuery || readSeededPath());

    useEffect(() => {
        if (fileFromQuery) setFile(fileFromQuery);
    }, [fileFromQuery]);

    useEffect(() => {
        if (!file) return;
        const name = file.split(/[\\/]/).pop() || file;
        void commands.openFile(file, name);
    }, [file]);

    const title = useMemo(() => file?.split(/[\\/]/).pop() || "Editor", [file]);

    if (!file) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
                No file specified
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden" data-popout-title={title}>
            <FileViewer path={file} group="left" />
        </div>
    );
}

"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { commands } from "@/lib/backend";
import FileViewer from "@/features/editor/ui/main/editor";

export default function PopoutPage() {
    const searchParams = useSearchParams();
    const file = searchParams.get("file");

    useEffect(() => {
        if (!file) return;
        const name = file.split(/[\\/]/).pop() || file;
        void commands.openFile(file, name);
    }, [file]);

    if (!file) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
                No file specified
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <FileViewer path={file} group="left" />
        </div>
    );
}

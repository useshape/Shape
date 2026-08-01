"use client";

import React, { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { getIconPath } from "@/lib/ui/icons/files";
import { type Diagnostic, useDiagnostics } from "@/features/diagnostics/store";

type Severity = "error" | "warning" | "info";

const SeverityIcon = ({ severity }: { severity: Severity }) => {
    if (severity === "error")
        return <Icon name="error" size={14} className="text-error shrink-0" />;
    if (severity === "warning")
        return <Icon name="warning" size={14} className="text-warning shrink-0" />;
    return <Icon name="info" size={14} className="text-info shrink-0" />;
};

const FileIcon = ({ filename }: { filename: string }) => {
    const name = filename.split(/[\\/]/).pop() || filename;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={getIconPath(name)}
            alt=""
            className="w-3.5 h-3.5 shrink-0"
        />
    );
};

function ProblemRow({
    severity,
    message,
    file,
    line,
    column,
    source,
}: {
    severity: Severity;
    message: string;
    file: string;
    line: number;
    column: number;
    source?: string;
}) {
    const [expanded, setExpanded] = useState(false);
    const shortFile = file.split(/[\\/]/).pop() || file;
    const openAndJump = () => {
        const name = shortFile;
        (async () => {
            try {
                await import("@/lib/backend").then(({ commands }) =>
                    commands.openFile(file, name)
                );
            } catch {
                // ignore
            } finally {
                window.dispatchEvent(
                    new CustomEvent("shape-editor-jump", {
                        detail: { path: file, line, column },
                    })
                );
            }
        })();
    };

    return (
        <div
            className="group flex flex-col hover:bg-panel-hover/50 cursor-pointer transition-colors"
            onClick={() => setExpanded(!expanded)}
            onDoubleClick={openAndJump}
        >
            <div className="flex items-start gap-2 px-3 py-1.5 min-h-[28px]">
                <div className="mt-0.5 shrink-0">
                    <SeverityIcon severity={severity} />
                </div>

                <span className="flex-1 text-sm text-text-secondary group-hover:text-text-primary leading-snug transition-colors">
                    {message}
                </span>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <FileIcon filename={file} />
                    <span className="text-xs text-text-muted whitespace-nowrap">
                        {shortFile}
                    </span>
                    <span className="text-xs text-text-disabled">
                        {line}:{column}
                    </span>
                </div>

                <Icon
                    name="chevron_right"
                    size={14}
                    className={`text-text-disabled transition-transform ${expanded ? "rotate-90" : ""}`}
                />
            </div>

            {expanded && (
                <div className="px-7 pb-2 text-xs text-text-muted">
                    <div className="mb-1"><span className="text-text-secondary">Source:</span> {source || "unknown"}</div>
                    <div className="mb-1"><span className="text-text-secondary">File:</span> {file}</div>
                    <div><span className="text-text-secondary">Location:</span> line {line}, column {column}</div>
                </div>
            )}
        </div>
    );
}

export default function Problems({ search = "" }: { search?: string }) {
    const { all } = useDiagnostics();
    const query = search.toLowerCase();
    const filtered = useMemo(
        () =>
            query
                ? all.filter(
                    (p) =>
                        p.message.toLowerCase().includes(query) ||
                        p.file.toLowerCase().includes(query)
                )
                : all,
        [all, query]
    );

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar font-sans text-xs">
            <div className="flex flex-col divide-y divide-border-subtle">
                {filtered.length > 0 ? (
                    filtered.map((p: Diagnostic, idx: number) => (
                        <ProblemRow
                            key={`${p.file}:${p.line}:${p.column}:${idx}`}
                            severity={p.severity as Severity}
                            message={p.message}
                            file={p.file}
                            line={p.line}
                            column={p.column}
                            source={p.source}
                        />
                    ))
                ) : all.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-text-muted">
                        No problems detected
                    </div>
                ) : (
                    <div className="px-2 py-3 text-xs text-text-muted">
                        No problems match your filter
                    </div>
                )}
            </div>
        </div>
    );
}

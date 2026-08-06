import React from 'react';
import { Icon } from "@/components/ui/icon";
import { cn } from '@/lib/utils';
import { commands } from '@/lib/backend';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { getShapeSyntaxTheme } from '@/lib/ui/syntax-theme';

type DiffRow = {
    id: string;
    type: 'equal' | 'add' | 'remove';
    oldLine?: string;
    newLine?: string;
    oldNumber?: number;
    newNumber?: number;
};

const getLanguage = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'tsx': return 'typescript';
        case 'ts': return 'typescript';
        case 'js': return 'javascript';
        case 'jsx': return 'javascript';
        case 'rs': return 'rust';
        case 'toml': return 'ini';
        case 'json': return 'json';
        case 'css': return 'css';
        case 'html': return 'html';
        case 'md': return 'markdown';
        default: return 'plaintext';
    }
};

const toLines = (text: string) => text.length ? text.split('\n') : [];

const buildDiffRows = (original: string, replacement: string): DiffRow[] => {
    const a = toLines(original);
    const b = toLines(replacement);
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = m - 1; i >= 0; i -= 1) {
        for (let j = n - 1; j >= 0; j -= 1) {
            if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
            else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    const rows: DiffRow[] = [];
    let i = 0;
    let j = 0;
    let oldNumber = 1;
    let newNumber = 1;
    let idCounter = 0;

    while (i < m || j < n) {
        if (i < m && j < n && a[i] === b[j]) {
            rows.push({
                id: `d - ${idCounter += 1} `,
                type: 'equal',
                oldLine: a[i],
                newLine: b[j],
                oldNumber,
                newNumber,
            });
            i += 1;
            j += 1;
            oldNumber += 1;
            newNumber += 1;
        } else if (j >= n || (i < m && dp[i + 1][j] >= dp[i][j + 1])) {
            rows.push({
                id: `d - ${idCounter += 1} `,
                type: 'remove',
                oldLine: a[i],
                oldNumber,
            });
            i += 1;
            oldNumber += 1;
        } else {
            rows.push({
                id: `d - ${idCounter += 1} `,
                type: 'add',
                newLine: b[j],
                newNumber,
            });
            j += 1;
            newNumber += 1;
        }
    }

    return rows;
};

export function InlineDiff({ file, original, replacement, isGenerating }: {
    file: string;
    original: string;
    replacement: string;
    isGenerating?: boolean;
}) {
    const [status, setStatus] = React.useState<"pending" | "applying" | "accepted" | "rejected" | "error">("pending");
    const [selected, setSelected] = React.useState<Record<string, boolean>>({});
    const [appliedContent, setAppliedContent] = React.useState<string | null>(null);

    const rows = React.useMemo(() => buildDiffRows(original, replacement), [original, replacement]);
    const language = React.useMemo(() => getLanguage(file), [file]);

    React.useEffect(() => {
        const nextSelected: Record<string, boolean> = {};
        rows.forEach((row) => {
            if (row.type !== 'equal') nextSelected[row.id] = true;
        });
        setSelected(nextSelected);

        // Edits always start as "pending" - the user must explicitly accept or reject.
        // Only reset to pending when the edit is still generating or when the file/rows change.
        if (isGenerating) {
            setStatus("pending");
            setAppliedContent(null);
        } else if (status === "applying") {
            // Don't interrupt an in-progress apply
        } else if (status !== "accepted" && status !== "rejected") {
            setStatus("pending");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, file, isGenerating]);

    const mergedContent = React.useMemo(() => {
        const output: string[] = [];
        rows.forEach((row) => {
            if (row.type === 'equal' && row.oldLine !== undefined) {
                output.push(row.oldLine);
            }
            if (row.type === 'remove' && row.oldLine !== undefined) {
                if (!selected[row.id]) output.push(row.oldLine);
            }
            if (row.type === 'add' && row.newLine !== undefined) {
                if (selected[row.id]) output.push(row.newLine);
            }
        });
        return output.join('\n');
    }, [rows, selected]);

    const totals = React.useMemo(() => {
        let add = 0;
        let remove = 0;
        let addSelected = 0;
        let removeSelected = 0;
        rows.forEach((row) => {
            if (row.type === 'add') {
                add += 1;
                if (selected[row.id]) addSelected += 1;
            }
            if (row.type === 'remove') {
                remove += 1;
                if (selected[row.id]) removeSelected += 1;
            }
        });
        return { add, remove, addSelected, removeSelected };
    }, [rows, selected]);

    const hasChanges = totals.add + totals.remove > 0;

    const handleApply = async () => {
        if (!hasChanges || status === "applying" || status === "accepted") return;
        setStatus("applying");
        try {
            await commands.applyFileEdit(file, original, mergedContent);
            setAppliedContent(mergedContent);
            setStatus("accepted");
        } catch {
            setStatus("error");
        }
    };

    const handleReject = async () => {
        if ((status === "accepted" || status === "pending") && hasChanges) {
            setStatus("applying");
            try {
                // To revert, we restore original over the merged content that was applied
                await commands.applyFileEdit(file, appliedContent || mergedContent, original);
                setAppliedContent(null);
                setStatus("rejected");
            } catch {
                setStatus("error");
            }
            return;
        }
        setStatus("rejected");
    };

    const toggleRow = (id: string) => {
        setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className={cn(
            "w-full flex flex-col rounded-md border overflow-hidden my-2 transition-all duration-300",
            status === "accepted" ? "border-success/30 bg-success/5" :
                status === "rejected" ? "border-error/20 bg-error/5 opacity-60" :
                    "border-border-subtle bg-panel/40"
        )}>
            <div className="flex items-center justify-between px-2 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium font-sans text-text-primary truncate max-w-[160px]">{file.split('/').pop()}</span>
                    {hasChanges && (
                        <div className="flex items-center gap-1.5 ml-1 text-xs font-sans font-medium">
                            <span className="text-success">+{totals.addSelected}</span>
                            <span className="text-error">-{totals.removeSelected}</span>
                            {(totals.addSelected !== totals.add || totals.removeSelected !== totals.remove) && (
                                <span className="text-text-muted">({totals.add + totals.remove} total)</span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {isGenerating && (
                        <span className="ai-shimmer-text text-xs font-medium mr-2">Generating…</span>
                    )}
                    {status === "error" && !isGenerating && (
                        <span className="text-xs text-error font-regular mr-1">Failed</span>
                    )}
                    {status === "applying" && (
                        <span className="ai-shimmer-text text-2xs font-medium mr-2">Applying…</span>
                    )}
                    {status === "accepted" && <span className="text-2xs text-success font-regular mr-1">Applied</span>}
                    {status === "rejected" && <span className="text-2xs text-error font-regular mr-1">Discarded</span>}
                    <button
                        className="px-1.5 py-0.5 rounded-md text-xs font-medium bg-accent text-accent-fg hover:bg-accent-hover transition-colors disabled:opacity-50"
                        onClick={handleApply}
                        disabled={!hasChanges || status === "applying" || status === "accepted"}
                    >
                        <span className="flex items-center gap-1">
                            <Icon name="check" size={12} />
                            Apply
                        </span>
                    </button>
                    <button
                        className="px-1.5 py-0.5 rounded-md text-xs font-medium text-text-muted hover:text-text-primary transition-colors hover:bg-panel-hover disabled:opacity-50"
                        onClick={handleReject}
                        disabled={status === "applying" || status === "rejected"}
                    >
                        <span className="flex items-center gap-1">
                            {status === "accepted" ? <Icon name="refresh" size={12} /> : <Icon name="close" size={12} />}
                            {status === "accepted" ? "Revert" : "Reject"}
                        </span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-[1fr_1fr_0.7fr] gap-0 border-b border-border-subtle/30 text-2xs font-regular text-text-muted">
                <div className="px-3 py-1.5 border-r border-border-subtle/30">Before</div>
                <div className="px-3 py-1.5 border-r border-border-subtle/30">After</div>
                <div className="px-3 py-1.5">Notes</div>
            </div>

            <div className="max-h-[260px] overflow-y-auto custom-scrollbar">
                {rows.map((row) => {
                    const selectedRow = row.type === 'equal' ? true : !!selected[row.id];
                    const leftBg = row.type === 'remove' ? (selectedRow ? "bg-error/12" : "bg-error/5") : "bg-transparent";
                    const rightBg = row.type === 'add' ? (selectedRow ? "bg-success/12" : "bg-success/5") : "bg-transparent";
                    const note = row.type === 'add'
                        ? (selectedRow ? "Added" : "Skipped add")
                        : row.type === 'remove'
                            ? (selectedRow ? "Removed" : "Kept")
                            : "";

                    return (
                        <div key={row.id} className="grid grid-cols-[1fr_1fr_0.7fr] gap-0 border-b border-border-subtle/10 last:border-b-0">
                            <div className={cn("px-2 py-0.5 border-r border-border-subtle/20", leftBg)}>
                                <div className="flex items-start gap-2">
                                    {row.type === 'remove' ? (
                                        <button
                                            className={cn(
                                                "w-4 h-4 rounded border text-2xs flex items-center justify-center mt-[2px]",
                                                selectedRow ? "border-error text-error bg-error/20" : "border-border-subtle text-text-muted"
                                            )}
                                            onClick={() => toggleRow(row.id)}
                                        >
                                            {selectedRow ? "âœ“" : "â€“"}
                                        </button>
                                    ) : (
                                        <div className="w-4 h-4" />
                                    )}
                                    <div className="text-2xs text-text-disabled w-8 text-right select-none">
                                        {row.oldNumber ?? ""}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <SyntaxHighlighter
                                            style={getShapeSyntaxTheme() as { [key: string]: React.CSSProperties }}
                                            language={language}
                                            PreTag="span"
                                            CodeTag="span"
                                            customStyle={{ margin: 0, padding: 0, background: 'transparent', display: 'block' }}
                                        >
                                            {row.oldLine ?? " "}
                                        </SyntaxHighlighter>
                                    </div>
                                </div>
                            </div>

                            <div className={cn("px-2 py-0.5 border-r border-border-subtle/20", rightBg)}>
                                <div className="flex items-start gap-2">
                                    {row.type === 'add' ? (
                                        <button
                                            className={cn(
                                                "w-4 h-4 rounded border text-2xs flex items-center justify-center mt-[2px]",
                                                selectedRow ? "border-success text-success bg-success/20" : "border-border-subtle text-text-muted"
                                            )}
                                            onClick={() => toggleRow(row.id)}
                                        >
                                            {selectedRow ? "âœ“" : "â€“"}
                                        </button>
                                    ) : (
                                        <div className="w-4 h-4" />
                                    )}
                                    <div className="text-2xs text-text-disabled w-8 text-right select-none">
                                        {row.newNumber ?? ""}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <SyntaxHighlighter
                                            style={getShapeSyntaxTheme() as { [key: string]: React.CSSProperties }}
                                            language={language}
                                            PreTag="span"
                                            CodeTag="span"
                                            customStyle={{ margin: 0, padding: 0, background: 'transparent', display: 'block' }}
                                        >
                                            {row.newLine ?? " "}
                                        </SyntaxHighlighter>
                                    </div>
                                </div>
                            </div>

                            <div className="px-3 py-0.5 flex items-center text-2xs text-text-muted">
                                {note}
                            </div>
                        </div>
                    );
                })}
            </div>

            <style jsx>{`
    .custom - scrollbar:: -webkit - scrollbar {
    height: 4px;
    width: 4px;
}
                .custom - scrollbar:: -webkit - scrollbar - track {
    background: transparent;
}
                .custom - scrollbar:: -webkit - scrollbar - thumb {
    background: var(--scrollbar);
    border - radius: 4px;
}
`}</style>
        </div>
    );
}

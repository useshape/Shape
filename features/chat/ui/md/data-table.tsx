"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { providerIcon } from "@/lib/ui/provider-icon";
import { tableCellModelId } from "@/lib/chat/fence-tables";
import styles from "./data-table.module.css";

function CellInner({ value }: { value: string }) {
    const modelId = tableCellModelId(value);
    return (
        <span className={styles.cellInner}>
            {modelId ? <span className={styles.brand}>{providerIcon(modelId, 14)}</span> : null}
            <span>{value}</span>
        </span>
    );
}

export function ChatDataTable({
    headers,
    rows,
}: {
    headers: string[];
    rows: string[][];
}) {
    return (
        <div className={styles.wrap}>
            <table className={styles.table}>
                {headers.length > 0 ? (
                    <thead>
                        <tr>
                            {headers.map((h) => (
                                <th key={h} className={styles.th}>
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                ) : null}
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} className={styles.tr}>
                            {row.map((cell, j) => (
                                <td key={j} className={styles.td}>
                                    <CellInner value={cell} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function ChatKeyedRowsTable({ rows }: { rows: Record<string, string>[] }) {
    const headers = React.useMemo(() => {
        const keys: string[] = [];
        for (const row of rows) {
            for (const k of Object.keys(row)) {
                if (!keys.includes(k)) keys.push(k);
            }
        }
        return keys;
    }, [rows]);
    const body = rows.map((row) => headers.map((h) => row[h] ?? ""));
    return <ChatDataTable headers={headers} rows={body} />;
}

export function MarkdownTableShell({ children }: { children?: React.ReactNode }) {
    return <div className={cn(styles.wrap, "my-2")}>{children}</div>;
}

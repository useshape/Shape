import { createRoot, type Root } from "react-dom/client";
import React from "react";
import { Button } from "@/components/ui/button";

const CONFLICT_STYLE_ID = "shape-conflict-style";

interface ConflictRegion {
    startLine: number;
    sepLine: number;
    endLine: number;
}

function ensureConflictStyles() {
    if (document.getElementById(CONFLICT_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = CONFLICT_STYLE_ID;
    style.textContent = `
        .shape-conflict-widget {
            display: flex;
            gap: 4px;
            padding: 2px 4px;
            background: var(--panel);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .shape-conflict-marker {
            background: rgba(239, 68, 68, 0.12);
        }
    `;
    document.head.appendChild(style);
}

function findConflicts(lines: string[]): ConflictRegion[] {
    const conflicts: ConflictRegion[] = [];
    let i = 0;
    while (i < lines.length) {
        if (lines[i].startsWith("<<<<<<<")) {
            const startLine = i + 1;
            let sepLine = -1;
            let endLine = -1;
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].startsWith("=======")) sepLine = j + 1;
                if (lines[j].startsWith(">>>>>>>")) {
                    endLine = j + 1;
                    break;
                }
            }
            if (sepLine > 0 && endLine > 0) {
                conflicts.push({ startLine, sepLine, endLine });
                i = endLine;
            } else {
                i++;
            }
        } else {
            i++;
        }
    }
    return conflicts;
}

function ConflictButtons({
    onCurrent,
    onIncoming,
    onBoth,
}: {
    onCurrent: () => void;
    onIncoming: () => void;
    onBoth: () => void;
}) {
    return (
        <div className="shape-conflict-widget">
            <Button size="xs" variant="secondary" className="h-6 text-xs" onClick={onCurrent}>
                Accept Current
            </Button>
            <Button size="xs" variant="secondary" className="h-6 text-xs" onClick={onIncoming}>
                Accept Incoming
            </Button>
            <Button size="xs" variant="default" className="h-6 text-xs" onClick={onBoth}>
                Accept Both
            </Button>
        </div>
    );
}

export function attachConflictResolver(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monaco: any,
) {
    ensureConflictStyles();
    const markerDecorations = editor.createDecorationsCollection();
    const widgets: Array<{
        widget: { getId: () => string; getDomNode: () => HTMLElement; getPosition: () => unknown };
        root: Root;
        conflict: ConflictRegion;
    }> = [];
    let scanTimer: ReturnType<typeof setTimeout> | null = null;

    const clearWidgets = () => {
        for (const w of widgets) {
            try {
                editor.removeContentWidget(w.widget);
                setTimeout(() => w.root.unmount(), 0);
            } catch { /* noop */ }
        }
        widgets.length = 0;
    };

    const resolveConflict = (conflict: ConflictRegion, action: "current" | "incoming" | "both") => {
        const model = editor.getModel();
        if (!model) return;

        const currentLines: string[] = [];
        const incomingLines: string[] = [];
        for (let ln = conflict.startLine + 1; ln < conflict.sepLine; ln++) {
            currentLines.push(model.getLineContent(ln));
        }
        for (let ln = conflict.sepLine + 1; ln < conflict.endLine; ln++) {
            incomingLines.push(model.getLineContent(ln));
        }

        let replacement: string;
        if (action === "current") {
            replacement = currentLines.join("\n");
        } else if (action === "incoming") {
            replacement = incomingLines.join("\n");
        } else {
            replacement = [...currentLines, ...incomingLines].join("\n");
        }

        const range = new monaco.Range(
            conflict.startLine,
            1,
            conflict.endLine,
            model.getLineMaxColumn(conflict.endLine),
        );
        editor.executeEdits("conflict-resolver", [{ range, text: replacement, forceMoveMarkers: true }]);
        scanConflicts();
    };

    const scanConflicts = () => {
        const model = editor.getModel();
        if (!model) return;

        clearWidgets();
        const lines = model.getValue().split("\n");
        const conflicts = findConflicts(lines);

        const decs = conflicts.flatMap((c) => [
            {
                range: new monaco.Range(c.startLine, 1, c.startLine, 1),
                options: { isWholeLine: true, className: "shape-conflict-marker" },
            },
            {
                range: new monaco.Range(c.sepLine, 1, c.sepLine, 1),
                options: { isWholeLine: true, className: "shape-conflict-marker" },
            },
            {
                range: new monaco.Range(c.endLine, 1, c.endLine, 1),
                options: { isWholeLine: true, className: "shape-conflict-marker" },
            },
        ]);
        markerDecorations.set(decs);

        for (const conflict of conflicts) {
            const container = document.createElement("div");
            container.addEventListener("mousedown", (e) => e.stopPropagation());
            container.addEventListener("click", (e) => e.stopPropagation());

            const widget = {
                getId: () => `shape-conflict-${conflict.startLine}`,
                getDomNode: () => container,
                getPosition: () => ({
                    position: { lineNumber: conflict.startLine, column: 1 },
                    preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE],
                }),
            };

            const root = createRoot(container);
            root.render(
                React.createElement(ConflictButtons, {
                    onCurrent: () => resolveConflict(conflict, "current"),
                    onIncoming: () => resolveConflict(conflict, "incoming"),
                    onBoth: () => resolveConflict(conflict, "both"),
                }),
            );

            editor.addContentWidget(widget);
            widgets.push({ widget, root, conflict });
        }
    };

    const scheduleScan = () => {
        if (scanTimer) clearTimeout(scanTimer);
        scanTimer = setTimeout(scanConflicts, 200);
    };

    editor.onDidChangeModelContent(scheduleScan);
    scanConflicts();

    return () => {
        if (scanTimer) clearTimeout(scanTimer);
        clearWidgets();
        markerDecorations.clear();
    };
}

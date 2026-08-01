"use client";

import React from "react";
import { buildGapEdit, getGapValues } from "./lib/spacing";
import { GAP_X_GLYPH, GAP_Y_GLYPH, PanelShell, PxInput, RowLabel, type TwPanelProps } from "./tw-control-shared";

export function GapPanel({ currentClasses, onApply, onClose }: TwPanelProps) {
    const gap = getGapValues(currentClasses);

    return (
        <PanelShell title="Gap" onClose={onClose}>
            <div className="flex items-center gap-2">
                <RowLabel>Gap</RowLabel>
                <div className="flex flex-1 gap-1">
                    <PxInput
                        glyph={GAP_X_GLYPH}
                        title="Column gap (px)"
                        value={gap.x}
                        onCommit={(px) => {
                            const { add, remove } = buildGapEdit(currentClasses, "x", px);
                            onApply(add, remove);
                        }}
                    />
                    <PxInput
                        glyph={GAP_Y_GLYPH}
                        title="Row gap (px)"
                        value={gap.y}
                        onCommit={(px) => {
                            const { add, remove } = buildGapEdit(currentClasses, "y", px);
                            onApply(add, remove);
                        }}
                    />
                </div>
            </div>
        </PanelShell>
    );
}

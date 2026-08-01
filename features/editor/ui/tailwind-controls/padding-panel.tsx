"use client";

import React from "react";
import { buildPaddingEdit, getPaddingValues } from "./lib/spacing";
import { PadGlyph, PanelShell, PxInput, RowLabel, type TwPanelProps } from "./tw-control-shared";

export function PaddingPanel({ currentClasses, onApply, onClose }: TwPanelProps) {
    const padding = getPaddingValues(currentClasses);

    return (
        <PanelShell title="Padding" onClose={onClose}>
            <div className="flex items-start gap-2">
                <RowLabel>
                    <span className="leading-7">Sides</span>
                </RowLabel>
                <div className="grid flex-1 grid-cols-2 gap-1">
                    {(["left", "top", "right", "bottom"] as const).map((side) => (
                        <PxInput
                            key={side}
                            glyph={<PadGlyph side={side} />}
                            title={`Padding ${side} (px)`}
                            value={padding[side]}
                            onCommit={(px) => {
                                const { add, remove } = buildPaddingEdit(currentClasses, side, px);
                                onApply(add, remove);
                            }}
                        />
                    ))}
                </div>
            </div>
        </PanelShell>
    );
}

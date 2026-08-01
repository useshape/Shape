"use client";

import React from "react";
import { Icon } from "@/components/ui/icon";
import { ALIGN_ITEMS, FLEX_WRAP, JUSTIFY_CONTENT, pickInGroup } from "./lib/alignment";
import { buildDirectionEdit, getLayoutDirection, type LayoutDirection } from "./lib/spacing";
import { AlignCenterIcon, AlignEndIcon, AlignStartIcon } from "./alignment-icons";
import { PanelShell, RowLabel, ToggleBtn, type TwPanelProps } from "./tw-control-shared";

export function FlexPanel({ currentClasses, onApply, onClose }: TwPanelProps) {
    const direction = getLayoutDirection(currentClasses);
    const isGrid = direction === "grid";

    const applyDirection = (dir: LayoutDirection) => {
        const { add, remove } = buildDirectionEdit(currentClasses, dir);
        if (add.length || remove.length) onApply(add, remove);
    };

    const applyJustify = (val: string) => {
        const { add, remove } = pickInGroup(currentClasses, JUSTIFY_CONTENT, val);
        if (add.length || remove.length) onApply(add, remove);
    };

    const applyAlign = (val: string) => {
        const { add, remove } = pickInGroup(currentClasses, ALIGN_ITEMS, val);
        if (add.length || remove.length) onApply(add, remove);
    };

    const applyWrap = (val: string) => {
        const { add, remove } = pickInGroup(currentClasses, FLEX_WRAP, val);
        if (add.length || remove.length) onApply(add, remove);
    };

    return (
        <PanelShell title="Flex / Grid" onClose={onClose}>
            <div className="flex items-center gap-2">
                <RowLabel>Direction</RowLabel>
                <div className="flex flex-1 gap-1 rounded-lg">
                    <ToggleBtn label="Row (flex)" active={direction === "flex-row"} onClick={() => applyDirection("flex-row")}>
                        <Icon name="vertical_split" size={15} />
                    </ToggleBtn>
                    <ToggleBtn label="Column (flex)" active={direction === "flex-col"} onClick={() => applyDirection("flex-col")}>
                        <Icon name="split_horizontal" size={15} />
                    </ToggleBtn>
                    <ToggleBtn label="Grid" active={direction === "grid"} onClick={() => applyDirection("grid")}>
                        <Icon name="grid_view" size={15} />
                    </ToggleBtn>
                </div>
            </div>

            {!isGrid && (
                <div className="flex items-center gap-2">
                    <RowLabel>Wrap</RowLabel>
                    <div className="flex flex-1 gap-1">
                        <ToggleBtn label="nowrap" active={currentClasses.includes("flex-nowrap") || !FLEX_WRAP.some((w) => currentClasses.includes(w))} onClick={() => applyWrap("flex-nowrap")}>
                            <Icon name="view_stream" size={15} />
                        </ToggleBtn>
                        <ToggleBtn label="wrap" active={currentClasses.includes("flex-wrap")} onClick={() => applyWrap("flex-wrap")}>
                            <Icon name="wrap_text" size={15} />
                        </ToggleBtn>
                        <ToggleBtn label="wrap-reverse" active={currentClasses.includes("flex-wrap-reverse")} onClick={() => applyWrap("flex-wrap-reverse")}>
                            <Icon name="swap_vert" size={15} />
                        </ToggleBtn>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-2">
                <RowLabel>Justify</RowLabel>
                <div className="flex flex-1 gap-1">
                    <ToggleBtn label="justify-start" active={currentClasses.includes("justify-start")} onClick={() => applyJustify("justify-start")}>
                        <AlignStartIcon axis="x" />
                    </ToggleBtn>
                    <ToggleBtn label="justify-center" active={currentClasses.includes("justify-center")} onClick={() => applyJustify("justify-center")}>
                        <AlignCenterIcon axis="x" />
                    </ToggleBtn>
                    <ToggleBtn label="justify-end" active={currentClasses.includes("justify-end")} onClick={() => applyJustify("justify-end")}>
                        <AlignEndIcon axis="x" />
                    </ToggleBtn>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <RowLabel>Align</RowLabel>
                <div className="flex flex-1 gap-1">
                    <ToggleBtn label="items-start" active={currentClasses.includes("items-start")} onClick={() => applyAlign("items-start")}>
                        <AlignStartIcon axis="y" />
                    </ToggleBtn>
                    <ToggleBtn label="items-center" active={currentClasses.includes("items-center")} onClick={() => applyAlign("items-center")}>
                        <AlignCenterIcon axis="y" />
                    </ToggleBtn>
                    <ToggleBtn label="items-end" active={currentClasses.includes("items-end")} onClick={() => applyAlign("items-end")}>
                        <AlignEndIcon axis="y" />
                    </ToggleBtn>
                </div>
            </div>
        </PanelShell>
    );
}

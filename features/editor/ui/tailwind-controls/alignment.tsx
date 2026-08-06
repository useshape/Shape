"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import {
    ALIGN_ITEMS,
    FLEX_DIRECTION,
    JUSTIFY_CONTENT,
    getAlignmentTokens,
    isFlexRow,
    isReversed,
    pickInGroup,
    toggleReverse,
} from "./lib/alignment";
import {
    AlignCenterIcon,
    AlignEndIcon,
    AlignStartIcon,
    SpaceAroundIcon,
    SpaceBetweenIcon,
    SpaceEvenlyIcon,
} from "./alignment-icons";

interface AlignmentProps {
    currentClasses: string[];
    onApply: (add: string[], remove: string[]) => void;
    onClose?: () => void;
}

function PickBtn({
    label,
    active,
    onClick,
    children,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <Tooltip content={label} side="top" delayDuration={400}>
            <Button
                type="button"
                variant={active ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={onClick}
            >
                {children}
            </Button>
        </Tooltip>
    );
}

export function Alignment({ currentClasses, onApply, onClose }: AlignmentProps) {
    const alignTokens = getAlignmentTokens(currentClasses);
    const row = isFlexRow(alignTokens);
    const reversed = isReversed(alignTokens);
    const mainAxis = row ? "x" : "y";
    const crossAxis = row ? "y" : "x";

    const apply = (group: readonly string[], val: string) => {
        const { add, remove } = pickInGroup(currentClasses, group, val);
        onApply(add, remove);
    };

    const activeDir = alignTokens.find((t) => (FLEX_DIRECTION as readonly string[]).includes(t))
        ?? (row ? "flex-row" : "flex-col");

    return (
        <TooltipProvider delayDuration={400}>
            <div
                className="flex flex-col gap-2.5 select-none rounded-xl bg-surface-3 border border-border-subtle shadow-lg text-text-primary font-sans p-3 min-w-[220px]"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-secondary">Layout</span>
                    {onClose && (
                        <Tooltip content="Close" side="top">
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                                <Icon name="close" size={12} />
                            </Button>
                        </Tooltip>
                    )}
                </div>

                <div className="space-y-1">
                    <div className="text-[10px] text-text-muted ">Direction</div>
                    <div className="flex gap-1">
                        <PickBtn
                            label="flex-row"
                            active={activeDir === "flex-row" || activeDir === "flex-row-reverse"}
                            onClick={() => apply(FLEX_DIRECTION, reversed && activeDir.startsWith("flex-row") ? "flex-row-reverse" : "flex-row")}
                        >
                            <Icon name="split_horizontal" size={14} />
                        </PickBtn>
                        <PickBtn
                            label="flex-col"
                            active={activeDir === "flex-col" || activeDir === "flex-col-reverse"}
                            onClick={() => apply(FLEX_DIRECTION, reversed && activeDir.startsWith("flex-col") ? "flex-col-reverse" : "flex-col")}
                        >
                            <Icon name="vertical_split" size={14} />
                        </PickBtn>
                        <PickBtn
                            label="reverse"
                            active={reversed}
                            onClick={() => {
                                const { add, remove } = toggleReverse(alignTokens);
                                onApply(add, remove);
                            }}
                        >
                            <Icon name="refresh" size={14} />
                        </PickBtn>
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="text-[10px] text-text-muted ">
                        Justify ({row ? "main" : "cross"})
                    </div>
                    <div className="flex flex-wrap gap-1">
                        <PickBtn label="justify-start" active={alignTokens.includes("justify-start")} onClick={() => apply(JUSTIFY_CONTENT, "justify-start")}>
                            <AlignStartIcon axis={mainAxis} />
                        </PickBtn>
                        <PickBtn label="justify-center" active={alignTokens.includes("justify-center")} onClick={() => apply(JUSTIFY_CONTENT, "justify-center")}>
                            <AlignCenterIcon axis={mainAxis} />
                        </PickBtn>
                        <PickBtn label="justify-end" active={alignTokens.includes("justify-end")} onClick={() => apply(JUSTIFY_CONTENT, "justify-end")}>
                            <AlignEndIcon axis={mainAxis} />
                        </PickBtn>
                        <PickBtn label="justify-between" active={alignTokens.includes("justify-between")} onClick={() => apply(JUSTIFY_CONTENT, "justify-between")}>
                            <SpaceBetweenIcon />
                        </PickBtn>
                        <PickBtn label="justify-around" active={alignTokens.includes("justify-around")} onClick={() => apply(JUSTIFY_CONTENT, "justify-around")}>
                            <SpaceAroundIcon />
                        </PickBtn>
                        <PickBtn label="justify-evenly" active={alignTokens.includes("justify-evenly")} onClick={() => apply(JUSTIFY_CONTENT, "justify-evenly")}>
                            <SpaceEvenlyIcon />
                        </PickBtn>
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="text-[10px] text-text-muted ">
                        Align ({row ? "cross" : "main"})
                    </div>
                    <div className="flex flex-wrap gap-1">
                        <PickBtn label="items-start" active={alignTokens.includes("items-start")} onClick={() => apply(ALIGN_ITEMS, "items-start")}>
                            <AlignStartIcon axis={crossAxis} />
                        </PickBtn>
                        <PickBtn label="items-center" active={alignTokens.includes("items-center")} onClick={() => apply(ALIGN_ITEMS, "items-center")}>
                            <AlignCenterIcon axis={crossAxis} />
                        </PickBtn>
                        <PickBtn label="items-end" active={alignTokens.includes("items-end")} onClick={() => apply(ALIGN_ITEMS, "items-end")}>
                            <AlignEndIcon axis={crossAxis} />
                        </PickBtn>
                        <PickBtn label="items-baseline" active={alignTokens.includes("items-baseline")} onClick={() => apply(ALIGN_ITEMS, "items-baseline")}>
                            <Icon name="format_align_left" size={14} />
                        </PickBtn>
                        <PickBtn label="items-stretch" active={alignTokens.includes("items-stretch")} onClick={() => apply(ALIGN_ITEMS, "items-stretch")}>
                            <Icon name="unfold_more" size={14} />
                        </PickBtn>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}

export { ALIGNMENT_REGEX } from "./lib/alignment";

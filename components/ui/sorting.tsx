"use client";

import { RiArrowDownLine, RiArrowUpLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";

export type SortOption = {
    value: string;
    text: string;
    directionToggleDisabled?: boolean;
};

export function Sorting({
    sortOptions,
    sortBy,
    isAscending = false,
    onSortByChange,
    onSortDirectionChange,
    text,
}: {
    sortOptions: SortOption[];
    sortBy: string;
    isAscending?: boolean;
    onSortByChange: (value: string) => void;
    onSortDirectionChange: (isAscending: boolean) => void;
    text?: string;
}) {
    const selected = sortOptions.find((o) => o.value === sortBy);
    const directionLocked = Boolean(selected?.directionToggleDisabled);
    const items: ComboboxItem[] = sortOptions.map((o) => ({ value: o.value, text: o.text }));
    const directionLabel = isAscending ? "Sort descending" : "Sort ascending";

    return (
        <ButtonGroup>
            <Combobox
                items={items}
                value={sortBy}
                onValueChange={(v) => onSortByChange(String(v))}
                toggleText={text ?? selected?.text ?? "Sort"}
                size="sm"
            />
            <Tooltip content={directionLocked ? "Sort direction is not available" : directionLabel}>
                <Button
                    variant="outline"
                    size="icon"
                    aria-label={directionLabel}
                    aria-disabled={directionLocked || undefined}
                    disabled={directionLocked}
                    accessibleDisabled={false}
                    onClick={() => onSortDirectionChange(!isAscending)}
                >
                    <Icon icon={isAscending ? RiArrowUpLine : RiArrowDownLine} size={ICON_SIZE_SM} />
                </Button>
            </Tooltip>
        </ButtonGroup>
    );
}

"use client";

import { ArrowDown20Regular } from "@fluentui/react-icons/headless/svg/arrow-down";
import { ArrowUp20Regular } from "@fluentui/react-icons/headless/svg/arrow-up";


import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { Icon } from "@/components/ui/icon";

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
                    <Icon icon={isAscending ? ArrowUp20Regular : ArrowDown20Regular} />
                </Button>
            </Tooltip>
        </ButtonGroup>
    );
}

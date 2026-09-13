"use client";

import { RiArrowDownSLine, RiPulseLine, RiRefreshLine } from "@remixicon/react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import type { ActionsFocus } from "./types";
import { STATUS_FILTERS } from "./types";
import { GitChromeActions } from "@/features/git/ui/manager/chrome";

export function Header({
    focus,
    live,
    onLiveChange,
    statusFilter,
    onStatusFilterChange,
    loadingRuns,
    onRefresh,
    showStatusFilter = true,
}: {
    repoSlug: string | null;
    focus: ActionsFocus;
    live: boolean;
    onLiveChange: (live: boolean) => void;
    statusFilter: string;
    onStatusFilterChange: (value: string) => void;
    loadingRuns: boolean;
    onRefresh: () => void;
    showStatusFilter?: boolean;
}) {
    return (
        <GitChromeActions>
            {focus === "workflow-runs" ? (
                <Tooltip content={live ? "Pause live updates" : "Live updates"}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onLiveChange(!live)}
                        aria-label={live ? "Pause live updates" : "Live updates"}
                        aria-pressed={live}
                    >
                        <Icon
                            icon={RiPulseLine}
                            size={ICON_SIZE_SM}
                            className={live ? "text-success" : "text-text-muted"}
                        />
                    </Button>
                </Tooltip>
            ) : null}
            {showStatusFilter ? (
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2">
                            {STATUS_FILTERS.find((f) => f.value === statusFilter)?.label ?? "All runs"}
                            <Icon icon={RiArrowDownSLine} size={ICON_SIZE_SM} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuRadioGroup
                            value={statusFilter}
                            onValueChange={onStatusFilterChange}
                        >
                            {STATUS_FILTERS.map((f) => (
                                <DropdownMenuRadioItem key={f.value} value={f.value}>
                                    {f.label}
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
            <Tooltip content="Refresh">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onRefresh}
                    disabled={loadingRuns}
                    aria-label="Refresh"
                >
                    <Icon icon={RiRefreshLine} size={ICON_SIZE_SM} />
                </Button>
            </Tooltip>
        </GitChromeActions>
    );
}

"use client";

import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import type { ActionsFocus } from "./types";
import { STATUS_FILTERS } from "./types";
import { FadeTruncate } from "@/components/ui/fade-truncate";

export function Header({
    repoSlug,
    focus,
    live,
    onLiveChange,
    statusFilter,
    onStatusFilterChange,
    loadingRuns,
    onRefresh,
}: {
    repoSlug: string | null;
    focus: ActionsFocus;
    live: boolean;
    onLiveChange: (live: boolean) => void;
    statusFilter: string;
    onStatusFilterChange: (value: string) => void;
    loadingRuns: boolean;
    onRefresh: () => void;
}) {
    const focusLabel =
        focus !== "workflow-runs" ? ` · ${focus.replace(/-/g, " ")}` : "";
    const title = `Actions · ${repoSlug ?? "No repository"}${focusLabel}`;

    return (
        <header className="flex h-9 shrink-0 items-center gap-2 px-3">
            <Icon name="github" size={16} className="shrink-0 text-text-muted" />
            <FadeTruncate className="min-w-0 flex-1 text-sm font-medium" title={title}>
                {title}
            </FadeTruncate>
            <div className="flex shrink-0 items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-text-secondary">
                <Switch checked={live} onCheckedChange={onLiveChange} />
                Live
            </label>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-2">
                        {STATUS_FILTERS.find((f) => f.value === statusFilter)?.label ?? "All runs"}
                        <Icon name="expand_more" size={14} />
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
            <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2"
                onClick={onRefresh}
                disabled={loadingRuns}
            >
                <Icon name="refresh" size={14} />
                Refresh
            </Button>
            </div>
        </header>
    );
}

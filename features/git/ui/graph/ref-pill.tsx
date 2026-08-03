import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

export type RefInfo = {
    label: string;
    isRemote: boolean;
    isHead: boolean;
    isTag: boolean;
};

/**
 * Ref chips styled after vscode-git-graph `.gitRef`:
 * coloured icon strip + name, active border uses lane colour.
 */
function RefPillVisual({
    refInfo,
    color,
    emphasized,
    className,
}: {
    refInfo: RefInfo;
    color: string;
    emphasized?: boolean;
    className?: string;
}) {
    const raw = refInfo.label.replace(/^tag:\s*/i, "");
    const icon = refInfo.isTag ? "tag" : refInfo.isHead ? "commit" : "account_tree";
    return (
        <span
            className={cn(
                "inline-flex h-[18px] max-w-[190px] shrink-0 items-center overflow-hidden rounded-[5px] text-text-primary",
                "bg-black/10 dark:bg-white/10",
                className,
            )}
            style={{
                border: `1px solid ${emphasized ? color : "color-mix(in srgb, var(--color-border) 80%, transparent)"}`,
            }}
        >
            <span
                className="flex h-full w-[16px] shrink-0 items-center justify-center"
                style={{ backgroundColor: color }}
            >
                <Icon name={icon} size={11} className="text-[var(--graph-surface,var(--color-panel))]" />
            </span>
            <span
                className={cn(
                    "truncate px-1.5 text-[12px] leading-[18px]",
                    emphasized ? "font-semibold" : "font-medium",
                    refInfo.isRemote && "italic opacity-90",
                )}
            >
                {raw}
            </span>
        </span>
    );
}

export function RefPill({
    refInfo,
    color,
    emphasized,
}: {
    refInfo: RefInfo;
    color: string;
    emphasized?: boolean;
}) {
    const raw = refInfo.label.replace(/^tag:\s*/i, "");
    const kind = refInfo.isTag ? "Tag" : refInfo.isRemote ? "Remote branch" : refInfo.isHead ? "HEAD" : "Branch";

    return (
        <Tooltip
            side="top"
            align="center"
            delayDuration={250}
            sideOffset={6}
            content={
                <div className="flex flex-col gap-1.5 py-0.5 px-0.5 max-w-[280px]">
                    <RefPillVisual
                        refInfo={refInfo}
                        color={color}
                        emphasized={emphasized}
                        className="max-w-none h-5"
                    />
                    <div className="flex flex-col gap-0.5 px-0.5">
                        <span className="text-xs text-text-muted">{kind}</span>
                        <span className="text-sm text-text-primary break-all">{raw}</span>
                    </div>
                </div>
            }
        >
            <span
                className="inline-flex shrink-0"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <RefPillVisual refInfo={refInfo} color={color} emphasized={emphasized} />
            </span>
        </Tooltip>
    );
}

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";

export function FilterMenu({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
}) {
    const current = options.find((o) => o.value === value)?.label ?? label;
    return (
        // modal={false} avoids body scroll-lock / scrollbar gutter jump that shifts graph lanes.
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 max-w-[180px] gap-1 rounded-lg border border-border bg-transparent px-2.5 text-sm font-regular text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                >
                    <span className="truncate">{current}</span>
                    <Icon name="expand_more" size={14} className="shrink-0 text-text-muted" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                className="max-h-72 w-56"
                onCloseAutoFocus={(e) => e.preventDefault()}
            >
                {options.map((opt) => (
                    <DropdownMenuItem
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        className={cn(value === opt.value && "bg-panel-hover")}
                    >
                        <span className="truncate">{opt.label}</span>
                        {value === opt.value ? (
                            <Icon name="check" size={14} className="ml-auto shrink-0 text-text-primary" />
                        ) : null}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

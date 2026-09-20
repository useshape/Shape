"use client";

import { RiArrowDownSLine } from "@remixicon/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { SearchInput } from "@/components/ui/search";
import { cn } from "@/lib/utils";
import { sidebarEdgeOffset } from "./edge";
import { CONTROL } from "./field";

export const FONT_FAMILIES = [
    "Arial",
    "Georgia",
    "Geist",
    "IBM Plex Mono",
    "Inter",
    "System Sans-Serif",
    "Tahoma",
    "Times New Roman",
    "Verdana",
];

export const WEIGHTS = [
    ["100", "Thin"],
    ["200", "Extra Light"],
    ["300", "Light"],
    ["400", "Regular"],
    ["500", "Medium"],
    ["600", "Semibold"],
    ["700", "Bold"],
    ["800", "Heavy"],
    ["900", "Black"],
] as const;

export function weightLabel(value?: string) {
    const raw = (value ?? "").trim().toLowerCase();
    const named: Record<string, string> = {
        thin: "100",
        extralight: "200",
        "extra-light": "200",
        light: "300",
        normal: "400",
        regular: "400",
        medium: "500",
        semibold: "600",
        "semi-bold": "600",
        bold: "700",
        extrabold: "800",
        "extra-bold": "800",
        heavy: "800",
        black: "900",
    };
    const numeric = named[raw] ?? raw;
    const match = WEIGHTS.find(([weight]) => weight === numeric);
    return match ? match[1] : value || "Regular";
}

export const FONT_MENU =
    "!p-0 z-9999 w-82 overflow-hidden bg-surface-4/70 backdrop-blur-sm";

const MENU = FONT_MENU;

export function FontField({
    value,
    onChange,
    className,
}: {
    value: string;
    onChange: (value: string) => void;
    className?: string;
}) {
    const [query, setQuery] = useState("");
    const [edge, setEdge] = useState(8);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const measure = () => setEdge(sidebarEdgeOffset(triggerRef.current));
    const visible = FONT_FAMILIES.filter((font) =>
        font.toLowerCase().includes(query.trim().toLowerCase()),
    );
    return (
        <DropdownMenu modal={false} onOpenChange={(open) => { if (open) measure(); }}>
            <DropdownMenuTrigger asChild>
                <Button
                    ref={triggerRef}
                    variant="secondary"
                    size="xs"
                    onPointerDown={measure}
                    className={cn(
                        CONTROL,
                        "min-w-0 flex-1 justify-start border border-border bg-panel-hover px-1.5 text-text-primary hover:bg-panel-hover",
                        className,
                    )}
                >
                    <span className="min-w-0 flex-1 truncate text-left font-normal">{value}</span>
                    <Icon icon={RiArrowDownSLine} size={ICON_SIZE_SM} className="text-text-muted" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                side="left"
                align="start"
                sideOffset={edge}
                avoidCollisions={false}
                collisionPadding={0}
                className={MENU}
            >
                <div className="border-b border-border">
                    <SearchInput
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        placeholder="Search fonts"
                        borderless
                        className="h-8"
                        autoFocus
                    />
                </div>
                <div className="max-h-96 overflow-y-auto p-1">
                    {visible.map((font) => (
                        <DropdownMenuItem
                            key={font}
                            onClick={() => onChange(font)}
                            className={cn("mt-1 h-10 text-2xl", font === value && "bg-panel-active")}
                            style={{
                                fontFamily:
                                    font === "System Sans-Serif"
                                        ? "system-ui, sans-serif"
                                        : font,
                            }}
                        >
                            {font}
                        </DropdownMenuItem>
                    ))}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function WeightField({
    value,
    onChange,
    className,
}: {
    value: string;
    onChange: (value: string) => void;
    className?: string;
}) {
    const [query, setQuery] = useState("");
    const [edge, setEdge] = useState(8);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const measure = () => setEdge(sidebarEdgeOffset(triggerRef.current));
    const current = weightLabel(value);
    const currentWeight =
        WEIGHTS.find(([, label]) => label === current)?.[0]
        ?? WEIGHTS.find(([weight]) => weight === value)?.[0]
        ?? "400";
    const visible = WEIGHTS.filter(
        ([weight, label]) =>
            label.toLowerCase().includes(query.trim().toLowerCase())
            || weight.includes(query.trim()),
    );
    return (
        <DropdownMenu modal={false} onOpenChange={(open) => { if (open) measure(); }}>
            <DropdownMenuTrigger asChild>
                <Button
                    ref={triggerRef}
                    variant="secondary"
                    size="xs"
                    onPointerDown={measure}
                    className={cn(
                        CONTROL,
                        "min-w-0 flex-1 justify-start border border-border bg-panel-hover px-1.5 text-text-primary hover:bg-panel-hover",
                        className,
                    )}
                >
                    <span className="min-w-0 flex-1 truncate text-left font-normal">{current}</span>
                    <Icon icon={RiArrowDownSLine} size={ICON_SIZE_SM} className="text-text-muted" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                side="left"
                align="start"
                sideOffset={edge}
                avoidCollisions={false}
                collisionPadding={0}
                className={MENU}
            >
                <div className="border-b border-border">
                    <SearchInput
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        placeholder="Search weights"
                        borderless
                        className="h-8"
                        autoFocus
                    />
                </div>
                <div className="max-h-96 overflow-y-auto p-1">
                    {visible.map(([weight, label]) => (
                        <DropdownMenuItem
                            key={weight}
                            onClick={() => onChange(weight)}
                            className={cn("mt-1 h-10 text-2xl", weight === currentWeight && "bg-panel-active")}
                            style={{ fontWeight: Number(weight) || 400 }}
                        >
                            {label}
                        </DropdownMenuItem>
                    ))}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

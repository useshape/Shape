"use client";

import {
    RiAlignCenter,
    RiAlignJustify,
    RiAlignLeft,
    RiAlignRight,
    RiCloseLine,
    RiEqualizer2Line,
    RiTextWrap,
} from "@remixicon/react";
import { useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { sidebarEdgeOffset } from "./edge";
import { CONTROL, IconButton, Segment, SelectField } from "./field";
import { FONT_MENU } from "./font";
import { css, type Styles } from "./types";

function OffOn({
    value,
    onChange,
}: {
    value: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <div
            role="group"
            className={cn(
                CONTROL,
                "flex w-28 shrink-0 overflow-hidden rounded-md border border-border bg-panel-hover",
            )}
        >
            {(
                [
                    [false, "Off"],
                    [true, "On"],
                ] as const
            ).map(([on, label], index) => (
                <button
                    key={label}
                    type="button"
                    onClick={() => onChange(on)}
                    className={cn(
                        "flex h-full min-w-0 flex-1 items-center justify-center text-xs font-medium",
                        index > 0 && "border-l border-border",
                        value === on
                            ? "bg-panel-active text-text-primary"
                            : "text-text-secondary hover:bg-panel-active/60 hover:text-text-primary",
                    )}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

function Row({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-8 items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-text-muted">{label}</span>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

export function FormatMenu({
    style,
    setStyle,
    onPreview,
    onCommit,
}: {
    style: Styles;
    setStyle: (property: string, value: string) => void;
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
}) {
    const [open, setOpen] = useState(false);
    const [edge, setEdge] = useState(8);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const measure = () => setEdge(sidebarEdgeOffset(triggerRef.current));
    const transform = css(style, "text-transform", "none");
    const wrap = css(style, "white-space", "normal");
    const keepWords = css(style, "word-break") === "keep-all";
    const truncated =
        css(style, "text-overflow") === "ellipsis"
        || css(style, "overflow") === "hidden" && wrap === "nowrap";

    const write = (styles: Styles) => {
        onPreview(styles);
        onCommit(styles);
    };

    return (
        <DropdownMenu
            modal={false}
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) measure();
            }}
        >
            <DropdownMenuTrigger asChild>
                <Button
                    ref={triggerRef}
                    type="button"
                    variant="ghost"
                    size="icon"
                    icon={RiEqualizer2Line}
                    aria-label="Formatting"
                    title="Formatting"
                    onPointerDown={measure}
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent
                side="left"
                align="start"
                sideOffset={edge}
                avoidCollisions={false}
                collisionPadding={0}
                className={cn(FONT_MENU, "w-80 p-0")}
            >
                <div className="flex h-9 items-center border-b border-border px-2">
                    <span className="min-w-0 flex-1 px-1 text-sm font-medium text-text-primary">Formatting</span>
                    <IconButton label="Close" icon={RiCloseLine} onClick={() => setOpen(false)} />
                </div>
                <div className="space-y-2 p-3">
                    <div
                        className="flex h-28 items-center justify-center overflow-hidden rounded-md border border-border bg-panel-hover px-4 text-sm text-text-muted"
                        style={{
                            fontFamily: style["font-family"],
                            fontSize: style["font-size"] || "16px",
                            fontWeight: style["font-weight"],
                            textAlign: (style["text-align"] as CSSProperties["textAlign"]) || "center",
                            textTransform: (style["text-transform"] as CSSProperties["textTransform"]) || "none",
                            whiteSpace: truncated ? "nowrap" : ((style["white-space"] as CSSProperties["whiteSpace"]) || "normal"),
                            textOverflow: truncated ? "ellipsis" : "clip",
                            overflow: truncated ? "hidden" : "visible",
                            wordBreak: keepWords ? "keep-all" : "normal",
                        }}
                    >
                        Lorem ipsum
                    </div>
                    <Row label="Alignment">
                        <Segment
                            value={css(style, "text-align", "left")}
                            onChange={(value) => setStyle("text-align", value)}
                            items={[
                                { value: "left", icon: RiAlignLeft, title: "Align left" },
                                { value: "center", icon: RiAlignCenter, title: "Align center" },
                                { value: "right", icon: RiAlignRight, title: "Align right" },
                                { value: "justify", icon: RiAlignJustify, title: "Justify" },
                            ]}
                        />
                    </Row>
                    <Row label="Case">
                        <Segment
                            value={transform === "none" || !transform ? "none" : transform}
                            onChange={(value) => setStyle("text-transform", value)}
                            items={[
                                { value: "none", label: "/", title: "As typed" },
                                { value: "uppercase", label: "AA", title: "Uppercase" },
                                { value: "lowercase", label: "aa", title: "Lowercase" },
                                { value: "capitalize", label: "Aa", title: "Capitalize" },
                            ]}
                        />
                    </Row>
                    <Row label="Wrap">
                        <SelectField
                            icon={RiTextWrap}
                            value={wrap === "pre-wrap" ? "pre-wrap" : wrap === "nowrap" ? "nowrap" : wrap === "balance" ? "balance" : "normal"}
                            options={[
                                ["normal", "Normal"],
                                ["nowrap", "No wrap"],
                                ["pre-wrap", "Preserve"],
                                ["balance", "Balance"],
                            ]}
                            onChange={(value) => setStyle("white-space", value)}
                        />
                    </Row>
                    <Row label="Keep words">
                        <div className="flex justify-end">
                            <OffOn
                                value={keepWords}
                                onChange={(on) => setStyle("word-break", on ? "keep-all" : "normal")}
                            />
                        </div>
                    </Row>
                    <Row label="Truncation">
                        <div className="flex justify-end">
                            <OffOn
                                value={truncated}
                                onChange={(on) =>
                                    write(
                                        on
                                            ? {
                                                  overflow: "hidden",
                                                  "text-overflow": "ellipsis",
                                                  "white-space": "nowrap",
                                              }
                                            : {
                                                  overflow: "visible",
                                                  "text-overflow": "clip",
                                                  "white-space": wrap === "nowrap" ? "normal" : wrap || "normal",
                                              },
                                    )
                                }
                            />
                        </div>
                    </Row>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

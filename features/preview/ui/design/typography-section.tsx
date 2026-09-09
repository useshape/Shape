"use client";

import { RiAlignBottom, RiAlignCenter, RiAlignLeft, RiAlignRight, RiAlignTop, RiAlignVertically, RiFontSize2, RiItalic, RiMoreLine, RiStrikethrough, RiTextSpacing, RiUnderline } from "@remixicon/react";
import React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/ui/icon";
import {
    CheckRow,
    CompactSelect,
    FieldRow,
    FlyoutCard,
    Glyph,
    IconBtn,
    PxInput,
    Section,
    Segment,
    ToggleBtn,
} from "./fields";
import { DesignAssetIcon } from "./asset-icon";
import { FontPickerButton } from "./font-picker";
import { firstFontFamily } from "../../design-mode/css";
import type { DesignComputedStyles } from "../../design-mode/types";
import {
    normalizeTextAlign,
    normalizeWeight,
    parsePx,
    px,
} from "../../design-mode/css";
import { getDesignBridge } from "../../design-mode/store";

const WEIGHT_OPTIONS = [
    { value: "100", label: "Thin", style: { fontWeight: 100 as const } },
    { value: "200", label: "Extra Light", style: { fontWeight: 200 as const } },
    { value: "300", label: "Light", style: { fontWeight: 300 as const } },
    { value: "400", label: "Regular", style: { fontWeight: 400 as const } },
    { value: "500", label: "Medium", style: { fontWeight: 500 as const } },
    { value: "600", label: "Semibold", style: { fontWeight: 600 as const } },
    { value: "700", label: "Bold", style: { fontWeight: 700 as const } },
    { value: "800", label: "Extra Bold", style: { fontWeight: 800 as const } },
    { value: "900", label: "Black", style: { fontWeight: 900 as const } },
];

export function TypographySection({
    s,
    text,
    onPatch,
}: {
    s: DesignComputedStyles;
    text?: string;
    onPatch: (styles: Partial<DesignComputedStyles>, text?: string) => void;
}) {
    const [details, setDetails] = React.useState(false);
    const [anchor, setAnchor] = React.useState<DOMRect | null>(null);
    const [inUse, setInUse] = React.useState<string[]>(() => {
        const current = firstFontFamily(s.fontFamily);
        return current ? [current] : [];
    });
    const moreRef = React.useRef<HTMLDivElement>(null);
    const textAlign = normalizeTextAlign(s.textAlign);
    const weight = normalizeWeight(s.fontWeight);
    const deco = s.textDecoration || "none";
    const transform = s.textTransform || "none";
    const italic = (s.fontStyle || "") === "italic";
    const truncated = (s.overflow || "").includes("hidden") && s.textOverflow === "ellipsis";
    const valign = (s.alignItems || "stretch") as string;

    React.useEffect(() => {
        let cancelled = false;
        void getDesignBridge()
            ?.listFonts?.()
            .then((names) => {
                if (cancelled) return;
                const current = firstFontFamily(s.fontFamily);
                const merged = [...(names ?? [])];
                if (current && !merged.some((n) => n.toLowerCase() === current.toLowerCase())) merged.unshift(current);
                setInUse(merged);
            });
        return () => {
            cancelled = true;
        };
    }, [s.fontFamily]);

    return (
        <Section title="Typography">
            <FontPickerButton
                family={s.fontFamily}
                inUse={inUse}
                onChange={(stack) => onPatch({ fontFamily: stack })}
            />
            <div className="flex gap-1">
                <CompactSelect value={weight} options={WEIGHT_OPTIONS} onChange={(v) => onPatch({ fontWeight: v })} />
                <PxInput
                    glyph={<Icon icon={RiFontSize2} />}
                    title="Size"
                    value={parsePx(s.fontSize)}
                    onCommit={(n) => onPatch({ fontSize: px(n) })}
                />
            </div>
            <div className="flex gap-1">
                <PxInput
                    glyph={<Icon icon={RiTextSpacing} />}
                    title="Line height"
                    value={parsePx(s.lineHeight)}
                    onCommit={(n) => onPatch({ lineHeight: px(n) })}
                />
                <PxInput
                    glyph={<Icon icon={RiTextSpacing} />}
                    title="Letter spacing"
                    value={parsePx(s.letterSpacing) ?? 0}
                    min={-40}
                    onCommit={(n) => onPatch({ letterSpacing: px(n) })}
                />
            </div>
            <div className="flex items-center gap-1">
                <Segment>
                    <ToggleBtn label="Left" active={textAlign === "left"} onClick={() => onPatch({ textAlign: "left" })}>
                        <Icon icon={RiAlignLeft} />
                    </ToggleBtn>
                    <ToggleBtn label="Center" active={textAlign === "center"} onClick={() => onPatch({ textAlign: "center" })}>
                        <Icon icon={RiAlignCenter} />
                    </ToggleBtn>
                    <ToggleBtn label="Right" active={textAlign === "right"} onClick={() => onPatch({ textAlign: "right" })}>
                        <Icon icon={RiAlignRight} />
                    </ToggleBtn>
                    <ToggleBtn label="Justify" active={textAlign === "justify"} onClick={() => onPatch({ textAlign: "justify" })}>
                        <DesignAssetIcon name="align-justify" size={14} />
                    </ToggleBtn>
                </Segment>
            </div>
            <div className="flex items-center gap-1">
                <Segment>
                    <ToggleBtn label="Top" active={valign === "flex-start"} onClick={() => onPatch({ alignItems: "flex-start" })}>
                        <Icon icon={RiAlignTop} />
                    </ToggleBtn>
                    <ToggleBtn label="Middle" active={valign === "center"} onClick={() => onPatch({ alignItems: "center" })}>
                        <Icon icon={RiAlignVertically} />
                    </ToggleBtn>
                    <ToggleBtn label="Bottom" active={valign === "flex-end"} onClick={() => onPatch({ alignItems: "flex-end" })}>
                        <Icon icon={RiAlignBottom} />
                    </ToggleBtn>
                </Segment>
                <div ref={moreRef}>
                <IconBtn
                    title="Type settings"
                    active={details}
                    onClick={(e) => {
                        setAnchor(e.currentTarget.getBoundingClientRect());
                        setDetails((v) => !v);
                    }}
                >
                    <Icon icon={RiMoreLine} />
                </IconBtn>
                </div>
            </div>
            {details && anchor ? (
                <FlyoutCard title="Type" anchor={anchor} trigger={moreRef.current} onClose={() => setDetails(false)}>
                    <FieldRow label="Style">
                        <Segment>
                            <ToggleBtn
                                label="Italic"
                                active={italic}
                                onClick={() => onPatch({ fontStyle: italic ? "normal" : "italic" })}
                            >
                                <Icon icon={RiItalic} />
                            </ToggleBtn>
                            <ToggleBtn
                                label="Underline"
                                active={deco.includes("underline")}
                                onClick={() => onPatch({ textDecoration: deco.includes("underline") ? "none" : "underline" })}
                            >
                                <Icon icon={RiUnderline} />
                            </ToggleBtn>
                            <ToggleBtn
                                label="Strikethrough"
                                active={deco.includes("line-through")}
                                onClick={() => onPatch({ textDecoration: deco.includes("line-through") ? "none" : "line-through" })}
                            >
                                <Icon icon={RiStrikethrough} />
                            </ToggleBtn>
                        </Segment>
                    </FieldRow>
                    <FieldRow label="Case">
                        <Segment>
                            <ToggleBtn
                                label="AA"
                                active={transform === "uppercase"}
                                onClick={() => onPatch({ textTransform: transform === "uppercase" ? "none" : "uppercase" })}
                            >
                                AA
                            </ToggleBtn>
                            <ToggleBtn
                                label="aa"
                                active={transform === "lowercase"}
                                onClick={() => onPatch({ textTransform: transform === "lowercase" ? "none" : "lowercase" })}
                            >
                                aa
                            </ToggleBtn>
                            <ToggleBtn
                                label="Aa"
                                active={transform === "capitalize"}
                                onClick={() => onPatch({ textTransform: transform === "capitalize" ? "none" : "capitalize" })}
                            >
                                Aa
                            </ToggleBtn>
                        </Segment>
                    </FieldRow>
                    <FieldRow label="Space">
                        <PxInput
                            glyph={<Glyph>P</Glyph>}
                            title="Paragraph spacing"
                            value={parsePx(s.marginBottom) ?? 0}
                            onCommit={(n) => onPatch({ marginBottom: px(n) })}
                        />
                    </FieldRow>
                    <CheckRow
                        label="Truncate"
                        checked={truncated}
                        onChange={(v) =>
                            onPatch(
                                v
                                    ? { overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }
                                    : { overflow: "visible", whiteSpace: "normal", textOverflow: "clip" },
                            )
                        }
                    />
                </FlyoutCard>
            ) : null}
            {text ? (
                <Textarea
                    value={text}
                    onChange={(e) => onPatch({}, e.target.value)}
                    rows={2}
                    placeholder="Content"
                    className="min-h-10 resize-y text-sm"
                />
            ) : null}
        </Section>
    );
}

import type { RemixiconComponentType } from "@remixicon/react";
import {
    RiFontSize,
    RiRoundedCorner,
    RiShadowLine,
    RiSpace,
    RiTextSpacing,
} from "@remixicon/react";

export type DesignTokenMention = {
    id: string;
    label: string;
    prompt: string;
    icon: RemixiconComponentType;
};

/** Composer @-mentions for spacing / radius / type — not design-preview sessions. */
export const DESIGN_TOKEN_MENTIONS: DesignTokenMention[] = [
    {
        id: "radius-sm",
        label: "Radius sm",
        prompt: "Use the project's small corner radius (typically 4–6px / rounded-sm). Keep this control compact.",
        icon: RiRoundedCorner,
    },
    {
        id: "radius-md",
        label: "Radius md",
        prompt: "Use the project's medium corner radius (typically 8px / rounded-md).",
        icon: RiRoundedCorner,
    },
    {
        id: "radius-lg",
        label: "Radius lg",
        prompt: "Use the project's large corner radius (typically 12–16px / rounded-lg). Do not jump to rounded-3xl unless the file already does.",
        icon: RiRoundedCorner,
    },
    {
        id: "radius-full",
        label: "Radius full",
        prompt: "Use fully rounded / pill chrome only on this control (rounded-full), matching existing pills in the repo.",
        icon: RiRoundedCorner,
    },
    {
        id: "padding-sm",
        label: "Padding sm",
        prompt: "Use tight padding (p-1 / p-1.5 / px-2). Do not inflate spacing around this element.",
        icon: RiSpace,
    },
    {
        id: "padding-md",
        label: "Padding md",
        prompt: "Use the project's default control padding (typically p-2 / px-3).",
        icon: RiSpace,
    },
    {
        id: "padding-lg",
        label: "Padding lg",
        prompt: "Use generous padding (p-4 / p-6) only on this surface, still matching the project's scale.",
        icon: RiSpace,
    },
    {
        id: "gap-sm",
        label: "Gap sm",
        prompt: "Use a tight flex/grid gap (gap-1 / gap-1.5).",
        icon: RiSpace,
    },
    {
        id: "gap-md",
        label: "Gap md",
        prompt: "Use the project's default stack gap (typically gap-2 / gap-3).",
        icon: RiSpace,
    },
    {
        id: "font-size",
        label: "Font size",
        prompt: "Match the project's type scale for this element (text-sm / text-md tokens). Do not invent a new size.",
        icon: RiFontSize,
    },
    {
        id: "line-height",
        label: "Line height",
        prompt: "Match the project's line-height for this text (leading-tight on labels, ~1.5 on body).",
        icon: RiTextSpacing,
    },
    {
        id: "shadow",
        label: "Shadow",
        prompt: "Use the project's existing elevation token. Prefer a hairline border over a large drop shadow.",
        icon: RiShadowLine,
    },
];

export function designTokenById(id: string | undefined): DesignTokenMention | null {
    if (!id) return null;
    const key = id.trim().toLowerCase().replace(/^@design:/, "");
    return DESIGN_TOKEN_MENTIONS.find((t) => t.id === key) ?? null;
}

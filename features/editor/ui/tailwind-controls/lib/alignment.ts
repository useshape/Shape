/**
 * Pure alignment utility groups and edit helpers.
 */

export const FLEX_DIRECTION = ["flex-row", "flex-col", "flex-row-reverse", "flex-col-reverse"] as const;
export const ALIGN_ITEMS = ["items-start", "items-center", "items-end", "items-baseline", "items-stretch"] as const;
export const JUSTIFY_CONTENT = ["justify-start", "justify-center", "justify-end", "justify-between", "justify-around", "justify-evenly"] as const;
export const FLEX_WRAP = ["flex-wrap", "flex-wrap-reverse", "flex-nowrap"] as const;

export type FlexDirection = (typeof FLEX_DIRECTION)[number];
export type AlignItems = (typeof ALIGN_ITEMS)[number];
export type JustifyContent = (typeof JUSTIFY_CONTENT)[number];

export const ALIGNMENT_TOKEN_RE =
    /^(?:flex(?:-(?:row|col)(?:-reverse)?)?|inline-flex|items-(?:start|center|end|baseline|stretch)|justify-(?:start|center|end|between|around|evenly))$/;

export const ALIGNMENT_REGEX =
    /\b((?:inline-)?flex(?:-(?:row|col)(?:-reverse)?)?|items-(?:start|center|end|baseline|stretch)|justify-(?:start|center|end|between|around|evenly))\b/g;

export interface ClassEditResult {
    add: string[];
    remove: string[];
}

export function pickInGroup(
    currentTokens: string[],
    group: readonly string[],
    value: string,
): ClassEditResult {
    const remove = group.filter((c) => c !== value && currentTokens.includes(c));
    const add = currentTokens.includes(value) ? [] : [value];
    return { add, remove };
}

export function getAlignmentTokens(tokens: string[]): string[] {
    return tokens.filter((t) => ALIGNMENT_TOKEN_RE.test(t));
}

export function isFlexRow(tokens: string[]): boolean {
    return tokens.includes("flex-col") || tokens.includes("flex-col-reverse") ? false : true;
}

export function toggleReverse(currentTokens: string[]): ClassEditResult {
    const hasRowRev = currentTokens.includes("flex-row-reverse");
    const hasColRev = currentTokens.includes("flex-col-reverse");
    const isCol = currentTokens.includes("flex-col");

    if (isCol) {
        if (hasColRev) {
            return { remove: ["flex-col-reverse"], add: ["flex-col"] };
        }
        return { remove: ["flex-col"], add: ["flex-col-reverse"] };
    }

    if (hasRowRev) {
        return { remove: ["flex-row-reverse"], add: ["flex-row"] };
    }
    return { remove: ["flex-row"], add: ["flex-row-reverse"] };
}

export function isReversed(tokens: string[]): boolean {
    return tokens.includes("flex-row-reverse") || tokens.includes("flex-col-reverse");
}

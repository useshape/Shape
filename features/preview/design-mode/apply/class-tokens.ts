import { parseToRgba, rgbaToHex } from "@/features/editor/ui/color-picker/ui/color-utils";

const WEIGHT: Record<string, string> = {
    "100": "font-thin",
    "200": "font-extralight",
    "300": "font-light",
    "400": "font-normal",
    "500": "font-medium",
    "600": "font-semibold",
    "700": "font-bold",
    "800": "font-extrabold",
    "900": "font-black",
};

export function rgbToHex(value: string): string | null {
    const raw = value.trim();
    if (/^var\(/i.test(raw) || /^(calc|clamp|min|max)\(/i.test(raw)) return null;
    const parsed = parseToRgba(raw);
    if (parsed) return rgbaToHex(parsed).toLowerCase();
    if (/^#([0-9a-f]{3,8})$/i.test(raw)) return raw.toLowerCase();
    return null;
}

export function sameCssColor(a: string, b: string): boolean {
    const ha = rgbToHex(a);
    const hb = rgbToHex(b);
    return !!ha && !!hb && ha === hb;
}

function arb(prefix: string, value: string): string {
    const compact = value.trim().replace(/\s+/g, "_");
    return `${prefix}-[${compact}]`;
}

function pxToken(prefix: string, value: string): string {
    const m = value.trim().match(/^(-?[\d.]+)px$/i);
    if (!m) return arb(prefix, value);
    return `${prefix}-[${m[1]}px]`;
}

export function splitVariantToken(token: string): { variants: string; core: string } {
    let rest = token;
    let variants = "";
    while (rest.length) {
        if (rest.startsWith("[")) {
            const end = rest.indexOf("]:");
            if (end < 0) break;
            variants += rest.slice(0, end + 2);
            rest = rest.slice(end + 2);
            continue;
        }
        const m = rest.match(/^((?:max|min|@)?[a-z0-9/-]+(?:\[[^\]]+\])?:)/i);
        if (!m) break;
        variants += m[1];
        rest = rest.slice(m[1].length);
    }
    return { variants, core: rest };
}

export function stylesToClassTokens(styles: Record<string, string | undefined>): string[] {
    const out: string[] = [];
    const add = (t?: string | null) => {
        if (t) out.push(t);
    };
    for (const [key, raw] of Object.entries(styles)) {
        if (raw == null || raw === "") continue;
        const v = raw.trim();
        switch (key) {
            case "fontSize":
                add(pxToken("text", v));
                break;
            case "fontWeight":
                add(WEIGHT[v] || (/^\d+$/.test(v) ? arb("font", v) : undefined));
                break;
            case "fontFamily": {
                if (/^var\(/.test(v)) {
                    add(arb("font", v.replace(/['"]/g, "")));
                    break;
                }
                const first = v.split(",")[0]?.replace(/['"]/g, "").trim();
                if (first) add(`font-[${first.replace(/\s+/g, "_")}]`);
                break;
            }
            case "fontStyle":
                if (v === "italic") add("italic");
                else if (v === "normal") add("not-italic");
                break;
            case "color":
                add(arb("text", rgbToHex(v) || v));
                break;
            case "backgroundColor":
                if (v === "transparent") add("bg-transparent");
                else add(arb("bg", rgbToHex(v) || v));
                break;
            case "backgroundImage":
                if (v === "none") add("bg-none");
                else add(arb("bg", v));
                break;
            case "width":
                add(v === "100%" ? "w-full" : pxToken("w", v));
                break;
            case "height":
                add(v === "100%" ? "h-full" : pxToken("h", v));
                break;
            case "opacity": {
                const n = parseFloat(v);
                if (Number.isFinite(n)) add(`opacity-${Math.round(n > 1 ? n : n * 100)}`);
                break;
            }
            case "borderRadius":
                add(pxToken("rounded", v));
                break;
            case "borderWidth":
                add(pxToken("border", v));
                break;
            case "borderStyle":
                if (v === "none") add("border-0");
                else if (v === "dashed") add("border-dashed");
                else if (v === "dotted") add("border-dotted");
                else add("border-solid");
                break;
            case "borderColor":
                add(arb("border", rgbToHex(v) || v));
                break;
            case "textAlign":
                add(v === "left" || v === "center" || v === "right" || v === "justify" ? `text-${v}` : undefined);
                break;
            case "textDecoration":
                if (v.includes("underline")) add("underline");
                else if (v.includes("line-through")) add("line-through");
                else if (v === "none") add("no-underline");
                break;
            case "textTransform":
                if (v === "uppercase") add("uppercase");
                else if (v === "lowercase") add("lowercase");
                else if (v === "capitalize") add("capitalize");
                else if (v === "none") add("normal-case");
                break;
            case "whiteSpace":
                if (v === "nowrap") add("whitespace-nowrap");
                else if (v === "normal") add("whitespace-normal");
                else if (v === "pre") add("whitespace-pre");
                break;
            case "textOverflow":
                if (v === "ellipsis") add("truncate");
                else if (v === "clip") add("text-clip");
                break;
            case "display":
                if (v === "flex" || v === "inline-flex" || v === "grid" || v === "block" || v === "hidden") add(v);
                else if (v === "none") add("hidden");
                break;
            case "flexDirection":
                add(v.startsWith("column") ? "flex-col" : "flex-row");
                break;
            case "flexWrap":
                if (v === "wrap") add("flex-wrap");
                else if (v === "nowrap") add("flex-nowrap");
                break;
            case "justifyContent": {
                const map: Record<string, string> = {
                    "flex-start": "justify-start",
                    center: "justify-center",
                    "flex-end": "justify-end",
                    "space-between": "justify-between",
                    "space-around": "justify-around",
                    "space-evenly": "justify-evenly",
                };
                add(map[v]);
                break;
            }
            case "alignItems": {
                const map: Record<string, string> = {
                    "flex-start": "items-start",
                    center: "items-center",
                    "flex-end": "items-end",
                    stretch: "items-stretch",
                    baseline: "items-baseline",
                };
                add(map[v]);
                break;
            }
            case "gap":
                add(pxToken("gap", v));
                break;
            case "columnGap":
                if (styles.gap != null && String(styles.gap).trim() === v) break;
                add(pxToken("gap-x", v));
                break;
            case "rowGap":
                if (styles.gap != null && String(styles.gap).trim() === v) break;
                add(pxToken("gap-y", v));
                break;
            case "paddingTop":
                add(pxToken("pt", v));
                break;
            case "paddingBottom":
                add(pxToken("pb", v));
                break;
            case "paddingLeft":
                add(pxToken("pl", v));
                break;
            case "paddingRight":
                add(pxToken("pr", v));
                break;
            case "marginTop":
                add(pxToken("mt", v));
                break;
            case "marginBottom":
                add(pxToken("mb", v));
                break;
            case "marginLeft":
                add(pxToken("ml", v));
                break;
            case "marginRight":
                add(pxToken("mr", v));
                break;
            case "letterSpacing":
                add(arb("tracking", v));
                break;
            case "lineHeight":
                add(pxToken("leading", v));
                break;
            case "overflow":
                add(`overflow-${v.split(" ")[0]}`);
                break;
            case "position":
                if (["relative", "absolute", "fixed", "sticky", "static"].includes(v)) add(v);
                break;
            case "left":
            case "top":
            case "right":
            case "bottom":
                add(pxToken(key, v));
                break;
            case "boxShadow":
                if (v === "none") add("shadow-none");
                else add(arb("shadow", v));
                break;
            case "filter":
                add(arb("filter", v));
                break;
            case "backdropFilter":
                add(arb("backdrop", v));
                break;
            case "maskImage":
            case "WebkitMaskImage":
                if (v === "none") add("mask-none");
                else add(arb("mask", v));
                break;
            case "mixBlendMode":
                add(`mix-blend-${v}`);
                break;
            default:
                break;
        }
    }
    return [...new Set(out)];
}

export function stylesToCssDecls(styles: Record<string, string | undefined>): { prop: string; value: string }[] {
    return Object.entries(styles)
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k, v]) => ({
            prop: k.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`),
            value: String(v).trim(),
        }));
}

function conflictGroup(token: string): string | null {
    const { core } = splitVariantToken(token);
    if (/^text-(left|center|right|justify|start|end)$/.test(core)) return "textAlign";
    if (/^text-\[.+px\]$/.test(core) || /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/.test(core)) {
        return "fontSize";
    }
    if (
        /^text-\[#/.test(core) ||
        /^text-\[rgb/.test(core) ||
        /^text-\[hsl/.test(core) ||
        /^text-\[oklch/.test(core) ||
        /^text-\[lab/.test(core) ||
        /^text-\[var\(/.test(core) ||
        /^text-(black|white|current|transparent|inherit)$/.test(core) ||
        /^text-[a-z]+-\d{2,3}$/.test(core)
    ) {
        return "color";
    }
    if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(core) || /^font-\d+$/.test(core)) {
        return "fontWeight";
    }
    if (/^font-\[/.test(core) || /^font-(sans|serif|mono)$/.test(core)) return "fontFamily";
    if (/^bg-gradient-|^from-|^via-|^to-/.test(core) || /^bg-\[linear-|^bg-\[radial-|^bg-\[url\(/.test(core) || core === "bg-none") {
        return "backgroundImage";
    }
    if (
        /^bg-\[/.test(core) ||
        /^bg-(transparent|current|inherit|black|white)$/.test(core) ||
        /^bg-[a-z]+-\d{2,3}$/.test(core)
    ) {
        return "backgroundColor";
    }
    if (/^w-/.test(core)) return "width";
    if (/^h-/.test(core)) return "height";
    if (/^rounded/.test(core)) return "borderRadius";
    if (/^border-(solid|dashed|dotted|double|none|hidden)$/.test(core)) return "borderStyle";
    if (/^border-0$/.test(core) || /^border$/.test(core) || /^border-\d+$/.test(core) || /^border-\[[\d.]+px\]$/.test(core)) {
        return "borderWidth";
    }
    if (/^border-\[#|^border-\[rgb|^border-\[hsl|^border-\[oklch|^border-[a-z]+-\d/.test(core)) return "borderColor";
    if (/^pt-/.test(core)) return "paddingTop";
    if (/^pr-/.test(core)) return "paddingRight";
    if (/^pb-/.test(core)) return "paddingBottom";
    if (/^pl-/.test(core)) return "paddingLeft";
    if (/^px-/.test(core)) return "paddingX";
    if (/^py-/.test(core)) return "paddingY";
    if (/^p-/.test(core)) return "padding";
    if (/^mt-/.test(core)) return "marginTop";
    if (/^mr-/.test(core)) return "marginRight";
    if (/^mb-/.test(core)) return "marginBottom";
    if (/^ml-/.test(core)) return "marginLeft";
    if (/^mx-/.test(core)) return "marginX";
    if (/^my-/.test(core)) return "marginY";
    if (/^m-/.test(core)) return "margin";
    if (/^gap-x-/.test(core)) return "columnGap";
    if (/^gap-y-/.test(core)) return "rowGap";
    if (/^gap-/.test(core)) return "gap";
    if (/^leading-/.test(core)) return "lineHeight";
    if (/^tracking-/.test(core)) return "letterSpacing";
    if (/^opacity-/.test(core)) return "opacity";
    if (/^overflow-/.test(core)) return "overflow";
    if (/^(static|relative|absolute|fixed|sticky)$/.test(core)) return "position";
    if (/^(flex|inline-flex|grid|block|inline-block|hidden|inline)$/.test(core)) return "display";
    if (/^(underline|line-through|no-underline)$/.test(core)) return "textDecoration";
    if (/^(uppercase|lowercase|capitalize|normal-case)$/.test(core)) return "textTransform";
    if (/^(italic|not-italic)$/.test(core)) return "fontStyle";
    if (core === "truncate" || /^whitespace-/.test(core)) return "truncate";
    if (/^flex-(row|col)/.test(core)) return "flexDirection";
    if (/^flex-(wrap|nowrap)/.test(core)) return "flexWrap";
    if (/^justify-/.test(core)) return "justifyContent";
    if (/^items-/.test(core)) return "alignItems";
    if (/^shadow/.test(core)) return "boxShadow";
    if (/^filter-/.test(core)) return "filter";
    if (/^backdrop-/.test(core)) return "backdropFilter";
    if (/^(top|right|bottom|left)-/.test(core)) return core.split("-")[0]!;
    return null;
}

const PADDING_EXPAND: Record<string, string[]> = {
    padding: ["padding", "paddingX", "paddingY", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
    paddingX: ["padding", "paddingX", "paddingLeft", "paddingRight"],
    paddingY: ["padding", "paddingY", "paddingTop", "paddingBottom"],
    paddingTop: ["padding", "paddingY", "paddingTop"],
    paddingBottom: ["padding", "paddingY", "paddingBottom"],
    paddingLeft: ["padding", "paddingX", "paddingLeft"],
    paddingRight: ["padding", "paddingX", "paddingRight"],
    margin: ["margin", "marginX", "marginY", "marginTop", "marginRight", "marginBottom", "marginLeft"],
    marginX: ["margin", "marginX", "marginLeft", "marginRight"],
    marginY: ["margin", "marginY", "marginTop", "marginBottom"],
    marginTop: ["margin", "marginY", "marginTop"],
    marginBottom: ["margin", "marginY", "marginBottom"],
    marginLeft: ["margin", "marginX", "marginLeft"],
    marginRight: ["margin", "marginX", "marginRight"],
    gap: ["gap"],
};

function groupsConflict(incoming: string, existing: string): boolean {
    if (incoming === existing) return true;
    const expand = PADDING_EXPAND[incoming];
    if (expand?.includes(existing)) return true;
    return false;
}

const FLEX_CHILD_GROUPS = new Set(["flexDirection", "flexWrap", "justifyContent", "alignItems", "gap"]);

export function mergeClassTokens(existing: string[], incoming: string[], contextVariants = ""): string[] {
    const incomingWithVar = incoming.map((t) => {
        const s = splitVariantToken(t);
        return s.variants ? t : contextVariants + t;
    });
    const strip = new Set<string>();
    for (const token of incomingWithVar) {
        const { variants, core } = splitVariantToken(token);
        const group = conflictGroup(core);
        if (!group) continue;
        const unwrapFlex = group === "display" && /^(block|inline|hidden|grid|inline-block|inline)$/.test(core);
        for (const e of existing) {
            const es = splitVariantToken(e);
            if (es.variants !== variants) continue;
            const eg = conflictGroup(es.core);
            if (eg && groupsConflict(group, eg)) strip.add(e);
            if (unwrapFlex && eg && FLEX_CHILD_GROUPS.has(eg)) strip.add(e);
        }
    }
    return [...existing.filter((e) => e && !strip.has(e)), ...incomingWithVar.filter(Boolean)];
}

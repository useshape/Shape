import type { RemixiconComponentType } from "@remixicon/react";
import {
    RiAppsFill,
    RiArchiveFill,
    RiBugFill,
    RiCloudFill,
    RiCodeBoxFill,
    RiCommandFill,
    RiCompassFill,
    RiCpuFill,
    RiDatabase2Fill,
    RiDropFill,
    RiFireFill,
    RiFlashlightFill,
    RiFolder3Fill,
    RiGridFill,
    RiHeartFill,
    RiLeafFill,
    RiMoonFill,
    RiPaletteFill,
    RiPuzzleFill,
    RiRocketFill,
    RiShapesFill,
    RiStackFill,
    RiStarFill,
    RiSunFill,
    RiTerminalBoxFill,
    RiWindow2Fill,
} from "@remixicon/react";

export type ProjectGlyph = {
    icon: RemixiconComponentType;
    color: string;
};

const ICONS: RemixiconComponentType[] = [
    RiAppsFill,
    RiArchiveFill,
    RiBugFill,
    RiCloudFill,
    RiCodeBoxFill,
    RiCommandFill,
    RiCompassFill,
    RiCpuFill,
    RiDatabase2Fill,
    RiDropFill,
    RiFireFill,
    RiFlashlightFill,
    RiGridFill,
    RiHeartFill,
    RiLeafFill,
    RiMoonFill,
    RiPaletteFill,
    RiPuzzleFill,
    RiRocketFill,
    RiShapesFill,
    RiStackFill,
    RiStarFill,
    RiSunFill,
    RiTerminalBoxFill,
    RiWindow2Fill,
];

const COLORS = [
    "#5B8DEF",
    "#7C6AF2",
    "#E05A8C",
    "#E07A3D",
    "#C9A227",
    "#3DB88A",
    "#2BB3C7",
    "#E15B5B",
    "#D46BCF",
    "#4F8F6B",
    "#3D7EA6",
    "#C2784B",
];

function hashPath(path: string): number {
    let h = 2166136261;
    const normalized = path.replace(/\\/g, "/").toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
        h ^= normalized.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Stable remix glyph + color derived from the project path. */
export function projectGlyph(path: string | null | undefined): ProjectGlyph {
    if (!path) return { icon: RiFolder3Fill, color: "#A3A3A3" };
    const h = hashPath(path);
    return {
        icon: ICONS[h % ICONS.length]!,
        color: COLORS[h % COLORS.length]!,
    };
}

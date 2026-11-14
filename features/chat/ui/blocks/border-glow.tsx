"use client";

import type { CSSProperties, ReactNode } from "react";
import { BorderBeam } from "./border-beam";
import "./border-glow.css";

function squircle(radius: number): CSSProperties {
    return { borderRadius: radius, cornerShape: "squircle" } as CSSProperties;
}

/**
 * Medium full-border beam from the 21st.dev border-beam example.
 * The glow travels the edge on its own.
 */
export function BorderGlow({
    children,
    className = "",
    radius = 0,
    transparent = false,
    glowSize = 1,
}: {
    children?: ReactNode;
    className?: string;
    /** Corner radius of the frame, in px. */
    radius?: number;
    /** No fill, so the window behind the beam stays clear. */
    transparent?: boolean;
    /** Scales the halo. 1 matches the browser frame. */
    glowSize?: number;
}) {
    return (
        <BorderBeam
            size="md"
            colorVariant="colorful"
            theme="dark"
            borderRadius={radius}
            glowSize={glowSize}
            className={`inset-squircle-glow block w-full ${className}`}
            style={squircle(radius)}
        >
            <div
                className={transparent ? "h-full overflow-hidden bg-transparent" : "h-full overflow-hidden bg-[#141418]"}
                style={squircle(radius)}
            >
                {children}
            </div>
        </BorderBeam>
    );
}

/** Empty frame while an image or clip is still being made. No label inside. */
export function GeneratingMediaFrame({ className = "" }: { className?: string }) {
    return (
        <div className={`my-2 w-full max-w-[360px] ${className}`} aria-busy="true" aria-label="Generating">
            <BorderGlow>
                <div className="h-[240px] w-full" />
            </BorderGlow>
        </div>
    );
}

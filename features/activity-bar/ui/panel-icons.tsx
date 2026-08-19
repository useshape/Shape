"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** Left primary sidebar toggle (fills left strip when active). */
export function AnimatedSidebarIcon({ active, size = 16 }: { active?: boolean; size?: number }) {
    const uid = useId().replace(/:/g, "");
    const root = `si-${uid}`;
    const clipId = `${root}-clip`;

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            className={cn(root, "shape-icon", active && "is-active")}
            style={{ shapeRendering: "geometricPrecision" }}
        >
            <defs>
                <style>{`
          .${root} { cursor: pointer; }
          .${root} .outer-frame,
          .${root} .divider-line {
            fill: none;
            stroke: currentColor;
            stroke-width: 1.75;
            stroke-linecap: round;
            stroke-linejoin: round;
            vector-effect: non-scaling-stroke;
          }
          .${root} .solid-sidebar {
            fill: currentColor;
            width: 0px;
            transition: width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          }
          .${root}:hover .solid-sidebar,
          .${root}.is-active .solid-sidebar {
            width: 6px;
          }
        `}</style>
                <clipPath id={clipId}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </clipPath>
            </defs>
            <rect className="solid-sidebar" x="3" y="3" height="18" clipPath={`url(#${clipId})`} />
            <rect className="outer-frame" x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line className="divider-line" x1="9" y1="4" x2="9" y2="20" />
        </svg>
    );
}

/** Right secondary sidebar / AI chat toggle (mirrored). */
export function AnimatedSecondarySidebarIcon({
    active,
    size = 16,
}: {
    active?: boolean;
    size?: number;
}) {
    const uid = useId().replace(/:/g, "");
    const root = `ssi-${uid}`;
    const clipId = `${root}-clip`;

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            className={cn(root, "shape-icon", active && "is-active")}
            style={{ transform: "scaleX(-1)", shapeRendering: "geometricPrecision" }}
        >
            <defs>
                <style>{`
          .${root} { cursor: pointer; }
          .${root} .outer-frame,
          .${root} .divider-line {
            fill: none;
            stroke: currentColor;
            stroke-width: 1.75;
            stroke-linecap: round;
            stroke-linejoin: round;
            vector-effect: non-scaling-stroke;
          }
          .${root} .solid-sidebar {
            fill: currentColor;
            width: 0px;
            transition: width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          }
          .${root}:hover .solid-sidebar,
          .${root}.is-active .solid-sidebar {
            width: 6px;
          }
        `}</style>
                <clipPath id={clipId}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </clipPath>
            </defs>
            <rect className="solid-sidebar" x="3" y="3" height="18" clipPath={`url(#${clipId})`} />
            <rect className="outer-frame" x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line className="divider-line" x1="9" y1="4" x2="9" y2="20" />
        </svg>
    );
}

/** Bottom panel / terminal toggle (fills bottom strip when active). */
export function AnimatedPanelIcon({ active, size = 16 }: { active?: boolean; size?: number }) {
    const uid = useId().replace(/:/g, "");
    const root = `pi-${uid}`;
    const clipId = `${root}-clip`;

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            className={cn(root, "shape-icon", active && "is-active")}
            style={{ shapeRendering: "geometricPrecision" }}
        >
            <defs>
                <style>{`
          .${root} { cursor: pointer; }
          .${root} .outer-frame,
          .${root} .divider-line {
            fill: none;
            stroke: currentColor;
            stroke-width: 1.75;
            stroke-linecap: round;
            stroke-linejoin: round;
            vector-effect: non-scaling-stroke;
          }
          .${root} .solid-panel {
            fill: currentColor;
            y: 21px;
            height: 0px;
            transition: y 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          }
          .${root}:hover .solid-panel,
          .${root}.is-active .solid-panel {
            y: 15px;
            height: 6px;
          }
        `}</style>
                <clipPath id={clipId}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </clipPath>
            </defs>
            <rect className="solid-panel" x="3" width="18" clipPath={`url(#${clipId})`} />
            <rect className="outer-frame" x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line className="divider-line" x1="4" y1="15" x2="20" y2="15" />
        </svg>
    );
}

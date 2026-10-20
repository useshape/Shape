"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Frost face. Same eyes and pointer tracking as the frost cloud.
 * The body can be a circle, square, triangle, or cloud.
 * https://www.affectui.com/illustrations/frost-cloud
 */

const EYES = { y: 96, w: 28, h: 44, left: 86, right: 126 };
const CX = 120;
const CY = 120;

const GLANCES = [
    { x: 0, y: 0 },
    { x: -1, y: 0.05 },
    { x: 1, y: -0.05 },
    { x: 0, y: 0 },
    { x: 0.65, y: -0.55 },
    { x: -0.7, y: 0.35 },
];

const about = (x: number, y: number, t: string) => `translate(${x} ${y}) ${t} translate(${-x} ${-y})`;

export type FrostShape = "circle" | "square" | "triangle" | "cloud";

const CLOUD =
    "M48 150c-22 0-28-32-4-42-8-32 22-52 48-40 12-28 58-32 74-4 32-8 52 22 40 46 28 8 22 42-8 46-4 28-48 36-70 16-22 22-62 16-80-22z";

function mixHex(hex: string, toward: string, amount: number): string {
    const read = (value: string) => {
        const raw = value.replace("#", "");
        const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
        return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16));
    };
    const from = read(hex);
    const to = read(toward);
    const mixed = from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount));
    return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function FrostBody({ shape, fill }: { shape: FrostShape; fill: string }) {
    if (shape === "square") return <rect x="18" y="18" width="204" height="204" rx="44" fill={fill} />;
    if (shape === "triangle") return <polygon points="120,14 228,220 12,220" fill={fill} />;
    if (shape === "cloud") return <path d={CLOUD} fill={fill} />;
    return <circle cx={CX} cy={CY} r="108" fill={fill} />;
}

export function FrostMark({
    size = 28,
    className,
    live = false,
    followPointer = true,
    color = "blue",
    tint,
    shape = "circle",
    label = "Shape",
}: {
    size?: number;
    className?: string;
    live?: boolean;
    followPointer?: boolean;
    color?: "blue" | "orange";
    /** Body color. Keeps the face; overrides the blue and orange presets. */
    tint?: string;
    shape?: FrostShape;
    label?: string;
}) {
    const raw = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const id = (name: string) => `fm${raw}-${name}`;
    const root = useRef<HTMLSpanElement>(null);
    const turnRef = useRef<SVGGElement>(null);
    const eyesRef = useRef<SVGGElement>(null);
    const leftEye = useRef<SVGGElement>(null);
    const rightEye = useRef<SVGGElement>(null);

    useEffect(() => {
        const el = root.current;
        if (!el || !live) return;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const look = { x: 0, y: 0, vx: 0, vy: 0 };
        const target = { x: 0, y: 0 };
        const squish = { p: 0, v: 0 };
        let pointer = false;
        let nextGlance = 1.2;
        let nextBlink = 1.8;
        let blinkAt = -1;
        let blinkTwice = false;
        let winkAt = -1;
        let frame = 0;
        let last = 0;
        let time = 0;

        const blinkScale = (since: number, length = 0.16) =>
            since < 0 || since > length ? 1 : 1 - 0.9 * Math.sin((since / length) * Math.PI);

        const draw = () => {
            const breathe = still ? 0 : Math.sin(time * 1.1) * 0.012;
            const sy = 1 + breathe - squish.p * 0.08;
            const sx = 1 - breathe + squish.p * 0.06;
            turnRef.current?.setAttribute(
                "transform",
                `translate(${(look.x * 3).toFixed(2)} ${(look.y * 2).toFixed(2)}) ${about(CX, CY, `rotate(${(look.x * 2).toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})`)}`,
            );
            eyesRef.current?.setAttribute(
                "transform",
                `translate(${(look.x * 10).toFixed(2)} ${(look.y * 6).toFixed(2)})`,
            );
            const both = blinkAt < 0 ? 1 : Math.min(blinkScale(time - blinkAt), blinkTwice ? blinkScale(time - blinkAt - 0.26) : 1);
            const wink = blinkScale(time - winkAt, 0.34);
            const eyeY = EYES.y + EYES.h / 2;
            leftEye.current?.setAttribute("transform", about(EYES.left + EYES.w / 2, eyeY, `scale(1 ${both.toFixed(3)})`));
            rightEye.current?.setAttribute("transform", about(EYES.right + EYES.w / 2, eyeY, `scale(1 ${Math.min(both, wink).toFixed(3)})`));
        };

        const tick = (now: number) => {
            const dt = Math.min(0.05, (now - (last || now)) / 1000);
            last = now;
            time += dt;

            if (!pointer && time > nextGlance) {
                const g = GLANCES[Math.floor(Math.random() * GLANCES.length)]!;
                target.x = g.x;
                target.y = g.y;
                nextGlance = time + 1.4 + Math.random() * 2.2;
            }
            if (time > nextBlink) {
                blinkAt = time;
                blinkTwice = Math.random() < 0.25;
                nextBlink = time + 2.4 + Math.random() * 3;
            }

            look.vx += ((target.x - look.x) * 70 - look.vx * 13) * dt;
            look.vy += ((target.y - look.y) * 70 - look.vy * 13) * dt;
            look.x += look.vx * dt;
            look.y += look.vy * dt;
            squish.v += (-squish.p * 220 - squish.v * 9) * dt;
            squish.p += squish.v * dt;

            draw();
            frame = requestAnimationFrame(tick);
        };

        const start = () => {
            if (frame || still) return;
            last = 0;
            frame = requestAnimationFrame(tick);
        };
        const stop = () => {
            cancelAnimationFrame(frame);
            frame = 0;
        };

        const io = new IntersectionObserver(([entry]) => (entry?.isIntersecting ? start() : stop()));
        io.observe(el);

        const onMove = (event: PointerEvent) => {
            if (!followPointer) return;
            const rect = el.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return;
            pointer = true;
            target.x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2.4));
            target.y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2.4));
        };
        const onLeave = () => {
            pointer = false;
            target.x = 0;
            target.y = 0;
            nextGlance = time + 0.4;
        };
        const onDown = () => {
            squish.p = 0.9;
            squish.v = 0;
            winkAt = time + 0.12;
            if (still) {
                start();
                window.setTimeout(stop, 1200);
            }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("blur", onLeave);
        el.addEventListener("pointerdown", onDown);
        draw();

        return () => {
            stop();
            io.disconnect();
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("blur", onLeave);
            el.removeEventListener("pointerdown", onDown);
        };
    }, [followPointer, live]);

    const eye = (x: number, ref: typeof leftEye) => (
        <g ref={ref}>
            <rect x={x} y={EYES.y} width={EYES.w} height={EYES.h} rx={EYES.w / 2} fill={`url(#${id("hole")})`} />
        </g>
    );

    return (
        <span
            ref={root}
            className={cn("ui-fm inline-flex shrink-0", className)}
            data-color={color}
            style={{
                width: size,
                height: size,
                ...(tint
                    ? {
                        ["--ui-fm-top" as string]: tint,
                        ["--ui-fm-bottom" as string]: mixHex(tint, "#ffffff", 0.32),
                        ["--ui-fm-light" as string]: "rgba(255,255,255,0.42)",
                        ["--ui-fm-hole-1" as string]: mixHex(tint, "#000000", 0.58),
                        ["--ui-fm-hole-2" as string]: mixHex(tint, "#000000", 0.34),
                    }
                    : null),
            }}
            role="img"
            aria-label={label}
        >
            <svg viewBox="0 0 240 240" width={size} height={size} aria-hidden>
                <defs>
                    <linearGradient id={id("sky")} x1="0" y1="12" x2="0" y2="228" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="var(--ui-fm-top)" />
                        <stop offset="1" stopColor="var(--ui-fm-bottom)" />
                    </linearGradient>
                    <linearGradient id={id("hole")} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="var(--ui-fm-hole-1)" />
                        <stop offset="1" stopColor="var(--ui-fm-hole-2)" />
                    </linearGradient>
                    <clipPath id={id("disc")}>
                        <FrostBody shape={shape} fill="#000" />
                    </clipPath>
                </defs>
                <g ref={turnRef} clipPath={`url(#${id("disc")})`}>
                    <FrostBody shape={shape} fill={`url(#${id("sky")})`} />
                    <g ref={eyesRef}>
                        {eye(EYES.left, leftEye)}
                        {eye(EYES.right, rightEye)}
                    </g>
                </g>
            </svg>
        </span>
    );
}

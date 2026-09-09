"use client";

import { ShapeWindow } from "@/components/demo/window";
import type { DemoChatId } from "@/components/demo/sidebar";
import type { WorkspaceTabId } from "@/components/demo/panel";
import { cn } from "@/lib/utils";

const FRAME_W = 1280;
const FRAME_H = 800;

export function OnboardingInset({
    chat = "review",
    workspace = false,
    sidebar = true,
    workspaceTab = "changes",
    tour = false,
    playDemo = false,
    phone = false,
    x = 48,
    y = 0,
    w,
    h = 650,
    className,
}: {
    chat?: DemoChatId;
    workspace?: boolean;
    sidebar?: boolean;
    workspaceTab?: WorkspaceTabId;
    tour?: boolean;
    playDemo?: boolean;
    phone?: boolean;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    className?: string;
}) {
    const width = w ?? (phone ? 390 : FRAME_W);
    const height = h ?? (phone ? 720 : FRAME_H);

    return (
        <div className={cn("relative h-full min-h-0 overflow-hidden rounded-l-lg", className)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="/images/hero/scene.webp"
                alt=""
                className="absolute inset-0 size-full object-cover"
            />
            <div
                className="absolute overflow-hidden rounded-xl border border-border-subtle shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
                style={{
                    width,
                    height,
                    left: x,
                    top: "50%",
                    transform: `translateY(calc(-50% + ${y}px))`,
                }}
            >
                <ShapeWindow
                    tour={tour}
                    playDemo={playDemo}
                    initialChat={chat}
                    workspace={workspace}
                    sidebar={sidebar}
                    workspaceTab={workspaceTab}
                />
            </div>
        </div>
    );
}

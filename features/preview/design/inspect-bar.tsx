"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RiSpace } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { commands } from "@/lib/backend";
import { useProjectState } from "@/lib/backend";
import { cn } from "@/lib/utils";
import {
    DESIGN_BRIDGE_SCRIPT,
    type DesignElementSnapshot,
} from "./bridge";
import { patchJsx } from "./jsx-source";
import { isUserSourcePath } from "./library";

type Tab = "radius" | "padding" | "gap";

function parsePx(value: string | undefined): number {
    if (!value) return 0;
    const first = value.split(/\s+/)[0] ?? value;
    const n = Number.parseFloat(first);
    return Number.isFinite(n) ? Math.round(n) : 0;
}

function joinProjectPath(root: string, relative: string) {
    const separator = root.includes("\\") ? "\\" : "/";
    return `${root.replace(/[/\\]+$/, "")}${separator}${relative.replace(/[/\\]/g, separator)}`;
}

function IcoPath({ d }: { d: string }) {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d={d} />
        </svg>
    );
}

export function DesignInspectOverlay({
    iframeRef,
    enabled,
    onToggle,
}: {
    iframeRef: React.RefObject<HTMLIFrameElement | null>;
    enabled: boolean;
    onToggle: () => void;
}) {
    const { project_path } = useProjectState();
    const [selected, setSelected] = useState<DesignElementSnapshot | null>(null);
    const [tab, setTab] = useState<Tab>("radius");
    const [radius, setRadius] = useState(8);
    const [padding, setPadding] = useState(12);
    const [gap, setGap] = useState(8);
    const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!enabled) {
            setSelected(null);
            iframeRef.current?.contentWindow?.postMessage(
                { type: "shape-design-set-mode", mode: "normal", projectRoot: project_path },
                "*",
            );
            return;
        }
        void commands.registerDesignBridge(DESIGN_BRIDGE_SCRIPT).then(() => {
            iframeRef.current?.contentWindow?.postMessage(
                { type: "shape-design-set-mode", mode: "select", projectRoot: project_path },
                "*",
            );
        });
    }, [enabled, iframeRef, project_path]);

    useEffect(() => {
        if (!enabled) return;
        const onMessage = (event: MessageEvent) => {
            const data = event.data;
            if (!data || typeof data !== "object") return;
            if (data.type === "shape-design-ready") {
                iframeRef.current?.contentWindow?.postMessage(
                    { type: "shape-design-set-mode", mode: "select", projectRoot: project_path },
                    "*",
                );
                return;
            }
            if (data.type !== "shape-design-selection") return;
            const el = data.element as DesignElementSnapshot | null;
            setSelected(el);
            if (el?.styles) {
                setRadius(parsePx(el.styles.borderRadius || el.styles.borderTopLeftRadius));
                setPadding(parsePx(el.styles.padding || el.styles.paddingTop));
                setGap(parsePx(el.styles.gap || el.styles.rowGap));
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [enabled, iframeRef, project_path]);

    const apply = useCallback(
        (styles: Record<string, string>) => {
            const key = selected?.key;
            if (!key) return;
            iframeRef.current?.contentWindow?.postMessage(
                { type: "shape-design-apply-preview", styles, key },
                "*",
            );
            if (persistTimer.current) clearTimeout(persistTimer.current);
            persistTimer.current = setTimeout(() => {
                void persistStyles(project_path, selected, styles);
            }, 420);
        },
        [iframeRef, project_path, selected],
    );

    if (!enabled || !selected) return null;

    const iframe = iframeRef.current;
    const frame = iframe?.getBoundingClientRect();
    const rect = selected.rect;
    const top = frame ? rect.y + rect.height + 8 : 8;
    const left = frame ? Math.max(8, rect.x + rect.width / 2 - 160) : 8;

    return (
        <div
            className="pointer-events-auto absolute z-20"
            style={{ top, left, width: "min(340px, calc(100% - 16px))" }}
        >
            <div className="flex items-center gap-1 rounded-full border border-border-subtle bg-surface-1 px-1.5 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
                <button
                    type="button"
                    onClick={onToggle}
                    className="mr-0.5 flex size-7 items-center justify-center rounded-full text-text-muted hover:bg-panel-hover hover:text-text-primary"
                    aria-label="Exit design mode"
                >
                    ←
                </button>
                <TabBtn active={tab === "radius"} onClick={() => setTab("radius")} label="Radius">
                    <IcoPath d="M4 20V10a6 6 0 0 1 6-6h10" />
                </TabBtn>
                <TabBtn active={tab === "padding"} onClick={() => setTab("padding")} label="Padding">
                    <Icon icon={RiSpace} size={ICON_SIZE_SM} />
                </TabBtn>
                <TabBtn active={tab === "gap"} onClick={() => setTab("gap")} label="Gap">
                    <IcoPath d="M8 6v12M16 6v12" />
                </TabBtn>
                <div className="mx-1 h-4 w-px bg-border-subtle" />
                <input
                    type="range"
                    min={0}
                    max={tab === "padding" ? 48 : 32}
                    value={tab === "radius" ? radius : tab === "padding" ? padding : gap}
                    onChange={(e) => {
                        const n = Number(e.target.value);
                        if (tab === "radius") {
                            setRadius(n);
                            apply({ borderRadius: `${n}px` });
                        } else if (tab === "padding") {
                            setPadding(n);
                            apply({ padding: `${n}px` });
                        } else {
                            setGap(n);
                            apply({ gap: `${n}px` });
                        }
                    }}
                    className="h-1 w-24 accent-[var(--accent)]"
                />
            </div>
        </div>
    );
}

function TabBtn({
    active,
    onClick,
    label,
    children,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <Button
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-7 gap-1 rounded-full px-2.5 text-xs", active && "bg-surface-3")}
            onClick={onClick}
        >
            {children}
            {label}
        </Button>
    );
}

async function persistStyles(
    root: string | null | undefined,
    element: DesignElementSnapshot | null,
    styles: Record<string, string>,
) {
    if (!root || !element?.source?.fileName) return;
    if (!isUserSourcePath(element.source.fileName)) return;
    const abs = joinProjectPath(root, element.source.fileName);
    try {
        const before = await commands.readFileFromDisk(abs);
        const after = patchJsx(
            before,
            {
                tag: element.tag,
                classes: element.classes,
                text: element.text || null,
                line: element.source.lineNumber,
                column: element.source.columnNumber,
            },
            { styles },
        );
        if (after === before) return;
        await commands.saveFile(abs, after);
        commands.primeFileCache(abs, after);
    } catch {
        /* live CSS still applied */
    }
}

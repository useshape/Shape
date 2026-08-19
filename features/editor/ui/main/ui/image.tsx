"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import DOMPurify from "dompurify";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { stripDiffPrefix } from "../hooks/use-image-loader";
import {
    DEFAULT_ADJUSTMENTS,
    buildImageFilter,
    type ImageAdjustments,
} from "./image-tools";
import {
    cloneAdjustments,
    dataUrlToBytes,
    renderRasterToPngDataUrl,
} from "../lib/image-edit-session";
import {
    buildPreviewFilterChain,
    buildSharpenKernel,
    sharpenFilterId,
    vignetteOverlayStyle,
} from "../lib/image-effects";

export type { ImageSessionActions } from "./image-tools";

const LOG = (...args: unknown[]) => console.info("[image-view]", ...args);

interface ImageViewProps {
    path: string;
    imageSrc: string | null;
    svgContent?: string | null;
    loadError?: string | null;
    zoom: number;
    onZoomChange: (zoom: number) => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
    handleWheel: (e: React.WheelEvent) => void;
}

export function ImageView({
    path,
    imageSrc,
    svgContent,
    loadError = null,
    zoom,
    onZoomChange,
    containerRef,
    handleWheel,
}: ImageViewProps) {
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
    const [adjustments, setAdjustments] = useState<ImageAdjustments>(() => ({ ...DEFAULT_ADJUSTMENTS }));
    const [historyVersion, setHistoryVersion] = useState(0);
    const [imgMeta, setImgMeta] = useState({ w: 0, h: 0, status: "idle" });
    const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
    const savingRef = useRef(false);

    const historyRef = useRef<ImageAdjustments[]>([{ ...DEFAULT_ADJUSTMENTS }]);
    const historyIndexRef = useRef(0);
    const baselineRef = useRef<ImageAdjustments>({ ...DEFAULT_ADJUSTMENTS });
    const sessionPathRef = useRef(path);

    const actualPath = stripDiffPrefix(path);
    const isSvg = actualPath.toLowerCase().endsWith(".svg");
    const rawSvg = svgContent ?? (imageSrc?.startsWith("data:image/svg+xml") ? decodeSvgDataUri(imageSrc) : null);
    const inlineSvg = useMemo(
        () => (rawSvg
            ? DOMPurify.sanitize(rawSvg, { USE_PROFILES: { svg: true, svgFilters: true } })
            : null),
        [rawSvg],
    );
    const rasterSrc = imageSrc;

    useEffect(() => {
        LOG("props", {
            path,
            actualPath,
            hasSrc: Boolean(rasterSrc),
            srcPreview: rasterSrc?.slice(0, 80) ?? null,
            hasSvg: Boolean(inlineSvg),
            loadError,
            zoom,
        });
    }, [path, actualPath, rasterSrc, inlineSvg, loadError, zoom]);

    const bumpHistory = useCallback(() => {
        setHistoryVersion((v) => v + 1);
    }, []);

    useEffect(() => {
        if (sessionPathRef.current === path) return;
        sessionPathRef.current = path;
        onZoomChange(1);
        const initial = { ...DEFAULT_ADJUSTMENTS };
        baselineRef.current = cloneAdjustments(initial);
        setAdjustments(initial);
        setPan({ x: 0, y: 0 });
        setImgMeta({ w: 0, h: 0, status: "idle" });
        historyRef.current = [initial];
        historyIndexRef.current = 0;
        setHistoryVersion((v) => v + 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- path-only reset
    }, [path]);

    const undo = useCallback(() => {
        if (historyIndexRef.current <= 0) return;
        historyIndexRef.current -= 1;
        setAdjustments(cloneAdjustments(historyRef.current[historyIndexRef.current]));
        bumpHistory();
    }, [bumpHistory]);

    const redo = useCallback(() => {
        if (historyIndexRef.current >= historyRef.current.length - 1) return;
        historyIndexRef.current += 1;
        setAdjustments(cloneAdjustments(historyRef.current[historyIndexRef.current]));
        bumpHistory();
    }, [bumpHistory]);

    const discard = useCallback(() => {
        const baseline = cloneAdjustments(baselineRef.current);
        setAdjustments(baseline);
        historyRef.current = [baseline];
        historyIndexRef.current = 0;
        bumpHistory();
    }, [bumpHistory]);

    const save = useCallback(async () => {
        if (savingRef.current) return;
        if (isSvg) {
            notify.info("Image", "SVG adjustments are preview-only and cannot be baked into the file.");
            return;
        }
        if (!rasterSrc) {
            notify.error("Image", "Image source is not ready.");
            return;
        }

        savingRef.current = true;
        try {
            const filterStyle = buildImageFilter(adjustments);
            const dataUrl = await renderRasterToPngDataUrl(rasterSrc, filterStyle, {
                sharpen: adjustments.sharpen,
                vignette: adjustments.vignette,
            });
            const bytes = dataUrlToBytes(dataUrl);
            await commands.saveFileBytes(actualPath, Array.from(bytes));
            baselineRef.current = cloneAdjustments(adjustments);
            historyRef.current = [cloneAdjustments(adjustments)];
            historyIndexRef.current = 0;
            notify.success("Image", "Saved changes.");
            bumpHistory();
        } catch (err) {
            notify.error("Image", err instanceof Error ? err.message : String(err));
        } finally {
            savingRef.current = false;
        }
    }, [actualPath, adjustments, bumpHistory, isSvg, rasterSrc]);

    const isDirty = useMemo(() => {
        return historyIndexRef.current > 0
            || JSON.stringify(adjustments) !== JSON.stringify(baselineRef.current);
    }, [adjustments, historyVersion]);

    const canUndo = historyIndexRef.current > 0;
    const canRedo = historyIndexRef.current < historyRef.current.length - 1;

    useEffect(() => {
        const onSaveRequest = () => {
            if (!isDirty) return;
            void save();
        };
        window.addEventListener("save-request", onSaveRequest);
        return () => window.removeEventListener("save-request", onSaveRequest);
    }, [isDirty, save]);

    const previewFilter = buildPreviewFilterChain(
        buildImageFilter(adjustments),
        adjustments.sharpen,
    );
    const vignetteStyle = vignetteOverlayStyle(adjustments.vignette);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        setIsDragging(true);
        dragRef.current = {
            x: e.clientX,
            y: e.clientY,
            panX: pan.x,
            panY: pan.y,
        };
    }, [pan.x, pan.y]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => {
            const { clientWidth: w, clientHeight: h } = el;
            setStageSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [containerRef]);

    useEffect(() => {
        if (!isDragging) return;
        const onMove = (e: MouseEvent) => {
            setPan({
                x: dragRef.current.panX + (e.clientX - dragRef.current.x),
                y: dragRef.current.panY + (e.clientY - dragRef.current.y),
            });
        };
        const onUp = () => setIsDragging(false);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [isDragging]);

    useEffect(() => {
        if (imgMeta.status === "idle") return;
        LOG("img meta", imgMeta);
    }, [imgMeta]);

    const fitStyle = stageSize.w > 0 && stageSize.h > 0
        ? { maxWidth: stageSize.w, maxHeight: stageSize.h }
        : { maxWidth: "100%" as const, maxHeight: "100%" as const };

    return (
        <div
            ref={containerRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-editor select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        >
            {adjustments.sharpen > 0 ? (
                <svg aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden">
                    <filter id={sharpenFilterId()} colorInterpolationFilters="sRGB">
                        <feConvolveMatrix
                            order="3"
                            kernelMatrix={buildSharpenKernel(adjustments.sharpen)}
                            preserveAlpha="true"
                        />
                    </filter>
                </svg>
            ) : null}

            {loadError ? (
                <p className="max-w-lg px-4 text-center text-sm text-error">
                    Could not load image
                    <br />
                    <span className="text-text-secondary">{loadError}</span>
                </p>
            ) : isSvg && inlineSvg ? (
                <div
                    className="pointer-events-none [&>svg]:block [&>svg]:h-auto [&>svg]:w-auto"
                    style={{
                        ...fitStyle,
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: "center center",
                        filter: previewFilter,
                    }}
                    dangerouslySetInnerHTML={{ __html: inlineSvg }}
                />
            ) : rasterSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    key={rasterSrc}
                    src={rasterSrc}
                    alt={actualPath}
                    onLoad={(e) => {
                        const img = e.currentTarget;
                        LOG("img onLoad", { w: img.naturalWidth, h: img.naturalHeight, src: rasterSrc.slice(0, 80) });
                        setImgMeta({ w: img.naturalWidth, h: img.naturalHeight, status: "loaded" });
                    }}
                    onError={(e) => {
                        LOG("img onError", rasterSrc.slice(0, 120));
                        setImgMeta({ w: 0, h: 0, status: "error" });
                        e.currentTarget.alt = `Failed to decode: ${actualPath}`;
                    }}
                    className="pointer-events-none block object-contain"
                    style={{
                        ...fitStyle,
                        width: "auto",
                        height: "auto",
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: "center center",
                        filter: previewFilter,
                        ...vignetteStyle,
                    }}
                    draggable={false}
                />
            ) : (
                <p className="text-sm text-text-muted">Loading image…</p>
            )}
        </div>
    );
}

function decodeSvgDataUri(dataUri: string): string | null {
    const utf8Prefix = "data:image/svg+xml;charset=utf-8,";
    const base64Prefix = "data:image/svg+xml;base64,";

    if (dataUri.startsWith(utf8Prefix)) {
        try {
            return decodeURIComponent(dataUri.slice(utf8Prefix.length));
        } catch {
            return null;
        }
    }

    if (dataUri.startsWith(base64Prefix)) {
        try {
            return atob(dataUri.slice(base64Prefix.length));
        } catch {
            return null;
        }
    }

    const plainPrefix = "data:image/svg+xml,";
    if (dataUri.startsWith(plainPrefix)) {
        try {
            return decodeURIComponent(dataUri.slice(plainPrefix.length));
        } catch {
            return dataUri.slice(plainPrefix.length);
        }
    }

    return null;
}

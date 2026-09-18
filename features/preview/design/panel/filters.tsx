"use client";

import {
    RiContrastDropLine,
    RiEyeLine,
    RiEyeOffLine,
    RiFilterLine,
    RiSubtractLine,
} from "@remixicon/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    defaultFilterAmount,
    identityFilterAmount,
    serializeCssFunctions,
    type CssFunction,
} from "../css";
import { CONTROL, Field, IconButton, SelectField } from "./field";
import { PanelSection } from "./section";
import type { Styles } from "./types";

export const FILTER_OPTIONS = [
    ["blur", "Blur"],
    ["brightness", "Brightness"],
    ["contrast", "Contrast"],
    ["grayscale", "Grayscale"],
    ["hue-rotate", "Hue rotate"],
    ["invert", "Invert"],
    ["saturate", "Saturation"],
    ["sepia", "Sepia"],
] as const;

export function FilterStack({
    property,
    items,
    onPreview,
    onCommit,
}: {
    property: "filter" | "backdrop-filter";
    items: CssFunction[];
    onPreview: (styles: Styles) => void;
    onCommit: (styles: Styles) => void;
}) {
    const write = (next: CssFunction[], commit = true) => {
        const css = serializeCssFunctions(next);
        onPreview({ [property]: css });
        if (commit) onCommit({ [property]: css });
    };
    return (
        <>
            {items.map((item, index) => {
                const hidden = item.amount === identityFilterAmount(item.type);
                return (
                    <div key={`${property}-${index}-${item.type}`} className="flex h-6 items-stretch gap-1">
                        <SelectField
                            icon={RiFilterLine}
                            value={item.type}
                            options={[...FILTER_OPTIONS]}
                            onChange={(type) => {
                                const next = items.slice();
                                next[index] = { type, amount: defaultFilterAmount(type) };
                                write(next);
                            }}
                        />
                        <Field
                            icon={RiContrastDropLine}
                            value={item.amount}
                            property={property}
                            mapValue={(amount) =>
                                serializeCssFunctions(
                                    items.map((current, currentIndex) =>
                                        currentIndex === index ? { ...current, amount } : current,
                                    ),
                                )
                            }
                            onPreview={onPreview}
                            onCommit={onCommit}
                        />
                        <IconButton
                            label={hidden ? "Show filter" : "Hide filter"}
                            icon={hidden ? RiEyeOffLine : RiEyeLine}
                            active={!hidden}
                            onClick={() => {
                                const next = items.slice();
                                next[index] = {
                                    ...item,
                                    amount: hidden
                                        ? defaultFilterAmount(item.type)
                                        : identityFilterAmount(item.type),
                                };
                                write(next);
                            }}
                        />
                        <IconButton
                            label="Remove filter"
                            icon={RiSubtractLine}
                            onClick={() => write(items.filter((_, currentIndex) => currentIndex !== index))}
                        />
                    </div>
                );
            })}
        </>
    );
}

export function ExportBlock({
    onExport,
}: {
    onExport: (scale: number, format: string) => Promise<void>;
}) {
    const [scale, setScale] = useState("2");
    const [format, setFormat] = useState("webp");
    const [busy, setBusy] = useState(false);
    return (
        <PanelSection title="Export">
            <div className="flex h-6 items-stretch gap-1">
                <SelectField
                    value={`${scale}x`}
                    options={["1x", "2x", "3x"]}
                    onChange={(value) => setScale(value.replace("x", ""))}
                />
                <SelectField
                    value={format}
                    options={[
                        ["png", "PNG"],
                        ["jpg", "JPG"],
                        ["avif", "AVIF"],
                        ["webp", "WebP"],
                        ["pdf", "PDF"],
                    ]}
                    onChange={setFormat}
                />
            </div>
            <Button
                variant="secondary"
                size="xs"
                loading={busy}
                className={cn(CONTROL, "w-full")}
                onClick={() => {
                    setBusy(true);
                    void onExport(Number(scale) || 2, format).finally(() => setBusy(false));
                }}
            >
                Export
            </Button>
        </PanelSection>
    );
}

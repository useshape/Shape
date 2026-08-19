"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { getDesignBridge, useDesignModeStore } from "../../design-mode/store";
import {
    DESIGN_EXPORT_FORMAT_OPTIONS,
    saveDesignExport,
    type DesignExportFormat,
    type DesignExportPayload,
} from "../../design-mode/export-file";
import { DESIGN_EXPORT_SCALES } from "./panel-layout";
import { AddHeader, CompactSelect, IconBtn, Section } from "./fields";

type ExportPreset = {
    id: string;
    format: DesignExportFormat;
    scale: (typeof DESIGN_EXPORT_SCALES)[number];
};

function newPreset(): ExportPreset {
    return { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, format: "png", scale: 1 };
}

export function ExportSection() {
    const { selected } = useDesignModeStore();
    const [presets, setPresets] = React.useState<ExportPreset[]>([]);
    const [busyId, setBusyId] = React.useState<string | null>(null);

    const runExport = async (preset: ExportPreset) => {
        if (!selected) {
            const { notify } = await import("@/features/notifications");
            notify.error("Export", "Select an element in the preview first.");
            return;
        }
        const bridge = getDesignBridge();
        if (!bridge?.exportElement) {
            const { notify } = await import("@/features/notifications");
            notify.error("Export", "The preview is not ready to export. Reload the page and try again.");
            return;
        }
        setBusyId(preset.id);
        try {
            const payload = await Promise.race([
                bridge.exportElement(selected.id, {
                    format: preset.format,
                    scale: preset.scale,
                    selector: selected.selector,
                }),
                new Promise<never>((_, reject) =>
                    window.setTimeout(() => reject(new Error("Export timed out.")), 12000),
                ),
            ]);
            const name = (selected.label || selected.tag || "element").replace(/[^\w.-]+/g, "-");
            await saveDesignExport(payload as DesignExportPayload, `${name}-${preset.scale}x`);
        } catch (err) {
            const { notify } = await import("@/features/notifications");
            notify.error("Export failed", err instanceof Error ? err.message : String(err));
        } finally {
            setBusyId(null);
        }
    };

    if (!presets.length) {
        return <AddHeader title="Export" onAdd={() => setPresets([newPreset()])} />;
    }

    return (
        <Section
            title="Export"
            action={
                <IconBtn title="Add export" onClick={() => setPresets((list) => [...list, newPreset()])}>
                    <Icon name="add" size={14} />
                </IconBtn>
            }
        >
            {presets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-1">
                    <CompactSelect
                        title="Format"
                        value={preset.format}
                        options={DESIGN_EXPORT_FORMAT_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                        onChange={(v) =>
                            setPresets((list) =>
                                list.map((p) => (p.id === preset.id ? { ...p, format: v as DesignExportFormat } : p)),
                            )
                        }
                    />
                    <CompactSelect
                        title="Scale"
                        className="max-w-16 flex-none"
                        value={`${preset.scale}x`}
                        options={DESIGN_EXPORT_SCALES.map((n) => ({ value: `${n}x`, label: `${n}×` }))}
                        onChange={(v) =>
                            setPresets((list) =>
                                list.map((p) =>
                                    p.id === preset.id
                                        ? { ...p, scale: Number(v.replace("x", "")) as (typeof DESIGN_EXPORT_SCALES)[number] }
                                        : p,
                                ),
                            )
                        }
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 shrink-0 px-2"
                        disabled={busyId === preset.id || !selected}
                        title="Export this element only"
                        onClick={() => void runExport(preset)}
                    >
                        {busyId === preset.id ? "…" : "Export"}
                    </Button>
                    <IconBtn
                        title="Remove"
                        onClick={() => setPresets((list) => list.filter((p) => p.id !== preset.id))}
                    >
                        <Icon name="remove" size={13} />
                    </IconBtn>
                </div>
            ))}
        </Section>
    );
}

"use client";

import { useEffect, useState } from "react";
import { SettingSwitch } from "@/features/settings/ui/shared/controls";
import { Input } from "@/components/ui/input";
import type { DesignComponentSnapshot, DesignElementSnapshot } from "../bridge";
import { CONTROL } from "./field";
import { PanelSection } from "./section";

export type ComponentOptionPatch = {
    key: string;
    field: "label" | "href" | "open" | "alt" | "src";
    value: string | boolean;
};

function Row({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-text-muted">{label}</span>
            <div className="min-w-0 flex-1">{children}</div>
        </label>
    );
}

function OptionInput({
    value,
    placeholder,
    onCommit,
}: {
    value: string;
    placeholder?: string;
    onCommit: (next: string) => void;
}) {
    const [draft, setDraft] = useState(value);
    useEffect(() => {
        setDraft(value);
    }, [value]);
    return (
        <Input
            className={CONTROL}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
                if (draft !== value) onCommit(draft);
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
            }}
        />
    );
}

export function DesignComponentOptions({
    element,
    onPatch,
}: {
    element: DesignElementSnapshot;
    onPatch: (patch: ComponentOptionPatch) => void;
}) {
    const component: DesignComponentSnapshot | null = element.component;
    if (!component) return null;
    const isMenu = component.kind === "dropdown" || component.kind === "nav";
    const isLink = component.kind === "link" || component.kind === "button";
    const isImage = component.kind === "image";

    return (
        <PanelSection title={component.name} defaultOpen>
            {isMenu ? (
                <div className="flex items-center justify-between gap-3 py-1">
                    <span className="text-xs text-text-muted">Keep open</span>
                    <SettingSwitch
                        checked={component.open}
                        onChange={(open) => onPatch({ key: element.key, field: "open", value: open })}
                    />
                </div>
            ) : null}
            {isMenu ? (
                <Row label="Trigger">
                    <OptionInput
                        value={component.trigger}
                        onCommit={(value) => onPatch({ key: element.key, field: "label", value })}
                    />
                </Row>
            ) : null}
            {isLink ? (
                <>
                    <Row label="Label">
                        <OptionInput
                            value={component.label}
                            onCommit={(value) => onPatch({ key: element.key, field: "label", value })}
                        />
                    </Row>
                    <Row label="Link">
                        <OptionInput
                            value={component.href}
                            placeholder="/path or https://"
                            onCommit={(value) => onPatch({ key: element.key, field: "href", value })}
                        />
                    </Row>
                </>
            ) : null}
            {isImage ? (
                <>
                    <Row label="Alt">
                        <OptionInput
                            value={component.label}
                            onCommit={(value) => onPatch({ key: element.key, field: "alt", value })}
                        />
                    </Row>
                    <Row label="Src">
                        <OptionInput
                            value={component.href}
                            onCommit={(value) => onPatch({ key: element.key, field: "src", value })}
                        />
                    </Row>
                </>
            ) : null}
            {isMenu && component.items.length > 0 ? (
                <div className="space-y-3 pt-2">
                    <p className="text-xs font-medium text-text-primary">Items</p>
                    {component.items.map((item, index) => (
                        <div
                            key={item.key}
                            className="space-y-1.5 rounded-md border border-border-subtle p-2"
                        >
                            <p className="text-2xs text-text-muted">Item {index + 1}</p>
                            <Row label="Label">
                                <OptionInput
                                    value={item.label}
                                    onCommit={(value) =>
                                        onPatch({ key: item.key, field: "label", value })
                                    }
                                />
                            </Row>
                            <Row label="Link">
                                <OptionInput
                                    value={item.href}
                                    placeholder="/path or https://"
                                    onCommit={(value) =>
                                        onPatch({ key: item.key, field: "href", value })
                                    }
                                />
                            </Row>
                        </div>
                    ))}
                </div>
            ) : isMenu ? (
                <p className="pt-1 text-xs text-text-muted">
                    Pin the menu open to list its links, or select an item in Layers.
                </p>
            ) : null}
        </PanelSection>
    );
}

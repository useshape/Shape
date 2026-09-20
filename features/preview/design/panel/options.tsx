"use client";

import { useEffect, useState } from "react";
import { RiArrowDownSLine, RiCodeLine, RiMoreLine } from "@remixicon/react";
import { SettingSwitch } from "@/features/settings/ui/shared/controls";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import type { DesignComponentProperty, DesignElementSnapshot } from "../bridge";
import { CONTROL, SelectField } from "./field";
import { PanelSection } from "./section";

export type ComponentOptionPatch = {
    key: string;
    field: "label" | "href" | "open" | "alt" | "src" | "text" | "attr";
    value: string | boolean;
    attr?: string;
};

function Row({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="flex min-h-8 items-center gap-2">
            <span className="w-18 shrink-0 text-xs text-text-muted">{label}</span>
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

function PropertyRow({
    property,
    onCommit,
}: {
    property: DesignComponentProperty;
    onCommit: (value: string) => void;
}) {
    if (property.kind === "boolean") {
        return (
            <div className="flex min-h-8 items-center justify-between gap-3">
                <span className="text-xs text-text-primary">{property.name}</span>
                <SettingSwitch
                    checked={property.value !== "false"}
                    onChange={(on) => onCommit(on ? "true" : "false")}
                />
            </div>
        );
    }
    if (property.kind === "variant" || property.kind === "instance") {
        const options = property.options?.length ? property.options : [property.value];
        return (
            <Row label={property.name}>
                <SelectField
                    value={property.value}
                    options={options}
                    onChange={onCommit}
                />
            </Row>
        );
    }
    return (
        <Row label={property.name}>
            <OptionInput value={property.value} onCommit={onCommit} />
        </Row>
    );
}

export function DesignComponentOptions({
    element,
    onPatch,
    onOpenSource,
}: {
    element: DesignElementSnapshot;
    onPatch: (patch: ComponentOptionPatch) => void;
    onOpenSource?: () => void;
}) {
    const component = element.component;
    if (!component?.properties.length) return null;
    const variants = component.properties.filter((property) => property.kind === "variant");
    const rest = component.properties.filter((property) => property.kind !== "variant");

    return (
        <PanelSection
            title={component.name}
            defaultOpen
            action={
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Instance actions" className="size-7">
                            <Icon icon={RiMoreLine} size={ICON_SIZE_SM} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                        <DropdownMenuItem disabled={!onOpenSource} onClick={onOpenSource}>
                            <Icon icon={RiCodeLine} size={ICON_SIZE_SM} />
                            Go to main component
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            }
        >
            <Row label="Instance">
                <button
                    type="button"
                    className={`${CONTROL} flex w-full items-center justify-between px-2 text-left text-xs text-text-secondary`}
                    disabled
                >
                    <span className="truncate">{component.sourceLabel}</span>
                    <Icon icon={RiArrowDownSLine} size={12} className="opacity-40" />
                </button>
            </Row>
            {variants.map((property) => (
                <PropertyRow
                    key={`${property.name}:${property.attr}`}
                    property={property}
                    onCommit={(value) =>
                        onPatch({
                            key: element.key,
                            field: "attr",
                            attr: property.attr,
                            value,
                        })
                    }
                />
            ))}
            {rest.map((property) => (
                <PropertyRow
                    key={`${property.name}:${property.attr}`}
                    property={property}
                    onCommit={(value) => {
                        if (!property.attr) {
                            onPatch({ key: element.key, field: "text", value });
                            return;
                        }
                        onPatch({
                            key: element.key,
                            field: "attr",
                            attr: property.attr,
                            value,
                        });
                    }}
                />
            ))}
        </PanelSection>
    );
}

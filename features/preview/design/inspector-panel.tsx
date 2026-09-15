"use client";

import { RiDeleteBinLine, RiMoreLine, RiStackLine } from "@remixicon/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { DisclosureDropdown } from "@/components/ui/disclosure";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll";
import { Slider } from "@/components/ui/slider";
import { SettingSelect, SettingSwitch } from "@/features/settings/ui/shared/controls";
import { SIDEBAR_PANEL_HEADER_HEIGHT_CLASS } from "@/features/panels/ui/sidebar-panel-header";
import { cn } from "@/lib/utils";
import type { DesignOutlineId } from "./outline-panel";

const HEIGHTS = [
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
    { value: "adapt", label: "Adapt to image" },
] as const;

const ANIMATIONS = [
    { value: "none", label: "None" },
    { value: "fade", label: "Fade" },
    { value: "slide", label: "Slide" },
] as const;

const POSITIONS = [
    { value: "top-left", label: "Top Left" },
    { value: "top-center", label: "Top Center" },
    { value: "top-right", label: "Top Right" },
    { value: "middle-left", label: "Middle Left" },
    { value: "middle-center", label: "Middle Center" },
    { value: "middle-right", label: "Middle Right" },
    { value: "bottom-left", label: "Bottom Left" },
    { value: "bottom-center", label: "Bottom Center" },
    { value: "bottom-right", label: "Bottom Right" },
] as const;

const SCHEMES = [
    { value: "scheme-1", label: "Scheme 1" },
    { value: "scheme-2", label: "Scheme 2" },
    { value: "scheme-3", label: "Scheme 3" },
] as const;

type Align = "left" | "center" | "right";

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-3 py-2">
            <span className="shrink-0 text-sm text-text-primary">{label}</span>
            <div className="min-w-0 flex-1 flex justify-end">{children}</div>
        </div>
    );
}

function ImageSlot({ label }: { label: string }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2">
            <span className="shrink-0 text-sm text-text-primary">{label}</span>
            <div className="flex w-36 flex-col items-center gap-1.5 rounded-lg border border-dashed border-border-subtle px-2 py-3">
                <Button variant="secondary" size="xs" className="gap-1.5">
                    Select
                    <Icon icon={RiStackLine} size={ICON_SIZE_SM} className="text-text-muted" />
                </Button>
                <button
                    type="button"
                    className="text-xs text-accent hover:text-accent-hover"
                >
                    Explore free images
                </button>
            </div>
        </div>
    );
}

function AlignGroup({
    value,
    onChange,
}: {
    value: Align;
    onChange: (v: Align) => void;
}) {
    const opts: { id: Align; label: string }[] = [
        { id: "left", label: "Left" },
        { id: "center", label: "Center" },
        { id: "right", label: "Right" },
    ];
    return (
        <ButtonGroup>
            {opts.map((opt) => (
                <Button
                    key={opt.id}
                    type="button"
                    variant={value === opt.id ? "secondary" : "ghost"}
                    size="xs"
                    aria-pressed={value === opt.id}
                    onClick={() => onChange(opt.id)}
                    className="min-w-12"
                >
                    {opt.label}
                </Button>
            ))}
        </ButtonGroup>
    );
}

function ImageBannerInspector() {
    const [opacity, setOpacity] = useState(40);
    const [height, setHeight] = useState<(typeof HEIGHTS)[number]["value"]>("large");
    const [animation, setAnimation] = useState<(typeof ANIMATIONS)[number]["value"]>("none");
    const [position, setPosition] = useState<(typeof POSITIONS)[number]["value"]>("bottom-center");
    const [align, setAlign] = useState<Align>("center");
    const [container, setContainer] = useState(false);
    const [scheme, setScheme] = useState<(typeof SCHEMES)[number]["value"]>("scheme-3");
    const [stack, setStack] = useState(false);
    const [mobileAlign, setMobileAlign] = useState<Align>("center");
    const [mobileContainer, setMobileContainer] = useState(false);

    return (
        <>
            <ImageSlot label="Image 1" />
            <ImageSlot label="Image 2" />

            <div className="flex items-center gap-3 py-2">
                <span className="shrink-0 text-sm text-text-primary">Overlay opacity</span>
                <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[opacity]}
                    onValueChange={(v) => setOpacity(v[0] ?? opacity)}
                    className="min-w-0 flex-1"
                />
                <span className="w-8 shrink-0 text-right text-sm tabular-nums text-text-secondary">
                    {opacity}
                </span>
                <span className="shrink-0 text-sm text-text-muted">%</span>
            </div>

            <Field label="Height">
                <SettingSelect
                    value={height}
                    options={[...HEIGHTS]}
                    onChange={setHeight}
                    className=" min-w-0 w-40"
                />
            </Field>
            <Field label="Animation">
                <SettingSelect
                    value={animation}
                    options={[...ANIMATIONS]}
                    onChange={setAnimation}
                    className="min-w-0 w-40"
                />
            </Field>

            <p className="pt-3 pb-1 text-sm font-medium text-text-primary">Content</p>
            <Field label="Position">
                <SettingSelect
                    value={position}
                    options={[...POSITIONS]}
                    onChange={setPosition}
                    className="min-w-0 w-40"
                />
            </Field>
            <Field label="Alignment">
                <AlignGroup value={align} onChange={setAlign} />
            </Field>
            <Field label="Container">
                <SettingSwitch checked={container} onChange={setContainer} />
            </Field>
            <Field label="Color scheme">
                <SettingSelect
                    value={scheme}
                    options={[...SCHEMES]}
                    onChange={setScheme}
                    className="min-w-0 w-40"
                />
            </Field>

            <p className="pt-3 pb-1 text-sm font-medium text-text-primary">Mobile layout</p>
            <Field label="Stack images">
                <SettingSwitch checked={stack} onChange={setStack} />
            </Field>
            <Field label="Alignment">
                <AlignGroup value={mobileAlign} onChange={setMobileAlign} />
            </Field>
            <Field label="Container">
                <SettingSwitch checked={mobileContainer} onChange={setMobileContainer} />
            </Field>
        </>
    );
}

const TITLES: Partial<Record<DesignOutlineId, string>> = {
    announcement: "Announcement bar",
    header: "Header",
    "image-banner": "Image banner",
    heading: "Heading",
    buttons: "Buttons",
    "featured-collection": "Featured collection",
    footer: "Footer",
};

export function DesignInspectorPanel({ selectedId }: { selectedId: DesignOutlineId }) {
    const title = TITLES[selectedId] ?? "Section";
    const showBanner = selectedId === "image-banner" || selectedId === "heading" || selectedId === "buttons";

    return (
        <aside className="flex h-full w-100 shrink-0 flex-col overflow-hidden border-l border-border bg-surface-3">
            <header className={cn("flex shrink-0 items-center gap-1 px-2 border-b border-border", SIDEBAR_PANEL_HEADER_HEIGHT_CLASS)}>
                <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-text-primary">
                    {showBanner ? "Image banner" : title}
                </span>
                <DisclosureDropdown
                    variant="ghost"
                    icon={RiMoreLine}
                    toggleText="More"
                    textSrOnly
                    align="end"
                    items={[
                        { text: "Duplicate" },
                        { text: "Hide" },
                    ]}
                />
            </header>
            <ScrollArea className="min-h-0 flex-1" fadeFrom="from-panel">
                <div className="px-3 pb-2">
                    {showBanner ? (
                        <ImageBannerInspector />
                    ) : (
                        <p className="py-6 text-sm text-text-muted">
                            Select a section on the left to edit its settings.
                        </p>
                    )}
                </div>
                <CollapsibleSection title="Theme Settings" storageKey="design-inspector-theme">
                    <p className="px-3 py-2 text-sm text-text-muted">Theme-wide colors, type, and layout.</p>
                </CollapsibleSection>
                <CollapsibleSection title="Custom CSS" storageKey="design-inspector-css">
                    <p className="px-3 py-2 text-sm text-text-muted">Section CSS overrides.</p>
                </CollapsibleSection>
            </ScrollArea>
            <div className="shrink-0 px-2 py-2">
                <Button
                    type="button"
                    variant="ghost"
                    category="tertiary"
                    size="sm"
                    className="w-full justify-start gap-1.5 text-error hover:bg-error/10 hover:text-error"
                >
                    <Icon icon={RiDeleteBinLine} size={ICON_SIZE_SM} />
                    Remove section
                </Button>
            </div>
        </aside>
    );
}

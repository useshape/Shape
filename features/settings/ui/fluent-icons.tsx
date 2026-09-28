"use client";

/**
 * Settings-only trial of Microsoft Fluent icons. Remix stays everywhere else.
 * To undo: delete this file and restore the Remix imports under features/settings.
 */
import "@fluentui/react-icons/headless/styles.css";

import type { CSSProperties, FC } from "react";
import { Add16Regular } from "@fluentui/react-icons/headless/svg/add";
import { Alert16Regular } from "@fluentui/react-icons/headless/svg/alert";
import { Apps16Regular } from "@fluentui/react-icons/headless/svg/apps";
import { ArrowDownload16Regular } from "@fluentui/react-icons/headless/svg/arrow-download";
import { ArrowLeft16Regular } from "@fluentui/react-icons/headless/svg/arrow-left";
import { ArrowUpload16Regular } from "@fluentui/react-icons/headless/svg/arrow-upload";
import { BranchFork16Regular } from "@fluentui/react-icons/headless/svg/branch-fork";
import { Bug16Regular } from "@fluentui/react-icons/headless/svg/bug";
import { ChevronDown16Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { ChevronLeft16Regular } from "@fluentui/react-icons/headless/svg/chevron-left";
import { ChevronRight16Regular } from "@fluentui/react-icons/headless/svg/chevron-right";
import { Code16Regular } from "@fluentui/react-icons/headless/svg/code";
import { Color16Regular } from "@fluentui/react-icons/headless/svg/color";
import { Delete16Regular } from "@fluentui/react-icons/headless/svg/delete";
import { DocumentText16Regular } from "@fluentui/react-icons/headless/svg/document-text";
import { Edit16Regular } from "@fluentui/react-icons/headless/svg/edit";
import { Flowchart16Regular } from "@fluentui/react-icons/headless/svg/flowchart";
import { Keyboard16Regular } from "@fluentui/react-icons/headless/svg/keyboard";
import { Layer20Regular } from "@fluentui/react-icons/headless/svg/layer";
import { Link16Regular } from "@fluentui/react-icons/headless/svg/link";
import { Mic16Regular } from "@fluentui/react-icons/headless/svg/mic";
import { MoreHorizontal16Regular } from "@fluentui/react-icons/headless/svg/more-horizontal";
import { Open16Regular } from "@fluentui/react-icons/headless/svg/open";
import { Person16Regular } from "@fluentui/react-icons/headless/svg/person";
import { Settings16Regular } from "@fluentui/react-icons/headless/svg/settings";
import { Shield16Regular } from "@fluentui/react-icons/headless/svg/shield";
import { Sparkle16Regular } from "@fluentui/react-icons/headless/svg/sparkle";
import { WindowConsole20Regular } from "@fluentui/react-icons/headless/svg/window-console";
import { cn } from "@/lib/utils";

export type SettingsGlyph = FC<{
    className?: string;
    style?: CSSProperties;
    "aria-hidden"?: boolean | "true" | "false";
}>;

export const settingsIcons = {
    person: Person16Regular,
    sparkle: Sparkle16Regular,
    document: DocumentText16Regular,
    flowchart: Flowchart16Regular,
    layer: Layer20Regular,
    apps: Apps16Regular,
    code: Code16Regular,
    color: Color16Regular,
    terminal: WindowConsole20Regular,
    mic: Mic16Regular,
    branch: BranchFork16Regular,
    keyboard: Keyboard16Regular,
    download: ArrowDownload16Regular,
    upload: ArrowUpload16Regular,
    alert: Alert16Regular,
    shield: Shield16Regular,
    bug: Bug16Regular,
    settings: Settings16Regular,
    chevronDown: ChevronDown16Regular,
    chevronLeft: ChevronLeft16Regular,
    chevronRight: ChevronRight16Regular,
    arrowLeft: ArrowLeft16Regular,
    add: Add16Regular,
    edit: Edit16Regular,
    delete: Delete16Regular,
    open: Open16Regular,
    link: Link16Regular,
    more: MoreHorizontal16Regular,
} satisfies Record<string, SettingsGlyph>;

export function FluentIcon({
    icon: Glyph,
    className,
    style,
}: {
    icon: SettingsGlyph;
    className?: string;
    style?: CSSProperties;
}) {
    return (
        <Glyph
            className={cn("shape-icon shrink-0", className)}
            style={style}
            aria-hidden
        />
    );
}

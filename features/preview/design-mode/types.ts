export type DesignLayerNode = {
    id: string;
    tag: string;
    label: string;
    hidden?: boolean;
    interactive?: boolean;
    children: DesignLayerNode[];
};

export type DesignStyleOriginKind =
    | "inline"
    | "class"
    | "module"
    | "stylesheet"
    | "utility"
    | "variable"
    | "inherited"
    | "computed";

export type DesignStyleOrigin = {
    kind: DesignStyleOriginKind;
    label: string;
    selector?: string;
    href?: string;
    media?: string;
    layer?: string;
    className?: string;
};

export type DesignPropertyInspect = {
    property: string;
    computed: string;
    authored: string;
    source: DesignStyleOrigin;
    inherited: boolean;
    overridden: boolean;
    inactive: boolean;
};

export type DesignMatchedRule = {
    selector: string;
    href: string;
    media: string;
    layer: string;
};

export type DesignInspectClass = {
    name: string;
    enabled: boolean;
    kind: "utility" | "module" | "class";
};

export type DesignInspectIssue = {
    id: string;
    severity: "info" | "warn";
    title: string;
    detail: string;
};

export type DesignInspect = {
    box: {
        width: number;
        height: number;
        x: number;
        y: number;
        marginTop: string;
        marginRight: string;
        marginBottom: string;
        marginLeft: string;
        paddingTop: string;
        paddingRight: string;
        paddingBottom: string;
        paddingLeft: string;
        borderTop: string;
        borderRight: string;
        borderBottom: string;
        borderLeft: string;
    };
    layout: {
        display: string;
        position: string;
        flexDirection: string;
        flexWrap: string;
        justifyContent: string;
        alignItems: string;
        gap: string;
        columnGap: string;
        rowGap: string;
        gridTemplateColumns: string;
        gridTemplateRows: string;
        isFlex: boolean;
        isGrid: boolean;
    };
    accessibility: {
        role: string;
        name: string;
        focusable: boolean;
        alt?: string | null;
        contrast: number | null;
    };
    responsive: {
        width: number;
        height: number;
        dpr: number;
        breakpoint: string;
    };
    origins: Record<string, DesignPropertyInspect>;
    matched: DesignMatchedRule[];
    classes: DesignInspectClass[];
    issues: DesignInspectIssue[];
    states: {
        paused: boolean;
        emulateFocus: boolean;
    };
};

export type DesignComputedStyles = {
    color: string;
    backgroundColor: string;
    backgroundImage: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    fontStyle: string;
    lineHeight: string;
    letterSpacing: string;
    textAlign: string;
    textDecoration: string;
    textTransform: string;
    whiteSpace: string;
    textOverflow: string;
    marginTop: string;
    marginRight: string;
    marginBottom: string;
    marginLeft: string;
    paddingTop: string;
    paddingRight: string;
    paddingBottom: string;
    paddingLeft: string;
    borderWidth: string;
    borderStyle: string;
    borderColor: string;
    borderRadius: string;
    opacity: string;
    boxShadow: string;
    display: string;
    width: string;
    height: string;
    gap: string;
    columnGap: string;
    rowGap: string;
    flexDirection: string;
    justifyContent: string;
    alignItems: string;
    flexWrap: string;
    overflow: string;
    position: string;
    top: string;
    right: string;
    bottom: string;
    left: string;
    mixBlendMode: string;
    filter: string;
    backdropFilter: string;
    maskImage: string;
    WebkitMaskImage: string;
};

export type DesignGeneratedLoc = {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
};

export type DesignSourceLoc = {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
    componentName?: string;
    nodeId?: string;
    generated?: DesignGeneratedLoc;
    mapped?: boolean;
};

export type DesignSelectedElement = {
    id: string;
    tag: string;
    label: string;
    text: string;
    className: string;
    locateText?: string;
    selector?: string;
    source?: DesignSourceLoc;
    editable?: boolean;
    styles: DesignComputedStyles;
    inspect?: DesignInspect;
};

export type DesignPendingEdit = {
    id: string;
    tag?: string;
    selector?: string;
    className?: string;
    locateText?: string;
    source?: DesignSourceLoc;
    label: string;
    styles: Partial<Record<keyof DesignComputedStyles, string>>;
    text?: string;
    inspect?: DesignInspect;
    classToggles?: Record<string, boolean>;
};

export type DesignBridgeApi = {
    select: (id: string) => void;
    style: (id: string, styles: Record<string, string>, selector?: string) => void;
    content: (id: string, text: string, selector?: string) => void;
    undo: () => void;
    redo: () => void;
    reset: () => void;
    inspect: (enabled: boolean) => void;
    pause?: (enabled: boolean, resumeAfterEdit?: boolean) => void;
    pseudo?: (id: string, pseudo: string, enabled: boolean, selector?: string) => void;
    classToggle?: (id: string, className: string, enabled: boolean, selector?: string) => void;
    watch?: (id: string, enabled: boolean, selector?: string) => void;
    emulateFocus?: (enabled: boolean) => void;
    listFonts?: () => Promise<string[]>;
    injectFont?: (family: string) => void;
    exportElement?: (
        id: string,
        opts: { format: string; scale: number; selector?: string },
    ) => Promise<import("./export-file").DesignExportPayload>;
};

export const DESIGN_STYLE_KEYS: (keyof DesignComputedStyles)[] = [
    "color",
    "backgroundColor",
    "backgroundImage",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "lineHeight",
    "letterSpacing",
    "textAlign",
    "textDecoration",
    "textTransform",
    "whiteSpace",
    "textOverflow",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderWidth",
    "borderStyle",
    "borderColor",
    "borderRadius",
    "opacity",
    "boxShadow",
    "display",
    "width",
    "height",
    "gap",
    "columnGap",
    "rowGap",
    "flexDirection",
    "justifyContent",
    "alignItems",
    "flexWrap",
    "overflow",
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "mixBlendMode",
    "filter",
    "backdropFilter",
    "maskImage",
    "WebkitMaskImage",
];

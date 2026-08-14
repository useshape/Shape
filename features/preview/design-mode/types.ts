export type DesignLayerNode = {
    id: string;
    tag: string;
    label: string;
    children: DesignLayerNode[];
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
};

export type DesignSourceLoc = {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
    componentName?: string;
};

export type DesignSelectedElement = {
    id: string;
    tag: string;
    label: string;
    text: string;
    className: string;
    selector?: string;
    source?: DesignSourceLoc;
    styles: DesignComputedStyles;
};

export type DesignPendingEdit = {
    id: string;
    tag?: string;
    selector?: string;
    className?: string;
    source?: DesignSourceLoc;
    label: string;
    styles: Partial<Record<keyof DesignComputedStyles, string>>;
    text?: string;
};

export type DesignBridgeApi = {
    select: (id: string) => void;
    style: (id: string, styles: Record<string, string>, selector?: string) => void;
    content: (id: string, text: string, selector?: string) => void;
    undo: () => void;
    redo: () => void;
    reset: () => void;
    inspect: (enabled: boolean) => void;
    pause?: (enabled: boolean) => void;
    pseudo?: (id: string, pseudo: string, enabled: boolean, selector?: string) => void;
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
];

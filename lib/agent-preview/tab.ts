export const DESIGN_PREVIEW_TAB_PREFIX = "shape://design-preview/";
export const DESIGN_PREVIEW_TAB_NAME = "Design concepts";

export function designPreviewTabPath(sessionId: string): string {
    return `${DESIGN_PREVIEW_TAB_PREFIX}${sessionId}`;
}

export function parseDesignPreviewTabPath(path: string | null | undefined): string | null {
    if (!path?.startsWith(DESIGN_PREVIEW_TAB_PREFIX)) return null;
    const id = path.slice(DESIGN_PREVIEW_TAB_PREFIX.length);
    return id || null;
}

export function isDesignPreviewTab(path: string | null | undefined): boolean {
    return !!parseDesignPreviewTabPath(path);
}

export function designPreviewTabName(_conceptName?: string): string {
    return DESIGN_PREVIEW_TAB_NAME;
}

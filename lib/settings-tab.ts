export const SETTINGS_TAB_PATH = "shape://settings";
export const SETTINGS_TAB_NAME = "Settings";

import { isBrowserTab } from "./browser-tab";
import { isDesignPreviewTab } from "./design-preview-tab";

export function isSettingsTab(path: string | null | undefined): boolean {
    return path === SETTINGS_TAB_PATH;
}

export function isVirtualEditorTab(path: string | null | undefined): boolean {
    if (!path) return false;
    return isSettingsTab(path) || isDesignPreviewTab(path) || isBrowserTab(path);
}

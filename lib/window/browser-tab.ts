export const BROWSER_TAB_PATH = "shape://browser";

export function isBrowserTab(path: string | null | undefined): boolean {
    return path === BROWSER_TAB_PATH;
}

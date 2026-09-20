export const BROWSER_TAB_PATH = "shape://browser";
export const BROWSER_TAB_NAME = "Browser";

export function isBrowserTab(path: string | null | undefined): boolean {
    return path === BROWSER_TAB_PATH;
}

export async function openBrowserTab(): Promise<void> {
    const { commands } = await import("@/lib/backend");
    await commands.openFile(BROWSER_TAB_PATH, BROWSER_TAB_NAME);
}

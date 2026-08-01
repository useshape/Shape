import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { isDesignPreviewTab } from "@/lib/design-preview-tab";

const stack: { path: string; name: string }[] = [];

export function rememberClosedTab(path: string, name: string) {
    stack.unshift({ path, name });
    if (stack.length > 20) stack.pop();
}

export function clearClosedTabs() {
    stack.length = 0;
}

export async function reopenLastClosed() {
    const tab = stack.shift();
    if (!tab) {
        notify.info("Editor", "No recently closed tabs.");
        return;
    }
    if (isDesignPreviewTab(tab.path)) {
        notify.info("Editor", "That tab cannot be restored from the closed-tab stack.");
        return;
    }
    try {
        await commands.openFile(tab.path, tab.name);
    } catch (e) {
        notify.error("Editor", `Could not reopen tab: ${String(e)}`);
    }
}

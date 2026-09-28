"use client";

import { BranchRequest20Regular } from "@fluentui/react-icons/headless/svg/branch-request";
import { Settings20Regular } from "@fluentui/react-icons/headless/svg/settings";

import { Icon } from "@/components/ui/icon";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { Button } from "@/components/ui/button";

/** Footer actions when the account control lives in the sidebar header. */
export function AccountRow() {
    return (
        <div className="flex h-10 items-center justify-end gap-1.5 px-2">
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => window.dispatchEvent(new Event("shape-open-pull-requests"))}
                className="size-7 shrink-0 text-text-muted hover:text-text-primary"
                aria-label="Pull requests"
            >
                <Icon icon={BranchRequest20Regular} />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void openSettingsWindow()}
                className="size-7 shrink-0 text-text-muted hover:text-text-primary"
                aria-label="Settings"
            >
                <Icon icon={Settings20Regular} />
            </Button>
        </div>
    );
}

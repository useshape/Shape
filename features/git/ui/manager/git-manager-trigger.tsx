"use client";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Logo-only control — opens the Git manager window. */
export function GitManagerTrigger({ className }: { className?: string }) {
    return (
        <Tooltip content="Git Manager">
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Open Git Manager"
                className={cn("h-6 w-6 hover:bg-panel-hover", className)}
                onClick={() => void import("@/lib/open-git-window").then(({ openGitWindow }) => openGitWindow())}
            >
                <span
                    aria-hidden
                    className="block size-5 bg-current"
                    style={{
                        maskImage: "url(/logos/logo.svg)",
                        WebkitMaskImage: "url(/logos/logo.svg)",
                        maskSize: "contain",
                        WebkitMaskSize: "contain",
                        maskRepeat: "no-repeat",
                        WebkitMaskRepeat: "no-repeat",
                        maskPosition: "center",
                        WebkitMaskPosition: "center",
                    }}
                />
            </Button>
        </Tooltip>
    );
}

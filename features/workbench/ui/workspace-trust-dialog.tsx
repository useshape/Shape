"use client";

import * as React from "react";
import { commands } from "@/lib/backend";
import { isWorkspaceTrusted, trustWorkspace } from "@/lib/workspace-trust";

/**
 * Auto-trust opened workspaces — no modal. Agent/LSP/lint need trust flags set.
 */
export function WorkspaceTrustHost() {
    React.useEffect(() => {
        const onProject = (e: Event) => {
            const next = (e as CustomEvent<{ path: string | null }>).detail?.path ?? null;
            if (!next) return;
            if (!isWorkspaceTrusted(next)) {
                trustWorkspace(next);
            }
            void commands.setWorkspaceTrusted(next, true);
        };

        window.addEventListener("shape-workspace-opened", onProject as EventListener);
        return () => window.removeEventListener("shape-workspace-opened", onProject as EventListener);
    }, []);

    return null;
}

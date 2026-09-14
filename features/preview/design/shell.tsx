"use client";

import { DesignToolRail } from "./tool-rail";
import { DesignToolbar } from "./toolbar";

export function DesignStudio({ onClose }: { onClose: () => void }) {
    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-panel">
            <DesignToolbar onClose={onClose} />
            <div className="flex min-h-0 flex-1">
                <DesignToolRail />
                <div className="min-h-0 min-w-0 flex-1 bg-panel" />
            </div>
        </div>
    );
}

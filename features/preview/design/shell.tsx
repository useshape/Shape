"use client";

import { useState } from "react";
import { DesignInspectorPanel } from "./inspector-panel";
import { DesignOutlinePanel, type DesignOutlineId } from "./outline-panel";
import { DesignToolRail } from "./tool-rail";
import { DesignToolbar } from "./toolbar";

export function DesignStudio({ onClose }: { onClose: () => void }) {
    const [selectedId, setSelectedId] = useState<DesignOutlineId>("image-banner");

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-3">
            <DesignToolbar onClose={onClose} />
            <div className="flex min-h-0 flex-1">
                <DesignToolRail />
                <DesignOutlinePanel selectedId={selectedId} onSelect={setSelectedId} />
                <div className="min-h-0 min-w-0 flex-1 bg-editor" />
                <DesignInspectorPanel selectedId={selectedId} />
            </div>
        </div>
    );
}

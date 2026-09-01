export type TabKind = "changes" | "terminal";

export type WorkspaceTab = {
    id: string;
    kind: TabKind;
    title: string;
};

export function uid(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export const DEFAULT_TABS: WorkspaceTab[] = [
    { id: "changes", kind: "changes", title: "Changes" },
];

export function iconFor(kind: TabKind): string {
    switch (kind) {
        case "changes":
            return "changes";
        case "terminal":
            return "square-terminal";
        default:
            return "description";
    }
}

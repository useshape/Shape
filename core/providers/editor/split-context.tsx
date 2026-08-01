"use client";

import React, {
    createContext,
    useContext,
    useReducer,
    useCallback,
    useEffect,
    useMemo,
    useRef,
} from "react";
import { useProjectState, commands } from "@/lib/backend";

export type EditorGroupId = "left" | "right";

interface EditorGroup {
    tabs: string[];
    active: string | null;
}

interface SplitLayout {
    left: EditorGroup;
    right: EditorGroup;
    focused: EditorGroupId;
}

interface EditorGroupsState {
    split: SplitLayout | null;
}

type Action =
    | { type: "SPLIT_RIGHT"; activePath: string; allPaths: string[] }
    | { type: "CLOSE_SPLIT" }
    | { type: "SET_FOCUSED"; group: EditorGroupId }
    | { type: "SET_GROUP_ACTIVE"; group: EditorGroupId; path: string }
    | { type: "SYNC_OPEN_FILES"; paths: string[]; backendActive: string | null }
    | { type: "OPEN_IN_FOCUSED"; path: string };

function pickNeighbor(active: string, tabs: string[]): string | null {
    if (tabs.length === 0) return null;
    const idx = tabs.indexOf(active);
    if (idx === -1) return tabs[0];
    if (idx + 1 < tabs.length) return tabs[idx + 1];
    if (idx - 1 >= 0) return tabs[idx - 1];
    return tabs[0];
}

function reducer(state: EditorGroupsState, action: Action): EditorGroupsState {
    switch (action.type) {
        case "SPLIT_RIGHT": {
            const { activePath, allPaths } = action;
            if (!activePath) return state;

            const remaining = allPaths.filter((p) => p !== activePath);
            const leftActive = pickNeighbor(activePath, remaining);

            return {
                split: {
                    left: { tabs: remaining, active: leftActive },
                    right: { tabs: [activePath], active: activePath },
                    focused: "right",
                },
            };
        }

        case "CLOSE_SPLIT":
            return { split: null };

        case "SET_FOCUSED":
            if (!state.split) return state;
            if (state.split.focused === action.group) return state;
            return { split: { ...state.split, focused: action.group } };

        case "SET_GROUP_ACTIVE":
            if (!state.split) return state;
            const group = action.group;
            const next = {
                ...state.split,
                focused: group,
                [group]: {
                    ...state.split[group],
                    active: action.path,
                },
            };
            if (group === "left") commands.setActiveFile(action.path);
            return { split: next };

        case "OPEN_IN_FOCUSED": {
            if (!state.split) return state;
            const g = state.split.focused;
            const tabs = state.split[g].tabs.includes(action.path)
                ? state.split[g].tabs
                : [...state.split[g].tabs, action.path];
            return {
                split: {
                    ...state.split,
                    [g]: { tabs, active: action.path },
                },
            };
        }

        case "SYNC_OPEN_FILES": {
            const open = new Set(action.paths);
            if (!state.split) return state;

            const prune = (group: EditorGroup): EditorGroup => {
                const tabs = group.tabs.filter((p) => open.has(p));
                const active = group.active && open.has(group.active) ? group.active : tabs[0] ?? null;
                return { tabs, active };
            };

            const left = prune(state.split.left);
            const right = prune(state.split.right);

            if (right.tabs.length === 0) {
                return { split: null };
            }

            const added = action.paths.filter(
                (p) => !state.split!.left.tabs.includes(p) && !state.split!.right.tabs.includes(p)
            );
            if (added.length === 0) {
                const sameLeft =
                    left.tabs.length === state.split.left.tabs.length &&
                    left.tabs.every((t, i) => t === state.split!.left.tabs[i]) &&
                    left.active === state.split.left.active;
                const sameRight =
                    right.tabs.length === state.split.right.tabs.length &&
                    right.tabs.every((t, i) => t === state.split!.right.tabs[i]) &&
                    right.active === state.split.right.active;
                if (sameLeft && sameRight) return state;
                return { split: { ...state.split, left, right } };
            }

            const g = state.split.focused;
            const target = g === "left" ? left : right;
            const withNew = {
                tabs: [...target.tabs, ...added.filter((p) => !target.tabs.includes(p))],
                active: added[added.length - 1],
            };
            return {
                split: {
                    ...state.split,
                    left: g === "left" ? withNew : left,
                    right: g === "right" ? withNew : right,
                },
            };
        }

        default:
            return state;
    }
}

interface EditorGroupsContextType {
    splitEnabled: boolean;
    focusedGroup: EditorGroupId;
    splitRight: () => void;
    closeSplit: () => void;
    setFocusedGroup: (group: EditorGroupId) => void;
    setGroupActiveFile: (group: EditorGroupId, path: string) => void;
    getGroupActiveFile: (group: EditorGroupId) => string | null;
    getGroupTabs: (group: EditorGroupId) => string[];
}

const EditorGroupsContext = createContext<EditorGroupsContextType | undefined>(undefined);

export function EditorSplitProvider({ children }: { children: React.ReactNode }) {
    const { active_file, open_files } = useProjectState();
    const openPaths = useMemo(() => open_files.map((f) => f.path), [open_files]);
    const [{ split }, dispatch] = useReducer(reducer, { split: null });
    const prevPathsRef = useRef<string[]>([]);

    const splitRight = useCallback(() => {
        if (split) return;
        const activePath = active_file ?? openPaths[0] ?? null;
        if (!activePath) return;
        dispatch({ type: "SPLIT_RIGHT", activePath, allPaths: openPaths });
        const remaining = openPaths.filter((p) => p !== activePath);
        const leftActive = pickNeighbor(activePath, remaining);
        if (leftActive) commands.setActiveFile(leftActive);
    }, [active_file, openPaths, split]);

    const closeSplit = useCallback(() => {
        if (!split) return;
        const focus =
            split[split.focused].active ??
            split.left.active ??
            split.right.active ??
            openPaths[0] ??
            null;
        dispatch({ type: "CLOSE_SPLIT" });
        if (focus) commands.setActiveFile(focus);
    }, [split, openPaths]);

    const setFocusedGroup = useCallback((group: EditorGroupId) => {
        dispatch({ type: "SET_FOCUSED", group });
    }, []);

    const setGroupActiveFile = useCallback((group: EditorGroupId, path: string) => {
        if (!split) {
            commands.setActiveFile(path);
            return;
        }
        dispatch({ type: "SET_GROUP_ACTIVE", group, path });
    }, [split]);

    const getGroupTabs = useCallback(
        (group: EditorGroupId): string[] => {
            if (!split) return openPaths;
            return split[group].tabs;
        },
        [split, openPaths]
    );

    const getGroupActiveFile = useCallback(
        (group: EditorGroupId): string | null => {
            if (!split) {
                return active_file ?? openPaths[0] ?? null;
            }
            const g = split[group];
            return g.active ?? g.tabs[0] ?? null;
        },
        [split, active_file, openPaths]
    );

    // Keep split groups in sync when tabs close/open (not on every focus change)
    useEffect(() => {
        if (!split) {
            prevPathsRef.current = openPaths;
            return;
        }
        const prevKey = prevPathsRef.current.join("\0");
        const nextKey = openPaths.join("\0");
        if (prevKey === nextKey) return;
        prevPathsRef.current = openPaths;
        dispatch({ type: "SYNC_OPEN_FILES", paths: openPaths, backendActive: active_file });
    }, [openPaths, split]);

    useEffect(() => {
        const handleSplit = (e: Event) => {
            const action = (e as CustomEvent<{ action?: string }>).detail?.action;
            if (action === "close") closeSplit();
            else if (action === "right") splitRight();
        };
        window.addEventListener("shape-editor-split", handleSplit as EventListener);
        return () => window.removeEventListener("shape-editor-split", handleSplit as EventListener);
    }, [splitRight, closeSplit]);

    const value = useMemo(
        (): EditorGroupsContextType => ({
            splitEnabled: split !== null,
            focusedGroup: split?.focused ?? "left",
            splitRight,
            closeSplit,
            setFocusedGroup,
            setGroupActiveFile,
            getGroupActiveFile,
            getGroupTabs,
        }),
        [split, splitRight, closeSplit, setFocusedGroup, setGroupActiveFile, getGroupActiveFile, getGroupTabs]
    );

    return (
        <EditorGroupsContext.Provider value={value}>
            {children}
        </EditorGroupsContext.Provider>
    );
}

export function useEditorSplit() {
    const ctx = useContext(EditorGroupsContext);
    if (!ctx) throw new Error("useEditorSplit must be used within EditorSplitProvider");
    return ctx;
}

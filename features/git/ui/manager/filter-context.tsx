"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import type { GitSectionId } from "@/features/git/types";

const PLACEHOLDERS: Partial<Record<GitSectionId, string>> = {
    source: "Search changes…",
    graph: "Search commits…",
    branches: "Filter branches…",
    tags: "Filter tags…",
    issues: "Filter issues…",
    "pull-requests": "Filter pull requests…",
    releases: "Filter releases…",
    "workflow-runs": "Filter runs…",
    "workflow-definitions": "Filter workflows…",
    jobs: "Filter runs…",
    steps: "Filter runs…",
    "live-status": "Filter runs…",
    logs: "Filter runs…",
    artifacts: "Filter runs…",
    "check-runs": "Filter check runs…",
    "check-suites": "Filter check suites…",
    "commit-statuses": "Filter statuses…",
    deployments: "Filter deployments…",
    "deployment-statuses": "Filter statuses…",
};

type FilterContextValue = {
    query: string;
    setQuery: (value: string) => void;
    section: GitSectionId;
    setSection: (id: GitSectionId) => void;
    placeholder: string;
    /** Sections that don't use the titlebar filter yet. */
    searchEnabled: boolean;
};

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({
    children,
    initialSection = "source",
}: {
    children: ReactNode;
    initialSection?: GitSectionId;
}) {
    const [query, setQueryState] = useState("");
    const [section, setSectionState] = useState<GitSectionId>(initialSection);

    const setSection = useCallback((id: GitSectionId) => {
        setSectionState(id);
        setQueryState("");
    }, []);

    const setQuery = useCallback((value: string) => {
        setQueryState(value);
    }, []);

    const placeholder = PLACEHOLDERS[section] ?? "Search…";
    const searchEnabled = section !== "source";

    const value = useMemo(
        () => ({
            query,
            setQuery,
            section,
            setSection,
            placeholder,
            searchEnabled,
        }),
        [placeholder, query, searchEnabled, section, setQuery, setSection],
    );

    return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilter(): FilterContextValue {
    const ctx = useContext(FilterContext);
    if (!ctx) {
        return {
            query: "",
            setQuery: () => {},
            section: "source",
            setSection: () => {},
            placeholder: "Search…",
            searchEnabled: false,
        };
    }
    return ctx;
}

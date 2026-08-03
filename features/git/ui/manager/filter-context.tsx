"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
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

const SECTION_STORAGE_KEY = "shape-git-manager-section";

const KNOWN_SECTIONS = new Set<string>(Object.keys(PLACEHOLDERS));

export function isGitSectionId(value: string | null | undefined): value is GitSectionId {
    return !!value && KNOWN_SECTIONS.has(value);
}

export function readStoredGitSection(): GitSectionId | null {
    if (typeof window === "undefined") return null;
    try {
        const fromQuery = new URLSearchParams(window.location.search).get("section");
        if (isGitSectionId(fromQuery)) return fromQuery;
        const stored = localStorage.getItem(SECTION_STORAGE_KEY);
        if (isGitSectionId(stored)) return stored;
    } catch {
        /* ignore */
    }
    return null;
}

export function persistGitSection(id: GitSectionId) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(SECTION_STORAGE_KEY, id);
    } catch {
        /* ignore */
    }
    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get("section") === id) return;
        url.searchParams.set("section", id);
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
        /* ignore */
    }
}

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
    // Keep SSR + first client paint identical — hydrate from URL/storage after mount.
    const [query, setQueryState] = useState("");
    const [section, setSectionState] = useState<GitSectionId>(initialSection);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        const stored = readStoredGitSection();
        if (stored) {
            setSectionState(stored);
            persistGitSection(stored);
        }
        setHydrated(true);
    }, []);

    const setSection = useCallback((id: GitSectionId) => {
        setSectionState(id);
        setQueryState("");
        persistGitSection(id);
    }, []);

    const setQuery = useCallback((value: string) => {
        setQueryState(value);
    }, []);

    const placeholder = PLACEHOLDERS[section] ?? "Search…";
    // Avoid titlebar search flashing before section hydrate (prevents hydration mismatch).
    const searchEnabled = hydrated && section !== "source";

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

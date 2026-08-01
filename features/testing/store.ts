import { useSyncExternalStore } from "react";
import type { TestCase, TestDiscovery, TestRunSummary, TestSuiteNode } from "./types";

type TestStoreState = {
    discovery: TestDiscovery | null;
    suites: TestSuiteNode[];
    summary: TestRunSummary | null;
    running: boolean;
    error: string | null;
    lastPattern: string | null;
};

let state: TestStoreState = {
    discovery: null,
    suites: [],
    summary: null,
    running: false,
    error: null,
    lastPattern: null,
};

const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): TestStoreState {
    return state;
}

export function useTestStore() {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function resetTestStore() {
    state = {
        discovery: null,
        suites: [],
        summary: null,
        running: false,
        error: null,
        lastPattern: null,
    };
    emit();
}

export function setTestDiscovery(discovery: TestDiscovery) {
    const previewSuites = discovery.test_files.map((file) => ({
        id: file,
        name: file.split(/[\\/]/).pop() || file,
        file,
        tests: [],
        passed: 0,
        failed: 0,
        skipped: 0,
    }));
    state = { ...state, discovery, suites: previewSuites };
    emit();
}

export function setTestRunning(running: boolean, pattern: string | null = null) {
    state = {
        ...state,
        running,
        error: running ? null : state.error,
        lastPattern: pattern ?? state.lastPattern,
        summary: running ? null : state.summary,
    };
    emit();
}

export function setTestError(message: string) {
    state = { ...state, running: false, error: message };
    emit();
}

function upsertTest(test: TestCase) {
    const suites = [...state.suites];
    const fileKey = test.file;
    let suite = suites.find((s) => s.file === fileKey);
    if (!suite) {
        suite = {
            id: fileKey,
            name: fileKey.split(/[\\/]/).pop() || fileKey,
            file: fileKey,
            tests: [],
            passed: 0,
            failed: 0,
            skipped: 0,
        };
        suites.push(suite);
    }

    const tests = suite.tests.filter((t) => t.id !== test.id);
    tests.push(test);
    tests.sort((a, b) => a.name.localeCompare(b.name));

    suite = {
        ...suite,
        tests,
        passed: tests.filter((t) => t.status === "passed").length,
        failed: tests.filter((t) => t.status === "failed").length,
        skipped: tests.filter((t) => t.status === "skipped" || t.status === "pending").length,
    };

    const nextSuites = suites.map((s) => (s.file === fileKey ? suite! : s));
    nextSuites.sort((a, b) => a.name.localeCompare(b.name));

    state = { ...state, suites: nextSuites };
    emit();
}

export function applyTestResultEvent(event: {
    event_type: string;
    framework: string;
    test?: TestCase;
    summary?: TestRunSummary;
    message?: string;
}) {
    switch (event.event_type) {
        case "start":
            state = {
                ...state,
                running: true,
                error: null,
                summary: null,
            };
            emit();
            break;
        case "test":
            if (event.test) upsertTest(event.test);
            break;
        case "complete":
            state = {
                ...state,
                running: false,
                summary: event.summary ?? state.summary,
                error: null,
            };
            emit();
            break;
        case "error":
            state = {
                ...state,
                running: false,
                error: event.message ?? "Test run failed",
            };
            emit();
            break;
    }
}

export function getFailedTests(): TestCase[] {
    return state.suites.flatMap((s) => s.tests.filter((t) => t.status === "failed"));
}

export function getFailedPattern(): string | null {
    const failed = getFailedTests();
    if (failed.length === 0) return null;
    const files = [...new Set(failed.map((t) => t.file))];
    if (files.length === 1) {
        return files[0].split(/[\\/]/).pop() ?? files[0];
    }
    return failed.map((t) => t.name).join("|");
}

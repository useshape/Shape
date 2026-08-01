import { listen } from "@tauri-apps/api/event";
import { commands } from "@/lib/backend";
import {
    applyTestResultEvent,
    resetTestStore,
    setTestDiscovery,
    setTestError,
    setTestRunning,
} from "./store";
import type { TestDiscovery, TestFramework, TestResultEvent } from "./types";

let listenerInitialized = false;
let unlisten: (() => void) | null = null;

export async function initTestRunnerEvents() {
    if (listenerInitialized) return;
    listenerInitialized = true;
    unlisten = await listen<TestResultEvent>("test-result", (event) => {
        applyTestResultEvent(event.payload);
    });
}

export function disposeTestRunnerEvents() {
    unlisten?.();
    unlisten = null;
    listenerInitialized = false;
}

export async function discoverProjectTests(projectPath: string): Promise<TestDiscovery> {
    const discovery = await commands.discoverTests(projectPath);
    const normalized: TestDiscovery = {
        framework: normalizeFramework(discovery.framework),
        test_files: discovery.test_files,
    };
    setTestDiscovery(normalized);
    return normalized;
}

function normalizeFramework(value: string): TestFramework {
    const lower = value.toLowerCase();
    if (lower === "vitest") return "vitest";
    if (lower === "jest") return "jest";
    return "none";
}

export async function runAllTests(projectPath: string, framework: TestFramework) {
    if (framework === "none") {
        setTestError("No test framework detected in this project.");
        return;
    }
    setTestRunning(true, null);
    try {
        await commands.runTests(projectPath, framework, null);
    } catch (e) {
        setTestError(e instanceof Error ? e.message : String(e));
    }
}

export async function runFailedTests(projectPath: string, framework: TestFramework, pattern: string) {
    if (framework === "none") {
        setTestError("No test framework detected in this project.");
        return;
    }
    setTestRunning(true, pattern);
    try {
        await commands.runTests(projectPath, framework, pattern);
    } catch (e) {
        setTestError(e instanceof Error ? e.message : String(e));
    }
}

export function clearTestResults() {
    resetTestStore();
}

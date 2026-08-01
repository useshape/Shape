export type TestFramework = "vitest" | "jest" | "none";

export type TestStatus = "passed" | "failed" | "skipped" | "pending" | "running";

export interface TestDiscovery {
    framework: TestFramework;
    test_files: string[];
}

export interface TestCase {
    id: string;
    name: string;
    file: string;
    suite: string;
    status: TestStatus;
    duration_ms?: number;
    error?: string;
}

export interface TestRunSummary {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
}

export interface TestResultEvent {
    event_type: "start" | "test" | "complete" | "error";
    framework: string;
    test?: TestCase;
    summary?: TestRunSummary;
    message?: string;
}

export interface TestSuiteNode {
    id: string;
    name: string;
    file: string;
    tests: TestCase[];
    passed: number;
    failed: number;
    skipped: number;
}

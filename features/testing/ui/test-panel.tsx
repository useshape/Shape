"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectState } from "@/lib/backend";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    discoverProjectTests,
    initTestRunnerEvents,
    runAllTests,
    runFailedTests,
} from "../runner";
import { getFailedPattern, useTestStore } from "../store";
import type { TestCase, TestStatus } from "../types";

function StatusIcon({ status }: { status: TestStatus }) {
    switch (status) {
        case "passed":
            return <Icon name="check_circle" size={14} className="text-success shrink-0" />;
        case "failed":
            return <Icon name="error" size={14} className="text-error shrink-0" />;
        case "running":
            return <Icon name="sync" size={14} className="text-info shrink-0 animate-spin" />;
        case "skipped":
        case "pending":
            return <Icon name="radio_button_unchecked" size={14} className="text-text-muted shrink-0" />;
        default:
            return <Icon name="circle" size={14} className="text-text-muted shrink-0" />;
    }
}

function TestRow({ test }: { test: TestCase }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="select-none">
            <button
                type="button"
                className="flex w-full items-start gap-2 px-6 py-1.5 text-left hover:bg-panel-hover/50"
                onClick={() => setExpanded((v) => !v)}
            >
                <StatusIcon status={test.status} />
                <span className="flex-1 text-sm text-text-secondary">{test.name}</span>
                {test.duration_ms != null && (
                    <span className="text-xs text-text-muted">{test.duration_ms}ms</span>
                )}
            </button>
            {expanded && test.error && (
                <pre className="mx-6 mb-2 max-h-32 overflow-auto rounded-md bg-surface-2 px-3 py-2 text-xs text-error whitespace-pre-wrap">
                    {test.error}
                </pre>
            )}
        </div>
    );
}

export default function TestPanel() {
    const { project_path } = useProjectState();
    const { discovery, suites, summary, running, error } = useTestStore();
    const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

    useEffect(() => {
        void initTestRunnerEvents();
    }, []);

    useEffect(() => {
        if (!project_path) return;
        void discoverProjectTests(project_path).catch(() => {
            /* ignore discovery errors */
        });
    }, [project_path]);

    const framework = discovery?.framework ?? "none";
    const hasFramework = framework !== "none";

    const totals = useMemo(() => {
        if (summary) return summary;
        let passed = 0, failed = 0, skipped = 0;
        for (const suite of suites) {
            passed += suite.passed;
            failed += suite.failed;
            skipped += suite.skipped;
        }
        return { passed, failed, skipped, total: passed + failed + skipped };
    }, [summary, suites]);

    const toggleFile = useCallback((file: string) => {
        setExpandedFiles((prev) => ({ ...prev, [file]: !prev[file] }));
    }, []);

    const handleRunAll = () => {
        if (!project_path || !hasFramework) return;
        void runAllTests(project_path, framework);
    };

    const handleRunFailed = () => {
        if (!project_path || !hasFramework) return;
        const pattern = getFailedPattern();
        if (!pattern) return;
        void runFailedTests(project_path, framework, pattern);
    };

    const hasFailed = totals.failed > 0;

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-sm"
                    disabled={!project_path || !hasFramework || running}
                    onClick={handleRunAll}
                >
                    <Icon name="play_arrow" size={14} />
                    Run All
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-sm"
                    disabled={!project_path || !hasFramework || running || !hasFailed}
                    onClick={handleRunFailed}
                >
                    <Icon name="bug_report" size={14} />
                    Run Failed
                </Button>
                <div className="flex-1" />
                {running && (
                    <span className="text-xs text-text-muted">Running tests…</span>
                )}
                {!running && totals.total > 0 && (
                    <span className="text-xs text-text-muted">
                        {totals.passed} passed, {totals.failed} failed, {totals.skipped} skipped
                    </span>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                {!project_path && (
                    <div className="px-4 py-6 text-sm text-text-muted">Open a project to run tests.</div>
                )}
                {project_path && !hasFramework && (
                    <div className="px-4 py-6 text-sm text-text-muted">
                        No Vitest or Jest configuration found in this project.
                    </div>
                )}
                {error && (
                    <div className="mx-3 mt-3 rounded-md bg-error/10 px-3 py-2 text-sm text-error">
                        {error}
                    </div>
                )}
                {suites.map((suite) => {
                    const expanded = expandedFiles[suite.file] ?? true;
                    return (
                        <div key={suite.id} className="border-b border-border-subtle/50">
                            <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-panel-hover/50"
                                onClick={() => toggleFile(suite.file)}
                            >
                                <Icon
                                    name={expanded ? "expand_more" : "chevron_right"}
                                    size={14}
                                    className="text-text-muted shrink-0"
                                />
                                <Icon name="description" size={14} className="text-text-muted shrink-0" />
                                <span className="flex-1 truncate text-sm text-text-primary">{suite.name}</span>
                                <span className="text-xs text-text-muted">
                                    {suite.passed}/{suite.tests.length}
                                </span>
                            </button>
                            {expanded && (
                                <div className={cn("pb-1", running && "opacity-90")}>
                                    {suite.tests.length === 0 && (
                                        <div className="px-6 py-1.5 text-xs text-text-muted italic">
                                            {running ? "Running..." : "Not run yet"}
                                        </div>
                                    )}
                                    {suite.tests.map((test) => (
                                        <TestRow key={test.id} test={test} />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
                {project_path && hasFramework && suites.length === 0 && !running && !error && (
                    <div className="px-4 py-6 text-sm text-text-muted">
                        {discovery?.test_files.length
                            ? `${discovery.test_files.length} test file(s) found. Click Run All to execute.`
                            : "No test files found. Click Run All to scan and run tests."}
                    </div>
                )}
            </div>
        </div>
    );
}

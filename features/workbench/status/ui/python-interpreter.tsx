"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusItem } from "./status-item";
import { openStatusPalette } from "../hooks/use-editor-status";
import { useSettings, updateSettingSection } from "@/lib/settings";
import {
    discoverPythonInterpreters,
    formatInterpreterLabel,
    resolvePythonInterpreter,
    type PythonInterpreter,
} from "@/lib/python-interpreters";

function statusBarLabel(selected: string, interpreters: PythonInterpreter[]): string {
    if (selected === "auto" || !selected) {
        const best = interpreters[0];
        if (best?.version) return `Python ${best.version}`;
        return "Python";
    }
    const match = interpreters.find((i) => i.path === selected);
    if (match?.version) return `Python ${match.version}`;
    // Keep env name visible for venvs without a probed version
    if (match?.label) return match.label;
    return "Python";
}

export function PythonInterpreterStatus({
    language,
    projectPath,
}: {
    language: string;
    projectPath: string | null;
}) {
    const settings = useSettings();
    const isPython = language === "python";
    const selected = settings.python?.interpreterPath ?? "auto";
    const [interpreters, setInterpreters] = useState<PythonInterpreter[]>([]);

    useEffect(() => {
        if (!isPython) return;
        let cancelled = false;
        void discoverPythonInterpreters(projectPath).then((list) => {
            if (!cancelled) setInterpreters(list);
        });
        return () => {
            cancelled = true;
        };
    }, [isPython, projectPath, selected]);

    const label = useMemo(
        () => statusBarLabel(selected, interpreters),
        [selected, interpreters],
    );

    if (!isPython) return null;

    const openPicker = () => {
        void (async () => {
            const found = await discoverPythonInterpreters(projectPath);
            setInterpreters(found);
            const items = [
                {
                    id: "auto",
                    label: "Auto detect on PATH",
                    icon: "python.py",
                    run: () => updateSettingSection("python", { interpreterPath: "auto" }),
                },
                ...found.map((interp: PythonInterpreter) => ({
                    id: interp.path,
                    label: formatInterpreterLabel(interp),
                    icon: "python.py",
                    run: () => updateSettingSection("python", { interpreterPath: interp.path }),
                })),
                {
                    id: "browse",
                    label: "Browse for Python executable…",
                    icon: "python.py",
                    run: () => {
                        void (async () => {
                            const { open } = await import("@tauri-apps/plugin-dialog");
                            const picked = await open({
                                multiple: false,
                                directory: false,
                                title: "Select Python interpreter",
                                filters: [
                                    {
                                        name: "Python",
                                        extensions: ["exe", "bin", "*"],
                                    },
                                ],
                            });
                            if (typeof picked === "string" && picked.trim()) {
                                updateSettingSection("python", { interpreterPath: picked.trim() });
                            }
                        })();
                    },
                },
            ];
            openStatusPalette("Select Python Interpreter", items);
        })();
    };

    return (
        <StatusItem label="Select Python Interpreter" onClick={openPicker}>
            <span
                className="hidden sm:inline"
                title={
                    selected === "auto"
                        ? "Auto-detect Python on PATH"
                        : selected
                }
            >
                {label}
            </span>
        </StatusItem>
    );
}

export async function getActivePythonCommand(projectPath: string | null): Promise<string> {
    const { getSettings } = await import("@/lib/settings");
    return resolvePythonInterpreter(getSettings().python?.interpreterPath ?? "auto", projectPath);
}

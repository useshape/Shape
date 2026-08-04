"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    AlertDialog,
    AlertDialogBody,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { WorkflowInputDef } from "./utils";

export function DispatchDialog({
    open,
    onOpenChange,
    workflowName,
    defaultRef,
    inputs,
    busy,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workflowName: string;
    defaultRef: string;
    inputs: WorkflowInputDef[];
    busy: boolean;
    onSubmit: (gitRef: string, values: Record<string, string>) => void;
}) {
    const initial = useMemo(() => {
        const v: Record<string, string> = {};
        for (const inp of inputs) {
            v[inp.name] =
                inp.default ??
                (inp.type === "boolean" ? "false" : inp.options?.[0] ?? "");
        }
        return v;
    }, [inputs]);

    const [gitRef, setGitRef] = useState(defaultRef);
    const [values, setValues] = useState<Record<string, string>>(initial);

    useEffect(() => {
        if (open) {
            setGitRef(defaultRef);
            setValues(initial);
        }
    }, [open, defaultRef, initial]);

    const missingRequired = inputs.some(
        (inp) => inp.required && !(values[inp.name] ?? "").trim(),
    );

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent sizeClassName="max-w-[480px]">
                <AlertDialogHeader>
                    <AlertDialogTitle>Run workflow</AlertDialogTitle>
                    <AlertDialogDescription>
                        Dispatch <span className="font-medium text-text-primary">{workflowName}</span>{" "}
                        via <code className="text-xs">workflow_dispatch</code>.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogBody>
                    <div className="flex flex-col gap-3">
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-text-muted">Branch / tag</span>
                            <Input
                                value={gitRef}
                                onChange={(e) => setGitRef(e.target.value)}
                                placeholder="main"
                                className="h-8"
                            />
                        </label>
                        {inputs.map((inp) => (
                            <label key={inp.name} className="flex flex-col gap-1">
                                <span className="text-xs text-text-muted">
                                    {inp.name}
                                    {inp.required ? " *" : ""}
                                    {inp.description ? ` — ${inp.description}` : ""}
                                </span>
                                {inp.type === "choice" && inp.options?.length ? (
                                    <select
                                        className="h-8 rounded-lg border border-border-subtle bg-transparent px-2 text-sm"
                                        value={values[inp.name] ?? ""}
                                        onChange={(e) =>
                                            setValues((prev) => ({
                                                ...prev,
                                                [inp.name]: e.target.value,
                                            }))
                                        }
                                    >
                                        {inp.options.map((opt) => (
                                            <option key={opt} value={opt}>
                                                {opt}
                                            </option>
                                        ))}
                                    </select>
                                ) : inp.type === "boolean" ? (
                                    <select
                                        className="h-8 rounded-lg border border-border-subtle bg-transparent px-2 text-sm"
                                        value={values[inp.name] ?? "false"}
                                        onChange={(e) =>
                                            setValues((prev) => ({
                                                ...prev,
                                                [inp.name]: e.target.value,
                                            }))
                                        }
                                    >
                                        <option value="true">true</option>
                                        <option value="false">false</option>
                                    </select>
                                ) : (
                                    <Input
                                        value={values[inp.name] ?? ""}
                                        onChange={(e) =>
                                            setValues((prev) => ({
                                                ...prev,
                                                [inp.name]: e.target.value,
                                            }))
                                        }
                                        className="h-8"
                                    />
                                )}
                            </label>
                        ))}
                        {inputs.length === 0 ? (
                            <p className="text-xs text-text-muted">
                                This workflow has no inputs — it will run with defaults.
                            </p>
                        ) : null}
                    </div>
                </AlertDialogBody>
                <AlertDialogFooter>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        disabled={busy}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="default"
                        size="sm"
                        disabled={busy || !gitRef.trim() || missingRequired}
                        onClick={() => onSubmit(gitRef.trim(), values)}
                    >
                        {busy ? "Starting…" : "Run workflow"}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

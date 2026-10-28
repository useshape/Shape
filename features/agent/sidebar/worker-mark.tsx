"use client";

import { useState } from "react";
import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FrostMark } from "@/components/ui/frost-mark";
import { armNextChat, nextWorkerColor, WORKER_COLORS, WORKER_SHAPES, type WorkerShape } from "@/lib/sidebar/chat-lanes";

export const JOB_PRESETS = [
    { name: "Sales Outbound", job: "Find and write outreach to qualified leads." },
    { name: "Talent Scout", job: "Source candidates and draft outreach." },
    { name: "Paid Media", job: "Plan and iterate paid campaigns." },
    { name: "Expense Manager", job: "Track spend and flag unusual costs." },
    { name: "Product Performance", job: "Read product numbers and suggest next moves." },
    { name: "Bug Reproduction", job: "Reproduce reports and write a tight recap." },
    { name: "Account Health", job: "Watch accounts and draft save plays." },
    { name: "Chief of Staff", job: "Triage, summarize, and keep the rest of the team aligned." },
] as const;

export function WorkerMark({
    shape,
    color,
    size = 32,
    live = false,
    mood = "idle",
}: {
    shape: WorkerShape;
    color: string;
    size?: number;
    live?: boolean;
    mood?: "idle" | "typing" | "working" | "playful";
}) {
    return <FrostMark size={size} shape={shape} tint={color} live={live} mood={mood} label="" />;
}

export function CreateWorkerDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [name, setName] = useState("");
    const [job, setJob] = useState("");
    const [shape, setShape] = useState<WorkerShape>("circle");
    const [color, setColor] = useState<string>(WORKER_COLORS[7]);

    const close = (next: boolean) => {
        if (!next) {
            setName("");
            setJob("");
            setShape("circle");
            setColor(nextWorkerColor("Chat"));
        }
        onOpenChange(next);
    };

    const create = () => {
        const title = name.trim();
        if (!title) return;
        armNextChat({ mode: "Chat", shape, color, title, job: job.trim() });
        window.dispatchEvent(new Event("shape-chat-new"));
        window.dispatchEvent(new Event("shape-chat-focus-input"));
        close(false);
    };

    return (
        <AlertDialog open={open} onOpenChange={close}>
            <AlertDialogContent sizeClassName="max-w-[360px]" aria-describedby={undefined}>
                <AlertDialogHeader className="flex items-center justify-between px-3 pt-2">
                    <AlertDialogTitle>New worker</AlertDialogTitle>
                    <AlertDialogCancel className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary">
                        <Icon icon={Dismiss20Regular} />
                    </AlertDialogCancel>
                </AlertDialogHeader>
                <div className="flex flex-col items-center gap-9 px-4 pb-2">
                    <WorkerMark shape={shape} color={color} size={92} live />
                    <Input
                        value={name}
                        className="text-center"
                        placeholder="Name your worker"
                        onChange={(event) => setName(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                create();
                            }
                        }}
                    />
                    <Input
                        value={job}
                        className="text-center"
                        placeholder="Job line"
                        onChange={(event) => setJob(event.target.value)}
                    />
                    <div className="flex flex-wrap justify-center gap-1.5">
                        {JOB_PRESETS.map((preset) => (
                            <button
                                key={preset.name}
                                type="button"
                                className="rounded-full bg-panel-hover px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                                onClick={() => {
                                    setName(preset.name);
                                    setJob(preset.job);
                                }}
                            >
                                {preset.name}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center justify-center gap-3">
                        {WORKER_SHAPES.map((item) => (
                            <button
                                key={item}
                                type="button"
                                aria-label={item}
                                aria-pressed={item === shape}
                                onClick={() => setShape(item)}
                                className={cn(
                                    "flex size-10 items-center justify-center rounded-lg",
                                    item === shape && "bg-panel-hover ring-1 ring-border-subtle",
                                )}
                            >
                                <WorkerMark shape={item} color={color} size={26} />
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                        {WORKER_COLORS.map((swatch) => (
                            <button
                                key={swatch}
                                type="button"
                                aria-label={swatch}
                                aria-pressed={swatch === color}
                                onClick={() => setColor(swatch)}
                                className={cn(
                                    "size-6 rounded-full",
                                    swatch === color && "ring-2 ring-text-primary ring-offset-2 ring-offset-panel",
                                )}
                                style={{ backgroundColor: swatch }}
                            />
                        ))}
                    </div>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <Button type="button" size="sm" className="w-full h-10" disabled={!name.trim()} onClick={create}>
                        Create
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

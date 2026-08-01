import React from "react";
import { Icon } from "@/components/ui/icon";

interface SegmentedInputProps {
    values: string[];
    labels: string[];
    titles: string[];
    onChange: (index: number, value: string) => void;
    copyValue: string;
    copyKey: string;
    copiedRow: string | null;
    onCopy: (text: string, key: string) => void;
}

export function SegmentedInput({
    values,
    labels,
    titles,
    onChange,
    copyValue,
    copyKey,
    copiedRow,
    onCopy,
}: SegmentedInputProps) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-0.5">
                <div className="flex items-center flex-1 segmented-input-group">
                    {values.map((val, i) => (
                        <div key={labels[i]} className={`flex-1 min-w-0${i > 0 ? " -ml-px" : ""}`}>
                            <input
                                type="text"
                                value={val}
                                title={titles[i]}
                                autoCapitalize="none"
                                autoComplete="off"
                                autoCorrect="off"
                                spellCheck={false}
                                onChange={(e) => onChange(i, e.target.value)}
                                onKeyDown={(ev) => ev.stopPropagation()}
                                className={`w-full bg-panel-hover text-center text-text-primary h-8 text-xs outline-none focus:border-text-muted focus:relative focus:z-10 select-text ${
                                    i === 0 ? "rounded-l-lg" : ""
                                }${i === values.length - 1 ? "rounded-r-lg" : ""}`}
                            />
                        </div>
                    ))}
                </div>
                <button
                    onClick={() => onCopy(copyValue, copyKey)}
                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-panel-hover text-text-primary hover:text-text-primary hover:bg-panel-hover transition-colors ml-1 cursor-pointer"
                >
                    {copiedRow === copyKey ? <Icon name="check" size={16} className="text-success" /> : <Icon name="content_copy" size={16} />}
                </button>
            </div>
            <div className="flex text-2xs text-text-muted font-medium select-none pr-[34px]">
                {labels.map((label) => (
                    <span key={label} className="flex-1 text-center">{label}</span>
                ))}
            </div>
        </div>
    );
}

"use client";

import React from "react";
import { Icon } from "@/components/ui/icon";

export function StyleAnalysis({ label, isActive }: { label: string; isActive?: boolean }) {
    return (
        <div className="flex flex-col gap-1 my-2">
            <div className="flex items-center gap-2 py-1.5 text-xs text-text-muted transition-colors group w-full text-left">
                <div className="w-3.5 h-3.5 flex items-center justify-center">
                    <Icon name="brush" size={14} />
                </div>
                {isActive ? (
                    <span className="font-medium text-sm animate-pulse text-text-secondary">{label}...</span>
                ) : (
                    <span className="font-medium text-sm">Inacted {label.toLowerCase()}</span>
                )}
                {isActive && (
                    <div className="w-2.5 h-2.5 border border-accent border-t-transparent rounded-full animate-spin ml-1" />
                )}
            </div>
        </div>
    );
}

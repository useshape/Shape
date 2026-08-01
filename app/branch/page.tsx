"use client";

import { Suspense } from "react";
import { GitManager } from "@/features/git/ui";

export default function BranchPage() {
    return (
        <Suspense fallback={null}>
            <GitManager />
        </Suspense>
    );
}

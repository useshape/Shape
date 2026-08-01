import { Suspense } from "react";
import { SettingsView } from "@/features/settings/ui/settings";

export const metadata = {
    title: "Settings",
    description: "Settings",
};

export default function SettingsPage() {
    return (
        <Suspense fallback={<div className="h-full w-full bg-panel" />}>
            <SettingsView />
        </Suspense>
    );
}

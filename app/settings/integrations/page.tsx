import { Suspense } from "react";
import { SettingsView } from "@/features/settings/ui/settings";

export const metadata = {
    title: "Integrations",
    description: "Connect MCP integrations",
};

export default function IntegrationsSettingsPage() {
    return (
        <Suspense fallback={<div className="h-full w-full bg-panel" />}>
            <SettingsView />
        </Suspense>
    );
}

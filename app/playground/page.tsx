"use client";

import { Titlebar } from "@/features/agent/workbench";
import { Button } from "@/components/ui/button";

/**
 * Legacy playground route — real UI demos live in the in-app Demo chat
 * (empty state or Command Palette → “Chat: Open Demo”).
 */
export default function ChatPlaygroundPage() {
    return (
        <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-text-primary">
            <Titlebar settings title="Chat playground" />
            <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4">
                <p className="max-w-md text-center text-sm text-text-secondary">
                    Chat surfaces are demoed in the product chat renderer — not this page.
                </p>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="font-normal"
                    onClick={() => {
                        window.dispatchEvent(
                            new CustomEvent("shape-layout-toggle", {
                                detail: { id: "secondary-sidebar", value: true },
                            }),
                        );
                        window.dispatchEvent(new CustomEvent("shape-demo-chat"));
                    }}
                >
                    Open demo chat
                </Button>
            </main>
        </div>
    );
}

"use client";

import { WindowConsole20Regular } from "@fluentui/react-icons/headless/svg/window-console";
import { ApprovalCard } from "@/features/chat/ui/blocks/approval";
import { GeneratedMediaCard } from "@/features/chat/ui/blocks/generated-media";
import { SentFileCard } from "@/features/chat/ui/blocks/sent-file";
import { MessageRenderer } from "@/features/chat/ui/md/renderer";
import { Icon } from "@/components/ui/icon";
import { SHOWCASE_MARKUP } from "./fixture";

const PIXEL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

export function ComponentShowcase() {
    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-panel">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
                    <div>
                        <p className="text-[13px] text-text-muted">Components</p>
                        <h1 className="text-[15px] font-medium text-text-primary">Response blocks</h1>
                    </div>
                    <MessageRenderer content={SHOWCASE_MARKUP} skipSubagentSync />
                    <section className="flex flex-col gap-3">
                        <p className="text-[13px] text-text-muted">Standalone cards</p>
                        <ApprovalCard
                            icon={<Icon icon={WindowConsole20Regular} />}
                            title={<span className="text-sm text-text-primary">Run bun test</span>}
                            onSkip={() => {}}
                            onAccept={() => {}}
                        >
                            <pre className="px-3 pb-1 font-mono text-xs text-text-secondary">bun run test -- tests/features/showcase.test.ts</pre>
                        </ApprovalCard>
                        <SentFileCard
                            name="brief.pdf"
                            mime="application/pdf"
                            src="data:application/pdf;base64,JVBERi0="
                            title="Product brief"
                        />
                        <GeneratedMediaCard
                            kind="image"
                            src={PIXEL}
                            prompt="a gray pixel"
                            mediaId="showcase-img"
                            model="klein"
                        />
                    </section>
                </div>
            </div>
        </div>
    );
}

"use client";

import { Clipboard20Regular } from "@fluentui/react-icons/headless/svg/clipboard";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { useEditorView } from "@/core/providers/editor";
import { useProjectState } from "@/lib/backend";
import { Breadcrumbs } from "@/features/editor/ui/main/ui/breadcrumb";
import { OpenInMenu } from "@/features/chat/ui/shell/open-in";

export function FileBar({ path }: { path: string }) {
    const { project_path } = useProjectState();
    const { getViewMode, setViewMode } = useEditorView();
    const markdown = /\.(md|mdx|markdown)$/i.test(path);
    const mode = getViewMode(path, markdown ? "preview" : "raw");

    return (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle px-2">
            <Breadcrumbs
                path={path}
                projectPath={project_path}
                compact
                className="h-7 min-w-0 flex-1 !pt-0"
            />
            <div className="flex shrink-0 items-center gap-1">
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-6 px-1.5 text-text-muted"
                    aria-label="Copy path"
                    onClick={() => {
                        void navigator.clipboard.writeText(path);
                    }}
                >
                    <Icon icon={Clipboard20Regular} />
                </Button>
                {markdown ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-6 px-2 font-normal text-text-secondary"
                        onClick={() => setViewMode(path, mode === "raw" ? "preview" : "raw")}
                    >
                        {mode === "raw" ? "Preview" : "View source"}
                    </Button>
                ) : null}
                <OpenInMenu path={path} />
            </div>
        </div>
    );
}

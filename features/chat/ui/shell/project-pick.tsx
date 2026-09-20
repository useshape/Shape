"use client";

import { RiFolderAddLine, RiFolderLine } from "@remixicon/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { QuickPick, type QuickPickItem } from "@/components/ui/quick-pick";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { invalidateGitRepoCache } from "@/lib/git/repos";
import { getRepoName, loadRepoHistory } from "@/lib/workspace/repo-history";
import {
    AzureDevOpsMark,
    BitbucketMark,
    GitHubMark,
    GitLabMark,
    GitUrlMark,
} from "./brand-marks";

export type ScaffoldKind = "next" | "vite" | "astro" | "remix";

export const DESIGN_SCAFFOLDS: Array<{
    id: ScaffoldKind;
    label: string;
    description: string;
}> = [
    { id: "next", label: "Create Next.js project", description: "App Router, TypeScript, Tailwind" },
    { id: "vite", label: "Create Vite project", description: "React + TypeScript" },
    { id: "astro", label: "Create Astro project", description: "Minimal TypeScript starter" },
    { id: "remix", label: "Create Remix project", description: "Remix + TypeScript" },
];

const SCAFFOLD_ITEMS: QuickPickItem[] = DESIGN_SCAFFOLDS.map((item) => ({
    id: `scaffold:${item.id}`,
    label: item.label,
    description: item.description,
    icon: RiFolderAddLine,
}));

type CloneKind = "git" | "github" | "gitlab" | "bitbucket" | "azure";

async function pickDirectory(title: string): Promise<string | null> {
    const { open: pick } = await import("@tauri-apps/plugin-dialog");
    const selected = await pick({
        directory: true,
        multiple: false,
        title,
    });
    return typeof selected === "string" ? selected : null;
}

function openProject(path: string) {
    window.dispatchEvent(new CustomEvent("shape-open-project", { detail: { path } }));
}

function toCloneUrl(kind: CloneKind, value: string): string | null {
    const raw = value.trim();
    if (!raw) return null;
    if (/^git@/i.test(raw) || /^https?:\/\//i.test(raw) || /^ssh:\/\//i.test(raw)) {
        return raw;
    }

    if (kind === "github") {
        const slug = raw.replace(/\.git$/i, "");
        if (!slug.includes("/")) return null;
        return `https://github.com/${slug}.git`;
    }
    if (kind === "gitlab") {
        const slug = raw.replace(/\.git$/i, "");
        if (!slug.includes("/")) return null;
        return `https://gitlab.com/${slug}.git`;
    }
    if (kind === "bitbucket") {
        const slug = raw.replace(/\.git$/i, "");
        if (!slug.includes("/")) return null;
        return `https://bitbucket.org/${slug}.git`;
    }
    if (kind === "azure") {
        const parts = raw.split("/").filter(Boolean);
        if (parts.length < 3) return null;
        const org = parts[0]!;
        const project = parts[1]!;
        const repo = parts[2] === "_git" ? parts[3] : parts[2];
        if (!repo) return null;
        return `https://dev.azure.com/${org}/${project}/_git/${repo}`;
    }
    return raw;
}

const CLONE_PLACEHOLDER: Record<CloneKind, string> = {
    git: "Paste a git URL and press Enter",
    github: "owner/repo",
    gitlab: "group/project",
    bitbucket: "workspace/repo",
    azure: "org/project/repo",
};

const SCAFFOLD_NOTIFY: Record<ScaffoldKind, string> = {
    next: "Creating Next.js project…",
    vite: "Creating Vite project…",
    astro: "Creating Astro project…",
    remix: "Creating Remix project…",
};

type PickStep = "projects" | "sources" | "clone";

function matchesQuery(item: QuickPickItem, q: string): boolean {
    if (!q) return true;
    return (
        item.label.toLowerCase().includes(q) ||
        (item.description ?? "").toLowerCase().includes(q)
    );
}

export async function scaffoldDesignProject(kind: ScaffoldKind): Promise<void> {
    const directory = await pickDirectory("Choose a folder for the new project");
    if (!directory) return;
    notify.info("Project", SCAFFOLD_NOTIFY[kind]);
    try {
        const path = await commands.scaffoldWebProject(kind, directory);
        notify.success("Project", "Project created.");
        openProject(path);
    } catch (err) {
        notify.error(err instanceof Error ? err.message : String(err));
    }
}

export function ProjectQuickPick({
    open,
    onOpenChange,
    initialStep = "projects",
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialStep?: Exclude<PickStep, "clone">;
}) {
    const [step, setStep] = useState<PickStep>(initialStep);
    const [cloneKind, setCloneKind] = useState<CloneKind>("github");
    const [query, setQuery] = useState("");
    const recents = useMemo(() => loadRepoHistory().slice(0, 12), [open]);

    useEffect(() => {
        if (!open) return;
        setStep(initialStep);
        setQuery("");
        setCloneKind("github");
    }, [open, initialStep]);

    const close = () => {
        setStep("projects");
        setQuery("");
        setCloneKind("github");
        onOpenChange(false);
    };

    const browseLocal = async () => {
        const path = await pickDirectory("Open project");
        if (path) {
            close();
            openProject(path);
        }
    };

    const runScaffold = async (kind: ScaffoldKind) => {
        close();
        await scaffoldDesignProject(kind);
    };

    const projectItems: QuickPickItem[] = useMemo(() => {
        const q = query.trim().toLowerCase();
        const rows = recents
            .filter(
                (r) =>
                    !q ||
                    getRepoName(r.path).toLowerCase().includes(q) ||
                    r.path.toLowerCase().includes(q),
            )
            .map((r, i) => ({
                id: r.path,
                label: getRepoName(r.path),
                description: r.path,
                icon: RiFolderLine,
                hint: i < 9 ? `Ctrl+${i + 1}` : undefined,
            }));
        const extras: QuickPickItem[] = [
            { id: "__browse__", label: "Open folder", description: "Browse a folder on disk", icon: RiFolderLine },
            ...SCAFFOLD_ITEMS,
            { id: "__sources__", label: "Clone from Git…", icon: RiFolderLine, description: "GitHub, GitLab, URL" },
        ];
        return [...rows, ...extras.filter((item) => matchesQuery(item, q))];
    }, [query, recents]);

    const mark = (node: ReactNode): ReactNode => (
        <span className="flex size-4 items-center justify-center">{node}</span>
    );

    const sourceItems: QuickPickItem[] = [
        { id: "local", label: "Open folder", description: "Browse a folder on disk", icon: RiFolderLine },
        ...SCAFFOLD_ITEMS,
        {
            id: "git",
            label: "Git URL",
            description: "Clone from a remote URL",
            iconNode: mark(<GitUrlMark />),
        },
        {
            id: "github",
            label: "GitHub repository",
            description: "Clone GitHub owner/repo",
            iconNode: mark(<GitHubMark />),
        },
        {
            id: "azure",
            label: "Azure DevOps repository",
            description: "Clone org/project/repo",
            iconNode: mark(<AzureDevOpsMark />),
        },
        {
            id: "bitbucket",
            label: "Bitbucket repository",
            description: "Clone workspace/repo",
            iconNode: mark(<BitbucketMark />),
        },
        {
            id: "gitlab",
            label: "GitLab repository",
            description: "Clone group/project",
            iconNode: mark(<GitLabMark />),
        },
    ];

    const cloneFromUrl = async (repoUrl: string) => {
        const parent = await pickDirectory("Select folder to clone into");
        if (!parent) return;
        notify.info("Git", "Cloning repository…");
        try {
            const clonedPath = await commands.gitClone(repoUrl, parent);
            invalidateGitRepoCache();
            window.dispatchEvent(new Event("shape-git-refresh"));
            notify.success("Git", "Repository cloned.");
            close();
            openProject(clonedPath);
        } catch (err) {
            notify.error(err instanceof Error ? err.message : String(err));
        }
    };

    const reset = () => {
        setStep("projects");
        setQuery("");
        setCloneKind("github");
    };

    const handleScaffoldOrLocal = (id: string): boolean => {
        if (id === "local" || id === "__browse__") {
            void browseLocal();
            return true;
        }
        if (id.startsWith("scaffold:")) {
            void runScaffold(id.slice("scaffold:".length) as ScaffoldKind);
            return true;
        }
        return false;
    };

    if (!open) return null;

    if (step === "clone") {
        return (
            <QuickPick
                open={open}
                onOpenChange={(next) => {
                    if (!next) reset();
                    onOpenChange(next);
                }}
                placeholder={CLONE_PLACEHOLDER[cloneKind]}
                query={query}
                onQueryChange={setQuery}
                items={[]}
                emptyText="Press Enter to clone."
                onSelect={() => undefined}
                onSubmitQuery={(value) => {
                    const url = toCloneUrl(cloneKind, value);
                    if (!url) {
                        notify.error(`Use ${CLONE_PLACEHOLDER[cloneKind]}`);
                        return;
                    }
                    void cloneFromUrl(url);
                }}
            />
        );
    }

    if (step === "sources") {
        const q = query.trim().toLowerCase();
        return (
            <QuickPick
                open={open}
                onOpenChange={(next) => {
                    if (!next) reset();
                    onOpenChange(next);
                }}
                placeholder="Open folder, create a project, or clone…"
                query={query}
                onQueryChange={setQuery}
                items={sourceItems.filter((item) => matchesQuery(item, q))}
                onSelect={(item) => {
                    if (handleScaffoldOrLocal(item.id)) return;
                    setQuery("");
                    setCloneKind(item.id as CloneKind);
                    setStep("clone");
                }}
            />
        );
    }

    return (
        <QuickPick
            open={open}
            onOpenChange={(next) => {
                if (!next) reset();
                onOpenChange(next);
            }}
            placeholder="Open folder or create a project…"
            query={query}
            onQueryChange={setQuery}
            items={projectItems}
            onSelect={(item) => {
                if (item.id === "__sources__") {
                    setQuery("");
                    setStep("sources");
                    return;
                }
                if (handleScaffoldOrLocal(item.id)) return;
                onOpenChange(false);
                openProject(item.id);
            }}
        />
    );
}

export function ProjectQuickPickHost() {
    const [open, setOpen] = useState(false);
    const [initialStep, setInitialStep] = useState<Exclude<PickStep, "clone">>("projects");

    useEffect(() => {
        const onNew = () => {
            setInitialStep("sources");
            setOpen(true);
        };
        const onPick = () => {
            setInitialStep("projects");
            setOpen(true);
        };
        const onScaffold = (event: Event) => {
            const kind = (event as CustomEvent<{ kind?: ScaffoldKind }>).detail?.kind;
            if (!kind) return;
            void scaffoldDesignProject(kind);
        };
        window.addEventListener("shape-new-project", onNew);
        window.addEventListener("shape-open-project-pick", onPick);
        window.addEventListener("shape-scaffold-project", onScaffold);
        return () => {
            window.removeEventListener("shape-new-project", onNew);
            window.removeEventListener("shape-open-project-pick", onPick);
            window.removeEventListener("shape-scaffold-project", onScaffold);
        };
    }, []);

    return <ProjectQuickPick open={open} onOpenChange={setOpen} initialStep={initialStep} />;
}

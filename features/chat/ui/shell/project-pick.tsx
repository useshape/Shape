"use client";

import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
import { Folder20Filled } from "@fluentui/react-icons/headless/svg/folder";
import { FolderOpen20Regular } from "@fluentui/react-icons/headless/svg/folder-open";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { QuickPick, type QuickPickItem } from "@/components/ui/quick-pick";
import { commands } from "@/lib/backend";
import { notify } from "@/features/notifications";
import { invalidateGitRepoCache } from "@/lib/git/repos";
import { getRepoName, loadRepoHistory } from "@/lib/workspace/repo-history";
import {
    AzureDevOpsMark,
    BitbucketMark,
    FrameworkMark,
    GitHubMark,
    GitLabMark,
    GitUrlMark,
} from "./brand-marks";
import {
    findProjectCategory,
    findProjectPreset,
    PROJECT_CATEGORIES,
    type ProjectBrandIcon,
    type ProjectPreset,
    type ScaffoldKind,
} from "./project-catalog";

export type { ScaffoldKind };

function brandMark(icon: ProjectBrandIcon): ReactNode {
    return <FrameworkMark slug={icon.slug} color={icon.color} invert={icon.invert} />;
}

function presetItem(preset: ProjectPreset): QuickPickItem {
    return {
        id: `scaffold:${preset.id}`,
        label: preset.label,
        description: preset.description,
        iconNode: (
            <span className="flex size-4 items-center justify-center">{brandMark(preset.icon)}</span>
        ),
    };
}

export type CloneKind = "git" | "github" | "gitlab" | "bitbucket" | "azure";

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

export function toCloneUrl(kind: CloneKind, value: string): string | null {
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

export const CLONE_PLACEHOLDER: Record<CloneKind, string> = {
    git: "Paste a git URL and press Enter",
    github: "owner/repo",
    gitlab: "group/project",
    bitbucket: "workspace/repo",
    azure: "org/project/repo",
};

type PickStep = "projects" | "sources" | "presets" | "hosts" | "clone";

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
    const preset = findProjectPreset(kind);
    notify.info("Project", preset ? `Creating ${preset.label}…` : "Creating project…");
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
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [cloneKind, setCloneKind] = useState<CloneKind>("github");
    const [query, setQuery] = useState("");
    const recents = useMemo(() => loadRepoHistory().slice(0, 12), [open]);

    useEffect(() => {
        if (!open) return;
        setStep(initialStep);
        setCategoryId(null);
        setQuery("");
        setCloneKind("github");
    }, [open, initialStep]);

    const close = () => {
        setStep("projects");
        setCategoryId(null);
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

    const mark = (node: ReactNode): ReactNode => (
        <span className="flex size-4 items-center justify-center">{node}</span>
    );

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
                icon: Folder20Filled,
                hint: i < 9 ? `Ctrl+${i + 1}` : undefined,
            }));
        const extras: QuickPickItem[] = [
            {
                id: "__browse__",
                label: "Open folder",
                description: "Browse a folder on disk",
                icon: FolderOpen20Regular,
            },
            {
                id: "__create__",
                label: "Create new project",
                description: "Scaffold or clone a repository",
                icon: Add20Regular,
            },
        ];
        return [...rows, ...extras.filter((item) => matchesQuery(item, q))];
    }, [query, recents]);

    const category = categoryId ? findProjectCategory(categoryId) : undefined;

    const categoryItems: QuickPickItem[] = [
        ...PROJECT_CATEGORIES.map((item) => ({
            id: `category:${item.id}`,
            label: item.label,
            description: item.description,
            iconNode: mark(brandMark(item.icon)),
        })),
        {
            id: "category:clone",
            label: "Clone",
            description: "Git URL, GitHub, GitLab, and more",
            iconNode: mark(<FrameworkMark slug="git" color="F05032" />),
        },
    ];

    const sourceItems: QuickPickItem[] = [
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
        setCategoryId(null);
        setQuery("");
        setCloneKind("github");
    };

    const backToCategories = () => {
        setQuery("");
        setCategoryId(null);
        setStep("sources");
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
                title="Clone"
                placeholder={CLONE_PLACEHOLDER[cloneKind]}
                query={query}
                onQueryChange={setQuery}
                items={[]}
                emptyText="Press Enter to clone."
                onBack={() => {
                    setQuery("");
                    setStep("hosts");
                }}
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

    if (step === "hosts") {
        const q = query.trim().toLowerCase();
        return (
            <QuickPick
                open={open}
                onOpenChange={(next) => {
                    if (!next) reset();
                    onOpenChange(next);
                }}
                title="Clone"
                placeholder="Clone a repository…"
                query={query}
                onQueryChange={setQuery}
                items={sourceItems.filter((item) => matchesQuery(item, q))}
                onBack={backToCategories}
                onSelect={(item) => {
                    setQuery("");
                    setCloneKind(item.id as CloneKind);
                    setStep("clone");
                }}
            />
        );
    }

    if (step === "presets" && category) {
        const q = query.trim().toLowerCase();
        return (
            <QuickPick
                open={open}
                onOpenChange={(next) => {
                    if (!next) reset();
                    onOpenChange(next);
                }}
                title={category.label}
                placeholder={`Create a ${category.label.toLowerCase()} project…`}
                query={query}
                onQueryChange={setQuery}
                items={category.presets.map(presetItem).filter((item) => matchesQuery(item, q))}
                onBack={backToCategories}
                onSelect={(item) => {
                    if (handleScaffoldOrLocal(item.id)) return;
                }}
            />
        );
    }

    if (step === "sources") {
        const q = query.trim().toLowerCase();
        const categories = categoryItems.filter((item) => matchesQuery(item, q));
        const presetHits = q
            ? PROJECT_CATEGORIES.flatMap((group) =>
                  group.presets
                      .filter(
                          (preset) =>
                              preset.label.toLowerCase().includes(q) ||
                              preset.description.toLowerCase().includes(q) ||
                              preset.id.toLowerCase().includes(q),
                      )
                      .map((preset) => ({
                          ...presetItem(preset),
                          description: `${group.label} · ${preset.description}`,
                      })),
              )
            : [];
        return (
            <QuickPick
                open={open}
                onOpenChange={(next) => {
                    if (!next) reset();
                    onOpenChange(next);
                }}
                placeholder="Create a project…"
                query={query}
                onQueryChange={setQuery}
                items={[...categories, ...presetHits]}
                onBack={
                    initialStep === "sources"
                        ? undefined
                        : () => {
                              setQuery("");
                              setStep("projects");
                          }
                }
                onSelect={(item) => {
                    if (handleScaffoldOrLocal(item.id)) return;
                    if (item.id === "category:clone") {
                        setQuery("");
                        setStep("hosts");
                        return;
                    }
                    if (item.id.startsWith("category:")) {
                        setCategoryId(item.id.slice("category:".length));
                        setQuery("");
                        setStep("presets");
                    }
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
                if (item.id === "__create__") {
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
        const onNew = (event: Event) => {
            const step = (event as CustomEvent<{ step?: "projects" | "sources" }>).detail?.step;
            setInitialStep(step === "sources" ? "sources" : "projects");
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { commands, useProjectState } from "@/lib/backend";
import type { PackageDep, PackageInfo } from "@/lib/backend/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/features/notifications";
import { resolvePackageManager } from "@/lib/package-manager";

function DepRow({
    dep,
    projectPath,
    pm,
    onRefresh,
}: {
    dep: PackageDep;
    projectPath: string;
    pm: string;
    onRefresh: () => void;
}) {
    const isOutdated =
        dep.latest &&
        dep.installed &&
        dep.latest !== dep.installed;

    const handleUpdate = async () => {
        try {
            await commands.npmUpdate(projectPath, dep.name, pm);
            notify.success("Packages", `Updated ${dep.name}`);
            onRefresh();
        } catch (e) {
            notify.error("Update failed", String(e));
        }
    };

    const handleUninstall = async () => {
        if (!confirm(`Uninstall ${dep.name}?`)) return;
        try {
            await commands.npmUninstall(projectPath, dep.name, pm);
            notify.success("Packages", `Removed ${dep.name}`);
            onRefresh();
        } catch (e) {
            notify.error("Uninstall failed", String(e));
        }
    };

    return (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-panel-hover group">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">{dep.name}</span>
                    {isOutdated && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium shrink-0">
                            outdated
                        </span>
                    )}
                </div>
                <div className="text-xs text-text-muted truncate">
                    {dep.installed ?? dep.version}
                    {dep.latest && dep.latest !== dep.installed ? ` → ${dep.latest}` : ""}
                </div>
            </div>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {isOutdated && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void handleUpdate()} title="Update">
                        <Icon name="upgrade" size={14} />
                    </Button>
                )}
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void handleUninstall()} title="Uninstall">
                    <Icon name="delete" size={14} />
                </Button>
            </div>
        </div>
    );
}

function DepSection({
    title,
    deps,
    projectPath,
    pm,
    onRefresh,
}: {
    title: string;
    deps: PackageDep[];
    projectPath: string;
    pm: string;
    onRefresh: () => void;
}) {
    if (deps.length === 0) return null;
    return (
        <div className="mb-3">
            <div className="text-xs font-medium text-text-muted uppercase tracking-wide px-2 py-1">{title}</div>
            <div className="space-y-0.5">
                {deps.map((dep) => (
                    <DepRow key={`${title}-${dep.name}`} dep={dep} projectPath={projectPath} pm={pm} onRefresh={onRefresh} />
                ))}
            </div>
        </div>
    );
}

export default function PackagesPanel() {
    const { project_path } = useProjectState();
    const [info, setInfo] = useState<PackageInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [installName, setInstallName] = useState("");
    const [installDev, setInstallDev] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [pmField, setPmField] = useState<string | undefined>();
    const pm = resolvePackageManager(project_path, pmField);

    const load = useCallback(async () => {
        if (!project_path) {
            setInfo(null);
            return;
        }
        setLoading(true);
        try {
            let pmFieldLocal: string | undefined;
            try {
                const pkgPath = `${project_path}\\package.json`.replace(/\//g, "\\");
                const content = await commands.readFile(pkgPath);
                const pkg = JSON.parse(content) as { packageManager?: string };
                pmFieldLocal = pkg.packageManager;
                setPmField(pkg.packageManager);
            } catch {
                pmFieldLocal = undefined;
                setPmField(undefined);
            }
            const resolvedPm = resolvePackageManager(project_path, pmFieldLocal);
            const data = await commands.getPackageInfo(project_path, resolvedPm);
            setInfo(data);
        } catch (e) {
            setInfo(null);
            if (!String(e).includes("package.json")) {
                notify.error("Packages", String(e));
            }
        } finally {
            setLoading(false);
        }
    }, [project_path]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleInstall = async () => {
        if (!project_path || !installName.trim()) return;
        setInstalling(true);
        try {
            await commands.npmInstall(project_path, installName.trim(), installDev, pm);
            notify.success("Packages", `Installed ${installName.trim()}`);
            setInstallName("");
            void load();
        } catch (e) {
            notify.error("Install failed", String(e));
        } finally {
            setInstalling(false);
        }
    };

    const handleInstallAll = async () => {
        if (!project_path) return;
        setInstalling(true);
        try {
            await commands.runInstallAll(project_path, pm);
            notify.success("Packages", "Dependencies installed");
            void load();
        } catch (e) {
            notify.error("Install failed", String(e));
        } finally {
            setInstalling(false);
        }
    };

    if (!project_path) {
        return <div className="p-3 text-xs text-text-muted">Open a project to manage packages.</div>;
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle/30">
                <div className="min-w-0">
                    <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">Packages</span>
                    {info?.name && (
                        <div className="text-xs text-text-muted truncate">
                            {info.name} {info.version ? `v${info.version}` : ""} · {pm}
                        </div>
                    )}
                </div>
                <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => void handleInstallAll()} title="Run install" disabled={installing}>
                        <Icon name="download" size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => void load()} title="Refresh">
                        <Icon name="refresh" size={14} />
                    </Button>
                </div>
            </div>

            <div className="px-2 py-2 border-b border-border-subtle/30 flex gap-1 items-center">
                <Input
                    placeholder="Package name..."
                    value={installName}
                    onChange={(e) => setInstallName(e.target.value)}
                    className="h-7 text-xs flex-1"
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void handleInstall();
                    }}
                />
                <Button
                    variant={installDev ? "default" : "secondary"}
                    size="sm"
                    className="h-7 text-xs px-2 shrink-0"
                    onClick={() => setInstallDev(!installDev)}
                >
                    dev
                </Button>
                <Button
                    size="sm"
                    className="h-7 text-xs px-2 shrink-0"
                    disabled={!installName.trim() || installing}
                    onClick={() => void handleInstall()}
                >
                    Install
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {loading && <div className="text-xs text-text-muted px-2 py-1">Loading...</div>}
                {!loading && !info && (
                    <div className="text-xs text-text-muted px-2 py-1">No package.json found in this project.</div>
                )}
                {info && (
                    <>
                        <DepSection title="Dependencies" deps={info.dependencies} projectPath={project_path} pm={pm} onRefresh={load} />
                        <DepSection title="Dev Dependencies" deps={info.dev_dependencies} projectPath={project_path} pm={pm} onRefresh={load} />
                    </>
                )}
            </div>
        </div>
    );
}

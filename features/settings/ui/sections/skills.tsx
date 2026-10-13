"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectState } from "@/lib/backend/project-state";
import { addSkill, listSkills, removeSkill, subscribeSkills, type Skill } from "@/lib/chat/skills";
import { countDismissedFiles, restoreDismissedFiles, type DiscoveredSkill } from "@/lib/chat/discover-skills";
import {
    ensureFreshScan,
    importDiscoveredSkill,
    dismissSkillRow,
    refreshSkillIndex,
    useSkillIndex,
} from "@/lib/chat/skill-index";
import {
    addCustomSkillFolder,
    getHomeDir,
    listCustomSkillFolders,
    removeCustomSkillFolder,
    subscribeCustomSkillFolders,
} from "@/lib/chat/skill-folders";
import { displaySkillPath } from "@/lib/chat/skill-paths";
import { SettingActionRow, SettingCard, SettingRow, SettingSection } from "../shared/controls";
import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
import { ArrowSync20Regular } from "@fluentui/react-icons/headless/svg/arrow-sync";
import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { Document20Regular } from "@fluentui/react-icons/headless/svg/document";
import { Folder20Regular } from "@fluentui/react-icons/headless/svg/folder";
import { MoreHorizontal20Regular } from "@fluentui/react-icons/headless/svg/more-horizontal";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";

/** Where a row came from, e.g. `.claude/skills` or `~/.claude/skills`. */
function sourceLabel(item: DiscoveredSkill): string {
    const scope = item.scope === "project" ? "project" : item.scope === "user" ? "personal" : "folder";
    return `${item.rootLabel} · ${scope}`;
}

/** Second line for a discovered row: file, source, status, and duplicates. */
function rowDescription(item: DiscoveredSkill): string {
    const status = item.status === "changed" ? "Already imported — reimport to replace" : "Not yet imported";
    const shadowed = item.shadowed.length > 0 ? `  ·  also in ${item.shadowed.join(", ")}` : "";
    const description = item.description ? `${item.description}  ·  ` : "";
    return `${description}${item.relPath}  ·  ${sourceLabel(item)}  ·  ${status}${shadowed}`;
}

/**
 * Settings → Skills. Lists the saved skills, the skill folders Shape scans, and
 * every skill file found in them (project, personal, and picked folders).
 */
export function SkillsSettings() {
    const { project_path: projectPath } = useProjectState();
    const [skills, setSkills] = useState<Skill[]>(() => listSkills());
    const [folders, setFolders] = useState<string[]>(() => listCustomSkillFolders());
    const [homeDir, setHomeDir] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Discoveries are cached in a shared index; this keeps them in step with
    // the open project, the folder list, and anything the user dismissed.
    const { scan, scanning: busy, error } = useSkillIndex();

    useEffect(() => subscribeSkills(() => setSkills(listSkills())), []);
    useEffect(() => subscribeCustomSkillFolders(() => setFolders(listCustomSkillFolders())), []);
    useEffect(() => {
        void getHomeDir().then(setHomeDir);
    }, []);
    useEffect(() => {
        ensureFreshScan();
    }, [projectPath, folders]);
    /** Rows read from the project that is open right now. */
    const rows = useMemo(
        () => (scan?.items ?? []).filter((item) => item.projectPath === (projectPath ?? "")),
        [scan, projectPath]
    );

    // Counted during render rather than stored: the panel re-renders whenever a
    // scan finishes or the project changes, which is exactly when the stored
    // dismissals can have changed.
    const dismissedCount = countDismissedFiles(projectPath ?? "");

    async function pickFolder() {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const picked = await open({
            directory: true,
            multiple: false,
            title: "Select a folder with skills",
        });
        if (typeof picked !== "string" || !picked) return;
        setFolders(addCustomSkillFolder(picked));
    }

    return (
        <SettingSection
            id="settings-skills"
            title="Skills"
            description="Markdown the agent follows when you @mention it."
        >
            <input
                ref={inputRef}
                type="file"
                accept=".md,.markdown,.mdc,text/markdown"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void file.text().then((body) => {
                        if (!body.trim()) return;
                        addSkill(file.name, body);
                    });
                }}
            />
            <SettingCard>
                {skills.length > 0 && skills.map((skill) => (
                    <SettingRow
                        key={skill.id}
                        icon={Document20Regular}
                        title={skill.name}
                        description={"@skill:" + skill.id}
                    >
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-7" aria-label={"Skill actions for " + skill.name}>
                                    <Icon icon={MoreHorizontal20Regular} />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => removeSkill(skill.id)}>
                                    Remove
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SettingRow>
                ))}
                {folders.map((folder) => (
                    <SettingRow
                        key={folder}
                        icon={Folder20Regular}
                        title={displaySkillPath(folder, projectPath, homeDir)}
                        description="Skills folder · scanned for SKILL.md files"
                    >
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={"Stop scanning " + folder}
                            onClick={() => setFolders(removeCustomSkillFolder(folder))}
                        >
                            <Icon icon={Dismiss20Regular} />
                        </Button>
                    </SettingRow>
                ))}
                <div className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-text-muted uppercase">
                    <span>Discovered</span>
                    <span className="text-text-muted">&middot;</span>
                    <span className="text-xs font-normal normal-case">.claude, .agents, .github, .shape and your folders</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 ml-auto"
                        aria-label="Scan for new skills"
                        disabled={busy}
                        onClick={() => void refreshSkillIndex()}
                    >
                        <Icon icon={ArrowSync20Regular} className={cn(busy && "animate-spin")} />
                    </Button>
                </div>
                {error && !busy ? (
                    <div className="px-3.5 pb-2.5 text-xs text-text-muted">{error}</div>
                ) : null}
                {rows.length === 0 && !error ? (
                    <div className="px-3.5 pb-2.5 text-xs text-text-muted">
                        {busy
                            ? "Scanning for skill files…"
                            : projectPath
                              ? "No new skill files found."
                              : "Open a folder to discover project skills — personal folders are scanned anyway."}
                    </div>
                ) : rows.map((d) => (
                    <SettingRow
                        key={d.relPath}
                        icon={Document20Regular}
                        title={d.name}
                        description={rowDescription(d)}
                    >
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs"
                                aria-label={d.status === "changed" ? ("Update " + d.name) : ("Import " + d.name)}
                                onClick={() => importDiscoveredSkill(d)}
                            >
                                {d.status === "changed" ? "Update" : "Import"}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label={"Dismiss " + d.name}
                                onClick={() => dismissSkillRow(d)}
                            >
                                <Icon icon={Dismiss20Regular} />
                            </Button>
                        </div>
                    </SettingRow>
                ))}
                {dismissedCount > 0 && (
                    <SettingActionRow
                        title={`Restore ${dismissedCount} dismissed`}
                        icon={ArrowSync20Regular}
                        onClick={() => {
                            restoreDismissedFiles(projectPath ?? "");
                            void refreshSkillIndex();
                        }}
                    />
                )}
                <SettingActionRow title="Add skill folder" icon={Folder20Regular} onClick={() => void pickFolder()} />
                <SettingActionRow title="Add skill" icon={Add20Regular} onClick={() => inputRef.current?.click()} />
            </SettingCard>
        </SettingSection>
    );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectState } from "@/lib/backend/project-state";
import { addSkill, listSkills, removeSkill, subscribeSkills, type Skill } from "@/lib/chat/skills";
import { discoverSkills, dismissDiscoveredFile, type SkillScan } from "@/lib/chat/discover-skills";
import { SettingActionRow, SettingCard, SettingRow, SettingSection } from "../shared/controls";
import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
import { ArrowSync20Regular } from "@fluentui/react-icons/headless/svg/arrow-sync";
import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { Document20Regular } from "@fluentui/react-icons/headless/svg/document";
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

/** Scan result for a project with no rows (a scan that failed, or none open). */
function emptyScan(projectPath: string | null): SkillScan {
    return { projectPath, items: [] };
}

/**
 * Settings → Skills. Lists the saved skills and scans the project's `.agents/`
 * and `.claude/` directories for skill files that can be imported.
 */
export function SkillsSettings() {
    const { project_path: projectPath } = useProjectState();
    const [skills, setSkills] = useState<Skill[]>(() => listSkills());
    const [scan, setScan] = useState<SkillScan | null>(null);
    // Spinner for manual refreshes. A project change does not need one: its
    // rows stop matching `projectPath`, so the panel scans again on its own.
    const [refreshing, setRefreshing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const scanGen = useRef(0);

    useEffect(() => subscribeSkills(() => setSkills(listSkills())), []);

    /** Record a scan, ignoring results from a superseded scan. */
    const applyScan = useCallback((token: number, result: SkillScan) => {
        if (token !== scanGen.current) return;
        setScan(result);
        setRefreshing(false);
    }, []);

    /** Drop one discovered row after an Import or Dismiss, without rescanning. */
    const removeDiscoveredRow = useCallback((relPath: string) => {
        setScan((current) =>
            current ? { ...current, items: current.items.filter((item) => item.relPath !== relPath) } : current
        );
    }, []);

    /** Rescan the open project for skill files (refresh button). */
    const refresh = useCallback(async () => {
        setRefreshing(true);
        const token = ++scanGen.current;
        try {
            applyScan(token, await discoverSkills());
        } catch {
            applyScan(token, emptyScan(projectPath));
        }
    }, [applyScan, projectPath]);

    useEffect(() => {
        // Reruns when the open project changes, and the token invalidates any
        // scan still in flight for the previous one.
        const token = ++scanGen.current;
        void discoverSkills()
            .then((result) => applyScan(token, result))
            .catch(() => applyScan(token, emptyScan(projectPath)));
    }, [applyScan, projectPath]);

    // Rows are only offered for the project the scan actually read.
    const discovered = scan && scan.projectPath === projectPath ? scan.items : [];
    const scanning = refreshing || !scan || scan.projectPath !== projectPath;

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
                <div className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-text-muted uppercase">
                    <span>Discovered</span>
                    <span className="text-text-muted">&middot;</span>
                    <span className="text-xs font-normal normal-case">From .agents and .claude</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 ml-auto"
                        aria-label="Scan for new skills"
                        disabled={scanning}
                        onClick={() => void refresh()}
                    >
                        <Icon icon={ArrowSync20Regular} className={cn(scanning && "animate-spin")} />
                    </Button>
                </div>
                {discovered.length === 0 ? (
                    <div className="px-3.5 pb-2.5 text-xs text-text-muted">
                        {scanning
                            ? "Scanning for skill files…"
                            : projectPath
                              ? "No skill files found in .agents or .claude."
                              : "Open a folder to discover skills."}
                    </div>
                ) : discovered.map((d) => (
                    <SettingRow
                        key={d.relPath}
                        icon={Document20Regular}
                        title={d.name}
                        description={d.relPath + "  —  " + (d.status === "changed" ? "Already imported — reimport to replace" : "Not yet imported")}
                    >
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs"
                                aria-label={d.status === "changed" ? ("Update " + d.name) : ("Import " + d.name)}
                                onClick={() => {
                                    addSkill(d.name, d.body);
                                    removeDiscoveredRow(d.relPath);
                                }}
                            >
                                {d.status === "changed" ? "Update" : "Import"}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label={"Dismiss " + d.name}
                                onClick={() => {
                                    dismissDiscoveredFile(d.projectPath, d.relPath);
                                    removeDiscoveredRow(d.relPath);
                                }}
                            >
                                <Icon icon={Dismiss20Regular} />
                            </Button>
                        </div>
                    </SettingRow>
                ))}
                <SettingActionRow title="Add skill" icon={Add20Regular} onClick={() => inputRef.current?.click()} />
            </SettingCard>
        </SettingSection>
    );
}

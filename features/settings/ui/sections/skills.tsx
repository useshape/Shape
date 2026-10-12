"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addSkill, listSkills, removeSkill, subscribeSkills, type Skill } from "@/lib/chat/skills";
import { discoverSkills, dismissDiscoveredFile, type DiscoveredSkill } from "@/lib/chat/discover-skills";
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

/**
 * Settings → Skills. Lists the saved skills and scans the project's `.agents/`
 * and `.claude/` directories for skill files that can be imported.
 */
export function SkillsSettings() {
    const [skills, setSkills] = useState<Skill[]>(() => listSkills());
    const [discovered, setDiscovered] = useState<DiscoveredSkill[]>([]);
    // A scan runs on mount, so the panel starts in the scanning state and the
    // mount effect never needs to set state synchronously.
    const [scanning, setScanning] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);
    const scanGen = useRef(0);

    useEffect(() => subscribeSkills(() => setSkills(listSkills())), []);

    /** Apply scan results, ignoring results from a superseded scan. */
    const applyScan = useCallback((token: number, result: DiscoveredSkill[]) => {
        if (token !== scanGen.current) return;
        setDiscovered(result);
        setScanning(false);
    }, []);

    /** Rescan the project for skill files (refresh button). */
    const refresh = useCallback(async () => {
        setScanning(true);
        const token = ++scanGen.current;
        try {
            applyScan(token, await discoverSkills());
        } catch {
            applyScan(token, []);
        }
    }, [applyScan]);

    useEffect(() => {
        const token = ++scanGen.current;
        void discoverSkills()
            .then((result) => applyScan(token, result))
            .catch(() => applyScan(token, []));
    }, [applyScan]);

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
                        {scanning ? "Scanning for skill files…" : "No skill files found in .agents or .claude."}
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
                                    setDiscovered((current) => current.filter((item) => item.relPath !== d.relPath));
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
                                    setDiscovered((current) => current.filter((item) => item.relPath !== d.relPath));
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

"use client";

import { useEffect, useRef, useState } from "react";
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

export function SkillsSettings() {
    const [skills, setSkills] = useState<Skill[]>(() => listSkills());
    const [discovered, setDiscovered] = useState<DiscoveredSkill[]>([]);
    const [scanning, setScanning] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    let scanGen = 0;

    useEffect(() => subscribeSkills(() => setSkills(listSkills())), []);

    async function scan() {
        const gen = ++scanGen;
        setScanning(true);
        try {
            const result = await discoverSkills();
            if (gen === scanGen) setDiscovered(result);
        } catch {
            if (gen === scanGen) setDiscovered([]);
        } finally {
            if (gen === scanGen) setScanning(false);
        }
    }

    useEffect(() => { void scan(); }, []);

    return (
        <SettingSection
            id="settings-skills"
            title="Skills"
            description="Markdown the agent follows when you @mention it."
        >
            <input
                ref={inputRef}
                type="file"
                accept=".md,.markdown,text/markdown,text/plain"
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
                {discovered.length > 0 && (
                    <>
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
                                onClick={() => void scan()}
                            >
                                <Icon icon={ArrowSync20Regular} className={cn(scanning && "animate-spin")} />
                            </Button>
                        </div>
                        {discovered.map((d) => (
                            <SettingRow
                                key={d.fileName}
                                icon={Document20Regular}
                                title={d.name}
                                description={d.sourceDir + "/" + d.fileName + "  —  " + (d.status === "changed" ? "Updated on disk — reimport to apply" : "Not yet imported")}
                            >
                                <div className="flex items-center gap-1.5">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs"
                                        aria-label={d.status === "changed" ? ("Update " + d.name) : ("Import " + d.name)}
                                        onClick={() => {
                                            addSkill(d.name, d.body);
                                            setDiscovered(discovered.filter((x) => x.fileName !== d.fileName));
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
                                            dismissDiscoveredFile(d.fileName);
                                            setDiscovered(discovered.filter((x) => x.fileName !== d.fileName));
                                        }}
                                    >
                                        <Icon icon={Dismiss20Regular} />
                                    </Button>
                                </div>
                            </SettingRow>
                        ))}
                    </>
                )}
                <SettingActionRow title="Add skill" icon={Add20Regular} onClick={() => inputRef.current?.click()} />
            </SettingCard>
        </SettingSection>
    );
}
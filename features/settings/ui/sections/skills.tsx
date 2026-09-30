"use client";

import { useEffect, useRef, useState } from "react";
import { addSkill, listSkills, removeSkill, subscribeSkills, type Skill } from "@/lib/chat/skills";
import { SettingActionRow, SettingCard, SettingRow, SettingSection } from "../shared/controls";
import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
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

export function SkillsSettings() {
    const [skills, setSkills] = useState<Skill[]>(() => listSkills());
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => subscribeSkills(() => setSkills(listSkills())), []);

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
                {skills.map((skill) => (
                    <SettingRow
                        key={skill.id}
                        icon={Document20Regular}
                        title={skill.name}
                        description={`@skill:${skill.id}`}
                    >
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-7" aria-label={`Skill actions for ${skill.name}`}>
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
                <SettingActionRow title="Add skill" icon={Add20Regular} onClick={() => inputRef.current?.click()} />
            </SettingCard>
        </SettingSection>
    );
}

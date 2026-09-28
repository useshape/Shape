"use client";

export type Skill = {
    id: string;
    name: string;
    body: string;
};

const KEY = "shape-skills";
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

export function subscribeSkills(cb: () => void) {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

export function listSkills(): Skill[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(KEY);
        const parsed = raw ? (JSON.parse(raw) as Skill[]) : [];
        return Array.isArray(parsed) ? parsed.filter((s) => s && s.id && s.body) : [];
    } catch {
        return [];
    }
}

export function skillBySlug(slug: string): Skill | undefined {
    const key = slug.trim().toLowerCase();
    return listSkills().find((skill) => skill.id === key || skill.name.toLowerCase() === key);
}

function save(next: Skill[]) {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    emit();
}

export function addSkill(name: string, body: string): Skill {
    const trimmed = body.trim();
    const title = name.replace(/\.md$/i, "").trim() || "Skill";
    const id = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "skill";
    const skill: Skill = { id, name: title, body: trimmed };
    const rest = listSkills().filter((item) => item.id !== id);
    save([skill, ...rest]);
    return skill;
}

export function removeSkill(id: string) {
    save(listSkills().filter((skill) => skill.id !== id));
}

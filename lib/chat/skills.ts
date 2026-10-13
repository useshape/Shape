"use client";

export type Skill = {
    id: string;
    name: string;
    body: string;
};

const KEY = "shape-skills";
/** File extensions dropped from skill names (discovery + manual import). */
const SKILL_FILE_EXTENSION_RE = /\.(md|mdc)$/i;
const listeners = new Set<() => void>();

/** Notify every `subscribeSkills` listener that the skill list changed. */
function emit() {
    for (const listener of listeners) listener();
}

/**
 * Subscribe to changes in the saved skill list.
 * Returns an unsubscribe function for effect cleanup.
 */
export function subscribeSkills(cb: () => void) {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

/**
 * Display title for a skill name or skill file name: the name with a
 * supported file extension removed (`notes.md` → `notes`).
 */
export function skillTitle(name: string): string {
    return name.replace(SKILL_FILE_EXTENSION_RE, "").trim() || "Skill";
}

/**
 * Stable slug a skill is persisted under (`My Skill` → `my-skill`). Skill
 * discovery matches files with this same slug, so a file that would replace an
 * already saved skill is classified as an update instead of a fresh import.
 */
export function skillIdFromName(name: string): string {
    return (
        skillTitle(name)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "skill"
    );
}

/**
 * Read saved skills from localStorage. Records without an ID, a usable name,
 * or a body are skipped so callers can rely on both fields being present.
 */
export function listSkills(): Skill[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(KEY);
        const parsed = raw ? (JSON.parse(raw) as Skill[]) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (skill) =>
                skill &&
                typeof skill.id === "string" &&
                skill.id.trim() !== "" &&
                typeof skill.name === "string" &&
                skill.name.trim() !== "" &&
                typeof skill.body === "string"
        );
    } catch {
        return [];
    }
}

/** Find a saved skill by its ID or its display name (case-insensitive). */
export function skillBySlug(slug: string): Skill | undefined {
    const key = slug.trim().toLowerCase();
    return listSkills().find((skill) => skill.id === key || skill.name.toLowerCase() === key);
}

/** Persist the skill list and notify subscribers. */
function save(next: Skill[]) {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    emit();
}

/**
 * Add a skill, or replace the skill that already uses the resulting ID, and
 * return the saved record. The file extension is dropped from the name.
 */
export function addSkill(name: string, body: string): Skill {
    const title = skillTitle(name);
    const id = skillIdFromName(title);
    const skill: Skill = { id, name: title, body: body.trim() };
    const rest = listSkills().filter((item) => item.id !== id);
    save([skill, ...rest]);
    return skill;
}

/** Remove the saved skill with the given ID. */
export function removeSkill(id: string) {
    save(listSkills().filter((skill) => skill.id !== id));
}

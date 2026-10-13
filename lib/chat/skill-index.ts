"use client";

import { useSyncExternalStore } from "react";
import { getProjectPath, subscribeProjectState } from "@/lib/backend/project-state";
import { commands } from "@/lib/backend/commands";
import { subscribeCustomSkillFolders } from "@/lib/chat/skill-folders";
import {
    discoverSkills,
    dismissDiscoveredFile,
    reconcileImportedRow,
    type DiscoveredSkill,
    type SkillScan,
} from "@/lib/chat/discover-skills";
import { parseSkillDocument } from "@/lib/chat/skill-frontmatter";
import { joinSkillPath } from "@/lib/chat/skill-paths";
import { addSkill, skillIdFromName, type Skill } from "@/lib/chat/skills";

/**
 * What the panel and the composer render: the last finished scan plus whether a
 * scan is running. Rows belong to `scan.projectPath`, so consumers compare that
 * with the open project before showing or importing them.
 */
export type SkillIndexSnapshot = {
    scan: SkillScan | null;
    scanning: boolean;
    /** Set when a scan throws. An empty list alone is a successful scan. */
    error: string | null;
};

const EMPTY: SkillIndexSnapshot = { scan: null, scanning: false, error: null };

let snapshot: SkillIndexSnapshot = EMPTY;
let inFlight: Promise<void> | null = null;
let generation = 0;
/** Project the in-flight scan is reading, so callers do not start a second one. */
let runningFor: string | null | undefined;
const listeners = new Set<() => void>();

/** Swap the snapshot reference so subscribers re-render. */
function emit(next: SkillIndexSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
}

/** Subscribe to discovery results (`useSkillIndex` uses this). */
export function subscribeSkillIndex(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Current discovery snapshot. A pure read — call `ensureFreshScan()` from effects. */
export function getSkillIndex(): SkillIndexSnapshot {
    return snapshot;
}

/** React hook over the discovery snapshot. */
export function useSkillIndex(): SkillIndexSnapshot {
    return useSyncExternalStore(subscribeSkillIndex, getSkillIndex, getSkillIndex);
}

/** Rows discovered for the project that is open right now. */
export function getCurrentProjectDiscoveries(): DiscoveredSkill[] {
    const { scan } = getSkillIndex();
    if (!scan || scan.projectPath !== getProjectPath()) return [];
    return scan.items;
}

/** True while this project's rows are missing or being (re)scanned. */
export function isSkillIndexScanning(): boolean {
    const { scan, scanning } = getSkillIndex();
    return scanning || !scan || scan.projectPath !== getProjectPath();
}

/**
 * Scan again and publish the result. A result is dropped when a newer scan has
 * started — another refresh, a project switch, or an import that must not be
 * undone by a slower scan.
 */
export function refreshSkillIndex(): Promise<void> {
    initSkillIndex();
    const token = ++generation;
    const projectPath = getProjectPath();
    runningFor = projectPath;
    emit({ ...snapshot, scanning: true });
    inFlight = discoverSkills({ supersede: true })
        .then((result) => {
            if (token !== generation) return;
            runningFor = undefined;
            emit({ scan: result, scanning: false, error: null });
        })
        .catch(() => {
            if (token !== generation) return;
            runningFor = undefined;
            const previous = snapshot.scan?.projectPath === projectPath ? snapshot.scan : { projectPath, items: [] };
            emit({
                scan: previous,
                scanning: false,
                error: "Could not scan skill folders.",
            });
        });
    return inFlight;
}

/** Start a scan when there is no result yet for the project that is open. */
export function ensureFreshScan(): void {
    initSkillIndex();
    const projectPath = getProjectPath();
    if (runningFor === projectPath) return;
    if (snapshot.scan && snapshot.scan.projectPath === projectPath) return;
    void refreshSkillIndex();
}

/** Import a discovered row into the Shape library. */
export function importDiscoveredSkill(item: DiscoveredSkill): Skill {
    const saved = addSkill(item.name, item.body);
    // A refresh started before this click would re-offer the row it captured.
    generation += 1;
    runningFor = undefined;
    const scan = snapshot.scan;
    emit({
        scan: scan ? { ...scan, items: reconcileImportedRow(scan.items, item.relPath, saved) } : scan,
        scanning: false,
        error: snapshot.error,
    });
    return saved;
}

/** Dismiss a discovered row and drop it from the index. */
export function dismissSkillRow(item: DiscoveredSkill): void {
    dismissDiscoveredFile(item.projectPath, item.relPath);
    generation += 1;
    runningFor = undefined;
    const scan = snapshot.scan;
    emit({
        scan: scan ? { ...scan, items: scan.items.filter((row) => row.relPath !== item.relPath) } : scan,
        scanning: false,
        error: snapshot.error,
    });
}

/**
 * Look up a skill that only exists on disk, by ID, for `@skill:` mentions. The
 * file is read fresh so an edited skill is always the one used, and skills the
 * user dismissed in the panel are still resolvable when asked for by name.
 */
export async function resolveDiscoveredSkill(skillId: string): Promise<DiscoveredSkill | null> {
    const row = await findDiscoveredSkill(skillId, { includeUnchanged: true });
    if (!row) return null;
    return readDiscoveredSkill(row);
}

/**
 * Resolve the skill file the user picked. `relPath` is the discovery identity
 * (`.claude/skills/pdf/SKILL.md`), not the shared slug, so a later row with the
 * same name does not read an earlier file.
 */
export async function resolveDiscoveredSkillBySource(relPath: string): Promise<DiscoveredSkill | null> {
    const scan = await currentScan();
    let row = scan.find((item) => item.relPath === relPath);
    if (!row) {
        const full = await discoverSkills({ ignoreDismissals: true, includeUnchanged: true });
        row = full.items.find((item) => item.relPath === relPath);
    }
    if (!row) return null;
    return readDiscoveredSkill(row);
}

/**
 * Find a discovered row for `skillId`, preferring the highest-precedence root.
 * `includeUnchanged` keeps skills whose body already matches the library, which
 * `@skill:` resolution needs but the panel hides.
 */
async function findDiscoveredSkill(skillId: string, options: { includeUnchanged: boolean }): Promise<DiscoveredSkill | null> {
    const scan = await currentScan();
    const match = scan.find((item) => skillIdFromName(item.name) === skillId);
    if (match) return match;
    if (!options.includeUnchanged) return null;

    const full = await discoverSkills({ ignoreDismissals: true, includeUnchanged: true });
    return full.items.find((item) => skillIdFromName(item.name) === skillId) ?? null;
}

/** Wait for the index scan, or start one, and return its rows. */
async function currentScan(): Promise<DiscoveredSkill[]> {
    ensureFreshScan();
    if (inFlight) await inFlight;
    const { scan } = snapshot;
    return scan && scan.projectPath === getProjectPath() ? scan.items : [];
}

/**
 * Read a discovered file's current contents from disk, parsed. Used by mention
 * resolution so an edited skill file is always the one that runs.
 */
export async function readDiscoveredSkill(item: DiscoveredSkill): Promise<DiscoveredSkill | null> {
    let raw: string;
    try {
        raw = await commands.readFileWithin(joinSkillPath(item.folder, item.fileName), item.folder);
    } catch {
        return null;
    }
    const parsed = parseSkillDocument(raw, item.name);
    if (!parsed.body) return null;
    return { ...item, name: parsed.name, description: parsed.description, body: parsed.body };
}

let subscriptions: (() => void)[] = [];

/**
 * Rescan when the open project changes, so the panel never shows rows from
 * another project, and when the user adds or removes a skill folder.
 *
 * Registered on the first scan rather than at import time: importing the index
 * must stay free of backend calls (`@skill:` resolution lives in the same
 * mention pipeline that must not touch the backend for other mention kinds).
 */
function initSkillIndex(): void {
    if (subscriptions.length > 0) return;
    subscriptions = [
        subscribeProjectState(() => {
            if (getProjectPath() !== snapshot.scan?.projectPath) void refreshSkillIndex();
        }),
        subscribeCustomSkillFolders(() => {
            void refreshSkillIndex();
        }),
    ];
}

/** Drop cached discovery state (tests). */
export function resetSkillIndex(): void {
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions = [];
    generation += 1;
    inFlight = null;
    runningFor = undefined;
    snapshot = EMPTY;
}

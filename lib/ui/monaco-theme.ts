"use client";

/** Agent window: Monaco removed — keep no-op theme helpers for leftover call sites. */

export function defineShapeMonacoThemes(_monaco?: unknown): void {
    // no-op
}

export function shapeMonacoThemeFromColorTheme(): string {
    return "shape-dark";
}

export function getMonacoEditorOptions(): Record<string, unknown> {
    return {};
}

export function refreshShapeMonacoTheme(): void {
    // no-op
}

export async function applyShapeMonacoThemeEverywhere(): Promise<void> {
    // no-op
}

export function guardShapeMonacoTheme(): void {
    // no-op
}

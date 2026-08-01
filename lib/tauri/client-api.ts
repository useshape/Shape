"use client";

/**
 * Static Tauri API re-exports for the desktop client.
 *
 * Dynamic `import("@tauri-apps/api/...")` in Next/Turbopack can emit separate
 * async chunks that fail to load in secondary webview windows (Settings, Git, …).
 * Import from here instead so Tauri ships in the parent client bundle.
 */
export { WebviewWindow } from "@tauri-apps/api/webviewWindow";
export { emit, listen } from "@tauri-apps/api/event";
export { getCurrentWindow, getAllWindows } from "@tauri-apps/api/window";
export { invoke, convertFileSrc } from "@tauri-apps/api/core";
export { getVersion, getName } from "@tauri-apps/api/app";

"use client";

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getSettings, type UpdateChannel } from "@/lib/settings";
import { isTauriRuntime } from "@/lib/tauri-window";

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string; notes: string }
  | { kind: "downloading"; version: string; progress: number }
  | { kind: "ready"; version: string }
  | { kind: "upToDate" }
  | { kind: "error"; message: string };

type Listener = () => void;

let status: UpdateStatus = { kind: "idle" };
let pendingUpdate: Update | null = null;
let checking = false;
let dismissedVersion: string | null = null;
const DISMISS_KEY = "shape-update-dismissed-version";
const listeners = new Set<Listener>();

function loadDismissedVersion(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function persistDismissedVersion(version: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (version) localStorage.setItem(DISMISS_KEY, version);
    else localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

dismissedVersion = loadDismissedVersion();

function emit() {
  for (const l of listeners) l();
}

function setStatus(next: UpdateStatus) {
  status = next;
  emit();
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

export function subscribeUpdateStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hide the titlebar chip until a newer version is published. */
export function dismissAvailableUpdate(): void {
  if (status.kind !== "available") return;
  dismissedVersion = status.version;
  persistDismissedVersion(status.version);
  pendingUpdate = null;
  setStatus({ kind: "idle" });
}

export async function checkForAppUpdates(options?: {
  silent?: boolean;
  force?: boolean;
  channel?: UpdateChannel;
}): Promise<UpdateStatus> {
  if (typeof window === "undefined") return status;
  if (!isTauriRuntime()) {
    if (!options?.silent) {
      setStatus({ kind: "error", message: "Updates are only available in the desktop app." });
    }
    return status;
  }

  const settings = getSettings().updates;
  if (!settings.autoUpdate && !options?.force) {
    return status;
  }

  if (checking) return status;
  checking = true;
  if (!options?.silent) setStatus({ kind: "checking" });

  try {
    const channel = options?.channel ?? settings.channel;
    const update = await check({
      headers: {
        "X-Shape-Update-Channel": channel,
      },
    });
    if (!update) {
      pendingUpdate = null;
      setStatus({ kind: "upToDate" });
      return status;
    }
    if (dismissedVersion && dismissedVersion === update.version) {
      pendingUpdate = null;
      setStatus({ kind: "idle" });
      return status;
    }
    if (dismissedVersion && dismissedVersion !== update.version) {
      dismissedVersion = null;
      persistDismissedVersion(null);
    }
    pendingUpdate = update;
    setStatus({
      kind: "available",
      version: update.version,
      notes: update.body ?? "",
    });
    return status;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update check failed";
    if (!options?.silent) {
      setStatus({ kind: "error", message });
      void import("@/lib/errors/catalog").then(({ notifyCatalogError, SHAPE_ERRORS }) => {
        notifyCatalogError(SHAPE_ERRORS.UPDATE_FAILED, message);
      });
    }
    return status;
  } finally {
    checking = false;
  }
}

export async function downloadAndInstallUpdate(): Promise<void> {
  try {
    if (!pendingUpdate) {
      await checkForAppUpdates({ force: true });
    }
    const update = pendingUpdate;
    if (!update) {
      setStatus({ kind: "error", message: "No update available to install." });
      return;
    }

    setStatus({ kind: "downloading", version: update.version, progress: 0 });
    let downloaded = 0;
    let total = 0;

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0;
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        const progress = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
        setStatus({ kind: "downloading", version: update.version, progress });
      } else if (event.event === "Finished") {
        setStatus({ kind: "ready", version: update.version });
      }
    });

    setStatus({ kind: "ready", version: update.version });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update install failed";
    setStatus({ kind: "error", message });
    void import("@/lib/errors/catalog").then(({ notifyCatalogError, SHAPE_ERRORS }) => {
      notifyCatalogError(SHAPE_ERRORS.UPDATE_FAILED, message);
    });
  }
}

export async function relaunchToApplyUpdate(): Promise<void> {
  await relaunch();
}

export async function installUpdateAndRelaunch(): Promise<void> {
  await downloadAndInstallUpdate();
  if (getUpdateStatus().kind === "ready") {
    await relaunchToApplyUpdate();
  }
}

let autoCheckStarted = false;

/** Start background update checks (call once from the main workbench). */
export function startAutoUpdateChecks(): () => void {
  if (autoCheckStarted || typeof window === "undefined") return () => {};
  autoCheckStarted = true;

  const run = () => {
    const settings = getSettings().updates;
    if (!settings.autoUpdate) return;
    void checkForAppUpdates({ silent: true });
  };

  run();
  const id = window.setInterval(run, 4 * 60 * 60 * 1000);
  return () => {
    window.clearInterval(id);
    autoCheckStarted = false;
  };
}

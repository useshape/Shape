"use client";

import { useSyncExternalStore } from "react";
import {
  getUpdateStatus,
  subscribeUpdateStatus,
  downloadAndInstallUpdate,
  relaunchToApplyUpdate,
  dismissAvailableUpdate,
  type UpdateStatus,
} from "@/lib/updater";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

function labelFor(status: UpdateStatus): string | null {
  switch (status.kind) {
    case "available":
      return "Update available";
    case "downloading":
      return `Downloading ${status.progress}%`;
    case "ready":
      return "Restart to update";
    case "checking":
      return "Checking…";
    default:
      return null;
  }
}

export function TitlebarUpdateButton() {
  const status = useSyncExternalStore(subscribeUpdateStatus, getUpdateStatus, getUpdateStatus);
  const label = labelFor(status);
  if (!label) return null;

  const busy = status.kind === "checking" || status.kind === "downloading";
  const canDismiss = status.kind === "available";

  return (
    <div className="relative z-20 mx-1 flex h-6 max-w-[14rem] items-center rounded-sm text-xs text-text-primary">
      <button
        type="button"
        disabled={busy && status.kind === "checking"}
        className="flex h-full min-w-0 items-center rounded-sm px-2 transition-colors hover:bg-panel-hover disabled:opacity-70"
        title={
          status.kind === "available"
            ? `Update available: ${status.version}`
            : status.kind === "ready"
              ? "Restart Shape to finish updating"
              : label
        }
        onClick={() => {
          void (async () => {
            if (status.kind === "available" || status.kind === "error") {
              await downloadAndInstallUpdate();
            } else if (status.kind === "ready") {
              await relaunchToApplyUpdate();
            }
          })();
        }}
      >
        <span className="truncate">{label}</span>
      </button>
      {canDismiss ? (
        <button
          type="button"
          className="flex h-full w-5 shrink-0 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-panel-hover hover:text-text-primary"
          title="Dismiss"
          aria-label="Dismiss update"
          onClick={(e) => {
            e.stopPropagation();
            dismissAvailableUpdate();
          }}
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </div>
  );
}

export function UpgradeRequiredDialog({
  message,
  onUpdate,
}: {
  message: string;
  onUpdate: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-lg">
        <h2 className="text-base font-medium text-text-primary">Update required</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" onClick={onUpdate}>
            Update now
          </Button>
        </div>
      </div>
    </div>
  );
}

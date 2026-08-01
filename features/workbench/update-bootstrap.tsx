"use client";

import { useEffect, useState } from "react";
import { SHAPE_API_BASE } from "@/lib/shape-auth/api";
import { getSettings } from "@/lib/settings";
import { installUpdateAndRelaunch, startAutoUpdateChecks } from "@/lib/updater";
import { UpgradeRequiredDialog } from "@/features/workbench/titlebar/ui/update-button";
import { commands } from "@/lib/backend";

type CompatResult = {
  status: "ok" | "warn" | "blocked";
  message: string | null;
  downloadUrl: string;
};

async function getClientVersion(): Promise<string> {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "0.0.0-dev";
  }
}

export function UpdateBootstrap() {
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  useEffect(() => {
    const stop = startAutoUpdateChecks();
    return stop;
  }, []);

  useEffect(() => {
    const onRequired = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setBlockedMessage(detail?.message ?? "Please update Shape to continue.");
    };
    window.addEventListener("shape-upgrade-required", onRequired);
    return () => window.removeEventListener("shape-upgrade-required", onRequired);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const version = await getClientVersion();
        const channel = getSettings().updates.channel;
        const res = await fetch(`${SHAPE_API_BASE}/api/client/compat`, {
          headers: {
            "X-Shape-Client-Version": version,
            "X-Shape-Update-Channel": channel,
          },
        });
        const data = (await res.json()) as CompatResult;
        if (cancelled) return;
        if (data.status === "blocked") {
          setBlockedMessage(data.message ?? "Please update Shape to continue.");
        }
      } catch {
        // Offline / website down — don't block the IDE.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!blockedMessage) return null;

  return (
    <UpgradeRequiredDialog
      message={blockedMessage}
      onUpdate={() => {
        void (async () => {
          try {
            await installUpdateAndRelaunch();
          } catch {
            const download =
              `${SHAPE_API_BASE.replace(/\/$/, "")}/download`;
            void commands.openUrlExternal(download);
          }
        })();
      }}
    />
  );
}

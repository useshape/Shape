import { commands } from "@/lib/backend";

export type DesignLogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/** Writes design-mode diagnostics to the Tauri/dev terminal, not the in-app UI. */
export function designLog(level: DesignLogLevel, message: string, extra?: unknown) {
    let line = message;
    if (extra !== undefined) {
        try {
            line += ` ${JSON.stringify(extra)}`;
        } catch {
            line += " [unserializable]";
        }
    }
    void commands.designModeLog(level, line).catch(() => {});
}

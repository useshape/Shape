import { getSettings } from "@/lib/settings";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export type PackageManagerSetting = "auto" | PackageManager;

export function resolvePackageManager(
    projectPath: string | null,
    packageManagerField?: string,
): PackageManager {
    const setting = getSettings().node.packageManager;
    if (setting !== "auto") return setting;

    if (packageManagerField) {
        if (packageManagerField.startsWith("yarn")) return "yarn";
        if (packageManagerField.startsWith("pnpm")) return "pnpm";
        if (packageManagerField.startsWith("bun")) return "bun";
    }

    void projectPath;
    return "npm";
}

export function getConfiguredPackageManager(): PackageManager | "auto" {
    return getSettings().node.packageManager;
}

export function packageManagerLabel(pm: PackageManager): string {
    switch (pm) {
        case "yarn": return "yarn";
        case "pnpm": return "pnpm";
        case "bun": return "bun";
        default: return "npm";
    }
}

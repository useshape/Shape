import { convertFileSrc } from "@tauri-apps/api/core";

function isRemote(src: string): boolean {
    return /^(https?:|data:|blob:)/i.test(src);
}

export function resolveMarkdownImageUrls(
    src: string,
    filePath?: string,
    projectPath?: string | null,
): string[] {
    if (!src) return [];
    if (isRemote(src)) return [src];

    const urlObj = new URL(src, "http://localhost");
    const cleanPath = decodeURIComponent(urlObj.pathname);
    const paths: string[] = [];
    const safeProjectPath = projectPath ? projectPath.replace(/\\/g, "/").replace(/\/$/, "") : "";
    const basePath = filePath
        ? filePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/")
        : "";

    if (/^[a-zA-Z]:\//.test(cleanPath) || cleanPath.startsWith("//")) {
        paths.push(cleanPath.replace(/\//g, "\\"));
    } else if (cleanPath.startsWith("/") && safeProjectPath) {
        paths.push(`${safeProjectPath}${cleanPath}`);
        paths.push(`${safeProjectPath}/public${cleanPath}`);
        paths.push(`${safeProjectPath}/static${cleanPath}`);
        paths.push(`${safeProjectPath}/assets${cleanPath}`);
        paths.push(`${safeProjectPath}/src/assets${cleanPath}`);
    } else if (filePath && !cleanPath.startsWith("/") && !cleanPath.includes(":")) {
        paths.push(`${basePath}/${cleanPath}`);
        if (safeProjectPath) paths.push(`${safeProjectPath}/${cleanPath}`);
    }

    if (paths.length === 0) return [src];
    return paths.map((p) => {
        try {
            if (p.startsWith("diff:")) return p;
            return convertFileSrc(p);
        } catch {
            return p;
        }
    });
}

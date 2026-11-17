import { convertFileSrc } from "@/lib/tauri/client-api";

/** App-public URLs and data URIs stay as-is. Disk paths go through the asset protocol. */
export function mediaSrc(path: string): string {
    const raw = path.trim();
    if (!raw) return raw;
    if (
        raw.startsWith("data:")
        || raw.startsWith("blob:")
        || raw.startsWith("http://")
        || raw.startsWith("https://")
        || raw.startsWith("asset:")
        || raw.startsWith("tauri:")
    ) {
        return raw;
    }
    if (raw.startsWith("/") && !raw.startsWith("//") && !looksLikeUnixHome(raw)) {
        return raw;
    }
    return convertFileSrc(raw);
}

function looksLikeUnixHome(path: string): boolean {
    return (
        path.startsWith("/Users/")
        || path.startsWith("/home/")
        || path.startsWith("/var/")
        || path.startsWith("/tmp/")
        || path.startsWith("/opt/")
        || path.startsWith("/private/")
    );
}

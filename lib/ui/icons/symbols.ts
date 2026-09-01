import { getIconPath } from "./files";

/** Map LSP/outline symbol kinds to a generic file icon. */
export function getSymbolIconPath(_kind: string): string {
    return getIconPath("file.txt");
}

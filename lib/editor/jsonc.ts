/** Remove line and block comments from JSONC while preserving slashes inside quoted strings. */
export function stripJsonComments(raw: string): string {
    let out = "";
    let i = 0;

    while (i < raw.length) {
        const ch = raw[i];
        const next = raw[i + 1];

        if (ch === '"') {
            out += ch;
            i += 1;
            while (i < raw.length) {
                const c = raw[i];
                if (c === "\\") {
                    out += c;
                    i += 1;
                    if (i < raw.length) {
                        out += raw[i];
                        i += 1;
                    }
                    continue;
                }
                out += c;
                i += 1;
                if (c === '"') break;
            }
            continue;
        }

        if (ch === "/" && next === "/") {
            i += 2;
            while (i < raw.length && raw[i] !== "\n") i += 1;
            continue;
        }

        if (ch === "/" && next === "*") {
            i += 2;
            while (i < raw.length - 1 && !(raw[i] === "*" && raw[i + 1] === "/")) i += 1;
            i += 2;
            continue;
        }

        out += ch;
        i += 1;
    }

    return out.replace(/,(\s*[}\]])/g, "$1");
}

export function parseJsonc<T = unknown>(raw: string): T {
    return JSON.parse(stripJsonComments(raw)) as T;
}

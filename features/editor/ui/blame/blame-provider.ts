import { commands } from "@/lib/backend";
import type { BlameLine } from "@/lib/backend/types";
import { getSettings } from "@/lib/settings";

const BLAME_STYLE_ID = "shape-blame-style";

function ensureBlameStyles() {
    if (document.getElementById(BLAME_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = BLAME_STYLE_ID;
    style.textContent = `
        .shape-blame-decoration {
            color: var(--text-muted);
            font-size: 11px;
            font-style: italic;
            opacity: 0.8;
            margin-left: 2em;
        }
    `;
    document.head.appendChild(style);
}

function formatBlameDate(ts: string): string {
    const n = Number(ts);
    if (!Number.isFinite(n)) return ts;
    try {
        return new Date(n * 1000).toLocaleDateString();
    } catch {
        return ts;
    }
}

function toRelativePath(filePath: string, projectPath: string): string {
    const normFile = filePath.replace(/\\/g, "/");
    const normProject = projectPath.replace(/\\/g, "/").replace(/\/$/, "");
    if (normFile.startsWith(normProject)) {
        return normFile.slice(normProject.length).replace(/^\//, "");
    }
    return normFile;
}

export function attachBlameProvider(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monaco: any,
    getFilePath: () => string,
    getRepoPath: () => string | null,
) {
    ensureBlameStyles();
    const decorations = editor.createDecorationsCollection();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFetchKey = "";
    let blameLines: BlameLine[] = [];

    const fetchBlame = async () => {
        const repoPath = getRepoPath();
        if (!repoPath || !getSettings().git.blame.enabled) {
            blameLines = [];
            decorations.set([]);
            return;
        }
        const rel = toRelativePath(getFilePath(), repoPath);
        const key = `${repoPath}:${rel}`;
        if (key !== lastFetchKey) {
            lastFetchKey = key;
            try {
                blameLines = await commands.gitBlameFile(repoPath, rel);
            } catch {
                blameLines = [];
            }
        }
    };

    const updateDecoration = (lineNumber: number) => {
        if (!getSettings().git.blame.enabled) {
            decorations.set([]);
            return;
        }
        const info = blameLines.find((l) => l.line === lineNumber);
        if (!info) {
            decorations.set([]);
            return;
        }
        const shortHash = info.commit.slice(0, 7);
        const text = `  ${info.author} · ${info.summary || "no message"} (${shortHash}, ${formatBlameDate(info.date)})`;
        decorations.set([
            {
                range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                options: {
                    after: {
                        content: text,
                        inlineClassName: "shape-blame-decoration",
                    },
                },
            },
        ]);
    };

    const onCursorChange = () => {
        const pos = editor.getPosition();
        if (!pos) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            await fetchBlame();
            updateDecoration(pos.lineNumber);
        }, 300);
    };

    const settingsListener = () => {
        if (!getSettings().git.blame.enabled) {
            decorations.set([]);
        } else {
            onCursorChange();
        }
    };

    editor.onDidChangeCursorPosition(onCursorChange);
    window.addEventListener("shape-settings-changed", settingsListener);
    onCursorChange();

    return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        window.removeEventListener("shape-settings-changed", settingsListener);
        decorations.clear();
    };
}

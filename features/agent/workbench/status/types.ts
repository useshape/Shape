export type EditorStatus = {
    line: number;
    column: number;
    spaces: number;
    insertSpaces: boolean;
    eol: "LF" | "CRLF";
    language: string;
};

export const DEFAULT_EDITOR_STATUS: EditorStatus = {
    line: 1,
    column: 1,
    spaces: 4,
    insertSpaces: true,
    eol: "LF",
    language: "Plain Text",
};

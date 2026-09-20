export type TitlebarProps = {
    onboarding?: boolean;
    settings?: boolean;
    focus?: boolean;
    title?: string;
    onBack?: () => void;
};

export type MenuActionContext = {
    projectPath: string | null;
    activeFile: string | null;
    openFiles: { path: string; is_dirty: boolean }[];
    readLatestContent: (path: string) => Promise<string>;
    closeWindow: () => void;
};

export type TerminalTabLike = {
    id: string;
    cwd: string;
};

export function selectTerminalTab(
    tabs: TerminalTabLike[],
    cwd: string,
    activeId: string | null,
): string | null {
    const projectTabs = tabs.filter((tab) => tab.cwd === cwd);
    if (projectTabs.length === 0) return null;
    if (activeId && projectTabs.some((tab) => tab.id === activeId)) return activeId;
    return projectTabs[projectTabs.length - 1].id;
}

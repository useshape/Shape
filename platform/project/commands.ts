import { commands } from "@/lib/backend/commands";

export const projectCommands = {
    getProjectState: commands.getProjectState,
    setProjectPath: commands.setProjectPath,
    openFile: commands.openFile,
    closeFile: commands.closeFile,
    closeAllFiles: commands.closeAllFiles,
    setActiveFile: commands.setActiveFile,
    reorderFiles: commands.reorderFiles,
    markFileDirty: commands.markFileDirty,
};

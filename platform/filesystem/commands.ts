import { commands } from "@/lib/backend/commands";

export const filesystemCommands = {
    lsDir: commands.lsDir,
    readFile: commands.readFile,
    saveFile: commands.saveFile,
    searchProjectFiles: commands.searchProjectFiles,
};

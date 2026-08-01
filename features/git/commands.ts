import { commands } from "@/lib/backend/commands";

export const gitCommands = {
    gitStatus: commands.gitStatus,
    gitStage: commands.gitStage,
    gitCommit: commands.gitCommit,
    gitBranches: commands.gitBranches,
    gitCurrentBranch: commands.gitCurrentBranch,
    gitCommitFiles: commands.gitCommitFiles,
};
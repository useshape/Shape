import { invoke } from "@tauri-apps/api/core";
import { ActivityTotals, ChatGenerationState, ChatMessage, CodebaseSearchHit, ContentSearchResult, Conversation, EslintLintResult, FileEntry, FileInfo, FileSearchResult, GitActivityPoint, GitFileParams, GitRepoInfo, GitHubAuthLoginResult, GitHubAuthStatus, GitLogEntry, GitSyncStatus, GitStashEntry, BlameLine, HistoryEntry, IndexStatus, McpServerConfig, McpStatusEntry, McpToolInfo, PackageInfo, OutlineResponse, ProjectState, ProjectStatsSnapshot, ReplaceResult, SearchOptions, TestDiscoveryResult, TestRunSummaryResult, ContentMatch } from "@/lib/backend/types";

type InvokeLogger = (command: string, durationMs: number) => void;

let invokeLogger: InvokeLogger | null = null;
const FILE_CACHE_MAX = 20;
const GIT_CACHE_TTL_MS = 8000;
const fileContentCache = new Map<string, string>();
const gitCache = new Map<string, { expiresAt: number; value: unknown }>();

export function setInvokeLogger(logger: InvokeLogger | null) {
    invokeLogger = logger;
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const started = performance.now();
    try {
        return await invoke<T>(command, args);
    } finally {
        const durationMs = performance.now() - started;
        invokeLogger?.(command, durationMs);
    }
}

function rememberFileContent(path: string, content: string) {
    if (fileContentCache.has(path)) {
        fileContentCache.delete(path);
    }
    fileContentCache.set(path, content);
    if (fileContentCache.size > FILE_CACHE_MAX) {
        const oldestKey = fileContentCache.keys().next().value;
        if (oldestKey) fileContentCache.delete(oldestKey);
    }
}

function invalidateGitCacheForPath(path: string) {
    const prefixes = [`git_status:${path}`, `git_branch:${path}`, `git_log:${path}`];
    for (const key of gitCache.keys()) {
        if (prefixes.some((prefix) => key.startsWith(prefix))) {
            gitCache.delete(key);
        }
    }
}

async function invokeCachedGit<T>(cacheKey: string, command: string, args: Record<string, unknown>) {
    const now = Date.now();
    const cached = gitCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.value as T;
    }
    const value = await invokeCommand<T>(command, args);
    gitCache.set(cacheKey, {
        value,
        expiresAt: now + GIT_CACHE_TTL_MS,
    });
    return value;
}

export const commands = {
    invalidateFileCache: (path: string) => {
        fileContentCache.delete(path);
    },
    getCachedFileContent: (path: string): string | undefined => fileContentCache.get(path),
    lsDir: (path: string) => invokeCommand<FileEntry[]>("ls_dir", { path }),
    createFile: (path: string) => invokeCommand("create_file", { path }),
    createDir: (path: string) => invokeCommand("create_dir", { path }),
    deletePath: (path: string) => invokeCommand("delete_path", { path }),
    trashPath: (path: string) => invokeCommand("trash_path", { path }),
    renamePath: (oldPath: string, newPath: string) => invokeCommand("rename_path", { oldPath, newPath }),
    copyPath: (oldPath: string, newPath: string) => invokeCommand("copy_path", { oldPath, newPath }),
    revealPath: (path: string) => invokeCommand("reveal_path", { path }),
    setProjectPath: (path: string | null) => invokeCommand("set_project_path", { path }),
    openFile: (path: string, name: string) => invokeCommand("open_file", { path, name }),
    closeFile: (path: string) => invokeCommand("close_file", { path }),
    closeAllFiles: () => invokeCommand("close_all_files"),
    closeOtherFiles: async (path: string) => {
        const state = await commands.getProjectState();
        for (const file of state.open_files) {
            if (file.path !== path) {
                await commands.closeFile(file.path);
            }
        }
    },
    setActiveFile: (path: string) => invokeCommand("set_active_file", { path }),
    pinFile: (path: string, pinned: boolean) => invokeCommand("pin_file", { path, pinned }),
    closeToRight: (path: string) => invokeCommand("close_to_right", { path }),
    closeSaved: () => invokeCommand("close_saved"),
    readFile: async (path: string) => {
        const cached = fileContentCache.get(path);
        if (cached !== undefined) return cached;
        const content = await invokeCommand<string>("read_file", { path });
        rememberFileContent(path, content);
        return content;
    },
    readFileBytes: (path: string) =>
        invokeCommand<number[]>("read_file_bytes", { path }),
    saveFile: async (path: string, content: string) => {
        await invokeCommand<void>("save_file", { path, content });
        rememberFileContent(path, content);
    },
    saveFileBytes: (path: string, bytes: number[]) =>
        invokeCommand<void>("save_file_bytes", { path, bytes }),
    markFileDirty: (path: string, dirty: boolean) => invokeCommand("mark_file_dirty", { path, dirty }),
    reorderFiles: (files: FileInfo[]) => invokeCommand("reorder_files", { files }),
    getRustDeps: (projectPath: string) => invokeCommand<[string, string][]>("get_rust_deps", { projectPath }),
    getProjectState: () => invokeCommand<ProjectState>("get_project_state"),
    openUrlExternal: (url: string) => invokeCommand("open_url_external", { url }),
    newWindow: () => invokeCommand("spawn_new_window"),
    isFreshWindow: () => invokeCommand<boolean>("is_fresh_window"),
    handleShortcut: (shortcut: string) => invokeCommand("handle_shortcut", { shortcut }),
    gitStatus: (path: string) =>
        invokeCachedGit<GitFileParams[]>(`git_status:${path}`, "git_status", { path }),
    gitDiscoverRepos: (workspaceRoot: string) =>
        invokeCommand<GitRepoInfo[]>("git_discover_repos", { workspaceRoot }),
    gitResolveRepoForFile: (workspaceRoot: string, filePath: string) =>
        invokeCommand<string | null>("git_resolve_repo_for_file", { workspaceRoot, filePath }),
    gitStage: async (repoPath: string, filePath: string) => {
        const result = await invokeCommand("git_stage", { repoPath, filePath });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitStageAll: async (repoPath: string) => {
        const result = await invokeCommand("git_stage_all", { repoPath });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitUnstage: async (repoPath: string, filePath: string) => {
        const result = await invokeCommand("git_unstage", { repoPath, filePath });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitUnstageAll: async (repoPath: string) => {
        const result = await invokeCommand("git_unstage_all", { repoPath });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitDiscardChanges: async (repoPath: string, filePath: string) => {
        const result = await invokeCommand("git_discard_changes", { repoPath, filePath });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitListHunks: (repoPath: string, filePath: string, staged: boolean) =>
        invokeCommand<import("./types").GitHunkList>("git_list_hunks", { repoPath, filePath, staged }),
    gitStageHunk: async (
        repoPath: string,
        filePath: string,
        hunkIndex: number,
        lineIndices?: number[] | null,
    ) => {
        const result = await invokeCommand("git_stage_hunk", {
            repoPath,
            filePath,
            hunkIndex,
            lineIndices: lineIndices ?? null,
        });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitUnstageHunk: async (
        repoPath: string,
        filePath: string,
        hunkIndex: number,
        lineIndices?: number[] | null,
    ) => {
        const result = await invokeCommand("git_unstage_hunk", {
            repoPath,
            filePath,
            hunkIndex,
            lineIndices: lineIndices ?? null,
        });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitRestoreHunk: async (
        repoPath: string,
        filePath: string,
        hunkIndex: number,
        lineIndices?: number[] | null,
    ) => {
        const result = await invokeCommand("git_restore_hunk", {
            repoPath,
            filePath,
            hunkIndex,
            lineIndices: lineIndices ?? null,
        });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitCommit: async (repoPath: string, message: string) => {
        const result = await invokeCommand("git_commit", { repoPath, message });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitCommitAmend: async (repoPath: string, message: string) => {
        const result = await invokeCommand("git_commit_amend", { repoPath, message });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitDiff: (repoPath: string) => invokeCommand<string>("git_diff", { repoPath }),
    gitFileDiff: (repoPath: string, filePath: string) => invokeCommand<string>("git_file_diff", { repoPath, filePath }),
    gitBranches: (path: string) => invokeCommand<string[]>("git_branches", { path }),
    gitInit: async (path: string) => {
        const result = await invokeCommand("git_init", { path });
        invalidateGitCacheForPath(path);
        return result;
    },
    gitBranchDetails: (path: string, currentBranch: string, allRefs = false) =>
        invokeCommand<import("./types").GitBranchDetail[]>("git_branch_details", {
            path,
            currentBranch,
            allRefs,
        }),
    gitBranchGraph: (path: string, allRefs = true) =>
        invokeCommand<import("./types").GitBranchGraph>("git_branch_graph", { path, allRefs }),
    gitSetUpstream: async (repoPath: string, branch: string, upstream: string) => {
        const result = await invokeCommand("git_set_upstream", { repoPath, branch, upstream });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitDiffBranches: (repoPath: string, base: string, compare: string) =>
        invokeCommand<string>("git_diff_branches", { repoPath, base, compare }),
    gitRemoteBranches: (path: string) => invokeCommand<string[]>("git_remote_branches", { path }),
    gitRenameBranch: async (repoPath: string, oldName: string, newName: string) => {
        const result = await invokeCommand("git_rename_branch", { repoPath, oldName, newName });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitCreateBranch: async (repoPath: string, branchName: string) => {
        const result = await invokeCommand("git_create_branch", { repoPath, branchName });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitDeleteBranch: async (repoPath: string, branchName: string) => {
        const result = await invokeCommand("git_delete_branch", { repoPath, branchName });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitSwitchBranch: async (repoPath: string, branchName: string) => {
        const result = await invokeCommand("git_switch_branch", { repoPath, branchName });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitCurrentBranch: (path: string) =>
        invokeCachedGit<string>(`git_branch:${path}`, "git_current_branch", { path }),
    gitLogStreamStart: (path: string, callerId: string, allRefs = false) =>
        invokeCommand<void>("git_log_stream_start", { path, callerId, allRefs }),
    gitLogStreamNext: (callerId: string, limit: number = 200) =>
        invokeCommand<GitLogEntry[]>("git_log_stream_next", { callerId, limit }),
    gitLogStreamStop: (callerId: string) =>
        invokeCommand<void>("git_log_stream_stop", { callerId }),
    gitActivityTimeline: (
        path: string,
        opts?: { allRefs?: boolean; rev?: string | null; author?: string | null },
    ) =>
        invokeCommand<GitActivityPoint[]>("git_activity_timeline", {
            path,
            allRefs: opts?.allRefs ?? true,
            rev: opts?.rev ?? null,
            author: opts?.author ?? null,
        }),
    gitSyncStatus: (path: string) =>
        invokeCachedGit<GitSyncStatus>(`git_sync_status:${path}`, "git_sync_status", { path }),
    gitSync: async (path: string) => {
        const result = await invokeCommand("git_sync", { path });
        invalidateGitCacheForPath(path);
        return result;
    },
    gitPull: async (path: string) => {
        const result = await invokeCommand("git_pull", { path });
        invalidateGitCacheForPath(path);
        return result;
    },
    gitPush: async (path: string) => {
        const result = await invokeCommand("git_push", { path });
        invalidateGitCacheForPath(path);
        return result;
    },
    gitFetch: async (path: string) => {
        const result = await invokeCommand("git_fetch", { path });
        invalidateGitCacheForPath(path);
        return result;
    },
    gitListTags: (repoPath: string) =>
        invokeCommand<{ name: string; hash: string; date: string; message: string }[]>(
            "git_list_tags",
            { repoPath },
        ),
    gitReset: async (repoPath: string, hash: string, mode: "soft" | "mixed" | "hard") => {
        const result = await invokeCommand("git_reset", { repoPath, hash, mode });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitCreateTag: async (repoPath: string, name: string, hash: string, message?: string | null) => {
        const result = await invokeCommand("git_create_tag", {
            repoPath,
            name,
            hash,
            message: message ?? null,
        });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitDeleteTag: async (repoPath: string, name: string) => {
        const result = await invokeCommand("git_delete_tag", { repoPath, name });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitDiffNameStatus: (repoPath: string, base: string, compare: string) =>
        invokeCommand<GitFileParams[]>("git_diff_name_status", { repoPath, base, compare }),
    gitGetFileAtRef: (repoPath: string, rev: string, filePath: string) =>
        invokeCommand<string>("git_get_file_at_ref", { repoPath, rev, filePath }),
    gitMergeAbort: async (repoPath: string) => {
        const result = await invokeCommand("git_merge_abort", { repoPath });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitRebaseAbort: async (repoPath: string) => {
        const result = await invokeCommand("git_rebase_abort", { repoPath });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitInProgress: (repoPath: string) =>
        invokeCommand<{ merge: boolean; rebase: boolean }>("git_in_progress", { repoPath }),
    gitHasRemote: (path: string) => invokeCommand<boolean>("git_has_remote", { path }),
    gitRemoteUrl: (path: string) => invokeCommand<string>("git_remote_url", { path }),
    gitListRemotes: (path: string) => invokeCommand<{ name: string; url: string }[]>("git_list_remotes", { path }),
    gitAddRemote: async (path: string, name: string, url: string) => {
        const result = await invokeCommand("git_add_remote", { path, name, url });
        invalidateGitCacheForPath(path);
        return result;
    },
    gitRemoveRemote: async (path: string, name: string) => {
        const result = await invokeCommand("git_remove_remote", { path, name });
        invalidateGitCacheForPath(path);
        return result;
    },
    gitSetRemoteUrl: async (path: string, name: string, url: string) => {
        const result = await invokeCommand("git_set_remote_url", { path, name, url });
        invalidateGitCacheForPath(path);
        return result;
    },
    gitCommitFiles: (repoPath: string, hash: string) =>
        invokeCommand<GitFileParams[]>("git_commit_files", { repoPath, hash }),
    gitGetItemContent: (repoPath: string, filePath: string, staged: boolean) =>
        invokeCommand<string>("git_get_item_content", { repoPath, filePath, staged }),
    gitGetCommitFileContent: (repoPath: string, filePath: string, hash: string) =>
        invokeCommand<[string, string]>("git_get_commit_file_content", { repoPath, filePath, hash }),
    gitOpenDiff: (path: string, name: string, staged: boolean) =>
        invokeCommand<void>("git_open_diff", { path, name, staged }),
    gitOpenCommitDiff: (path: string, name: string, hash: string) =>
        invokeCommand<void>("git_open_commit_diff", { path, name, hash }),
    gitCherryPick: async (repoPath: string, hash: string) => {
        const result = await invokeCommand("git_cherry_pick", { repoPath, hash });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitRevertCommit: async (repoPath: string, hash: string) => {
        const result = await invokeCommand("git_revert_commit", { repoPath, hash });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitCreateBranchFromCommit: async (repoPath: string, branchName: string, hash: string) => {
        const result = await invokeCommand("git_create_branch_from_commit", { repoPath, branchName, hash });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitCheckoutCommit: async (repoPath: string, hash: string) => {
        const result = await invokeCommand("git_checkout_commit", { repoPath, hash });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitBlameFile: (repoPath: string, filePath: string) =>
        invokeCommand<BlameLine[]>("git_blame_file", { repoPath, filePath }),
    gitStashList: (repoPath: string) =>
        invokeCommand<GitStashEntry[]>("git_stash_list", { repoPath }),
    gitStashSave: async (repoPath: string, message: string, includeUntracked: boolean) => {
        const result = await invokeCommand("git_stash_save", { repoPath, message, includeUntracked });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitStashApply: async (repoPath: string, index: number) => {
        const result = await invokeCommand("git_stash_apply", { repoPath, index });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitStashPop: async (repoPath: string, index: number) => {
        const result = await invokeCommand("git_stash_pop", { repoPath, index });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitStashDrop: async (repoPath: string, index: number) => {
        const result = await invokeCommand("git_stash_drop", { repoPath, index });
        invalidateGitCacheForPath(repoPath);
        return result;
    },
    gitStashShow: (repoPath: string, index: number) =>
        invokeCommand<string>("git_stash_show", { repoPath, index }),
    getPackageInfo: (projectPath: string, packageManager?: string | null) =>
        invokeCommand<PackageInfo>("get_package_info", { projectPath, packageManager: packageManager ?? null }),
    npmInstall: (projectPath: string, packageName: string, dev: boolean, packageManager?: string | null) =>
        invokeCommand("npm_install", { projectPath, packageName, dev, packageManager: packageManager ?? null }),
    npmUninstall: (projectPath: string, packageName: string, packageManager?: string | null) =>
        invokeCommand("npm_uninstall", { projectPath, packageName, packageManager: packageManager ?? null }),
    npmUpdate: (projectPath: string, packageName?: string, packageManager?: string | null) =>
        invokeCommand("npm_update", { projectPath, packageName: packageName ?? null, packageManager: packageManager ?? null }),
    runInstallAll: (projectPath: string, packageManager?: string | null) =>
        invokeCommand("run_install_all", { projectPath, packageManager: packageManager ?? null }),
    getOutline: (filePath: string, content: string, extension: string, version: number) =>
        invokeCommand<OutlineResponse>("get_outline", { filePath, content, extension, version }),
    searchProjectFiles: (query: string, limit?: number) =>
        invokeCommand<FileSearchResult[]>("search_project_files", { query, limit }),
    searchContent: (query: string, options: SearchOptions) =>
        invokeCommand<ContentSearchResult[]>("search_content", { query, options }),
    replaceContent: (
        query: string,
        replacement: string,
        options: SearchOptions,
        singleMatch?: ContentMatch | null,
        singleFilePath?: string | null,
    ) =>
        invokeCommand<ReplaceResult>("replace_content", {
            query,
            replacement,
            options,
            singleMatch: singleMatch ?? null,
            singleFilePath: singleFilePath ?? null,
        }),
    // Chat
    sendChatMessage: (
        message: string,
        model?: string,
        mode?: string,
        customSystemPrompt?: string,
        customRules?: string,
        accessToken?: string,
        designOptions?: {
            visualPreviews: boolean;
            multipleConcepts: boolean;
            hideCodeUntilChosen: boolean;
            useProjectTokens: boolean;
            responsiveFrames: boolean;
            accessibilityPass: boolean;
        },
        reviewAdversarialEnabled?: boolean,
    ) =>
        invokeCommand<string>("send_chat_message", {
            message,
            model,
            mode,
            customSystemPrompt: customSystemPrompt ?? null,
            customRules: customRules ?? null,
            accessToken: accessToken ?? null,
            designOptions: designOptions ?? null,
            reviewAdversarialEnabled: reviewAdversarialEnabled ?? null,
        }),
    captureHtmlPreview: (options: {
        html: string;
        width: number;
        height: number;
        projectPath?: string;
        useProjectTokens?: boolean;
    }) =>
        invokeCommand<{
            pngPath: string;
            width: number;
            height: number;
            renderMs: number;
        }>("capture_html_preview", {
            html: options.html,
            width: options.width,
            height: options.height,
            projectPath: options.projectPath ?? null,
            useProjectTokens: options.useProjectTokens ?? true,
        }),
    cleanupDesignSandbox: (sessionId?: string) =>
        invokeCommand<void>("cleanup_design_sandbox", {
            sessionId: sessionId ?? null,
        }),
    stopChatMessage: () => invokeCommand<void>("stop_chat_message"),
    getChatHistory: () => invokeCommand<ChatMessage[]>("get_chat_history"),
    getChatGenerationState: () =>
        invokeCommand<ChatGenerationState>("get_chat_generation_state"),
    getChatTitle: () => invokeCommand<string>("get_chat_title"),
    getCurrentConversationId: () => invokeCommand<string | null>("get_current_conversation_id"),
    getConversations: (projectPath?: string) => invokeCommand<Conversation[]>("get_conversations", { projectPath: projectPath ?? null }),
    clearChatHistory: () => invokeCommand<void>("clear_chat_history"),
    newChat: () => invokeCommand<void>("new_chat"),
    loadConversation: (id: string, projectPath?: string | null) =>
        invokeCommand<void>("load_conversation", { id, projectPath: projectPath ?? null }),
    deleteConversation: (id: string) => invokeCommand<void>("delete_conversation", { id }),
    applyFileEdit: (path: string, original: string, replacement: string) =>
        invokeCommand<void>("apply_file_edit", { path, original, replacement }),
    generateCommitMessage: (accessToken?: string) =>
        invokeCommand<string>("generate_commit_message", { accessToken: accessToken ?? null }),
    restoreCheckpoint: (index: number) => invokeCommand<void>("restore_checkpoint", { index }),
    // Codebase index
    indexProject: (projectPath?: string, accessToken?: string) =>
        invokeCommand<boolean>("index_project", {
            projectPath: projectPath ?? null,
            accessToken: accessToken ?? null,
        }),
    searchCodebase: (query: string, topK?: number, projectPath?: string) =>
        invokeCommand<CodebaseSearchHit[]>("search_codebase", {
            query,
            topK: topK ?? null,
            projectPath: projectPath ?? null,
        }),
    getIndexStatus: (projectPath?: string) =>
        invokeCommand<IndexStatus>("get_index_status", { projectPath: projectPath ?? null }),
    // MCP
    getMcpConfigPath: () => invokeCommand<string>("get_mcp_config_path"),
    ensureMcpConfig: () => invokeCommand<string>("ensure_mcp_config"),
    syncMcpServers: (servers: McpServerConfig[]) =>
        invokeCommand<McpStatusEntry[]>("sync_mcp_servers", { servers }),
    getMcpStatus: () => invokeCommand<McpStatusEntry[]>("get_mcp_status"),
    getMcpTools: () => invokeCommand<McpToolInfo[]>("get_mcp_tools"),
    restartMcpServer: (id: string) => invokeCommand<McpStatusEntry>("restart_mcp_server", { id }),
    mcpStartOAuth: (id: string) => invokeCommand<void>("mcp_start_oauth", { id }),
    mcpCompleteOAuth: (callbackUrl: string) =>
        invokeCommand<string>("mcp_complete_oauth", { callbackUrl }),
    callMcpTool: (qualifiedName: string, args: Record<string, unknown>) =>
        invokeCommand<string>("call_mcp_tool", { qualifiedName, arguments: args }),
    // Terminal command approval
    approveTerminalCommand: (id: string) => invokeCommand<string>("approve_terminal_command", { id }),
    rejectTerminalCommand: (id: string) => invokeCommand<void>("reject_terminal_command", { id }),
    setDiagnostics: (path: string, diagnostics: unknown[]) => invokeCommand<void>("set_diagnostics", { path, diagnostics }),
    lspStart: (
        language: string,
        command: string,
        args: string[],
        cwd?: string | null,
        isolateNpx?: boolean,
    ) =>
        invokeCommand("lsp_start", {
            language,
            command,
            args,
            cwd: cwd ?? null,
            isolateNpx: isolateNpx ?? false,
        }),
    resolveTypescriptTsdk: (projectPath: string) =>
        invokeCommand<string | null>("resolve_typescript_tsdk", { projectPath }),
    lspStop: (language: string) => invokeCommand("lsp_stop", { language }),
    lspStopAll: () => invokeCommand("lsp_stop_all"),
    lspSend: (language: string, message: string) =>
        invokeCommand("lsp_send", { language, message }),
    ptyAvailableShells: () =>
        invokeCommand<import("./types").TerminalShellProfile[]>("pty_available_shells"),
    saveColorToHistory: (color: string) => invokeCommand<void>("save_color_to_history", { color }),
    getColorHistory: () => invokeCommand<string[]>("get_color_history"),
    eslintLintFile: (projectPath: string, filePath: string, content: string, applyFix?: boolean) =>
        invokeCommand<EslintLintResult>("eslint_lint_file", {
            projectPath,
            filePath,
            content,
            applyFix: applyFix ?? false,
        }),
    prettierFormatFile: (projectPath: string, filePath: string, content: string) =>
        invokeCommand<string>("prettier_format_file", { projectPath, filePath, content }),
    discoverTests: (projectPath: string) =>
        invokeCommand<TestDiscoveryResult>("discover_tests", { projectPath }),
    runTests: (projectPath: string, framework: string, pattern?: string | null) =>
        invokeCommand<TestRunSummaryResult>("run_tests", { projectPath, framework, pattern: pattern ?? null }),
    getFileHistory: (filePath: string) =>
        invokeCommand<HistoryEntry[]>("get_file_history_command", { filePath }),
    restoreHistoryVersion: (filePath: string, versionId: string) =>
        invokeCommand<string>("restore_history_version_command", { filePath, versionId }),
    githubAuthStatus: () => invokeCommand<GitHubAuthStatus>("github_auth_status"),
    githubAuthLogin: () => invokeCommand<GitHubAuthLoginResult>("github_auth_login"),
    githubAuthLogout: (username?: string | null) =>
        invokeCommand<void>("github_auth_logout", { username: username ?? null }),
    githubAuthEnsureGitHelper: () => invokeCommand<void>("github_auth_ensure_git_helper"),
    githubApiGet: (path: string) => invokeCommand<string>("github_api_get", { path }),
    githubApiRequest: (method: string, path: string, body?: string | null) =>
        invokeCommand<string>("github_api_request", {
            method,
            path,
            body: body ?? null,
        }),
    githubActionsLogs: (
        repo: string,
        runId: number,
        jobId?: number | null,
        failedOnly?: boolean | null,
    ) =>
        invokeCommand<string>("github_actions_logs", {
            repo,
            runId,
            jobId: jobId ?? null,
            failedOnly: failedOnly ?? null,
        }),
    githubActionsDownloadArtifact: (repo: string, artifactId: number, destPath: string) =>
        invokeCommand<void>("github_actions_download_artifact", {
            repo,
            artifactId,
            destPath,
        }),
    githubActionsWorkflowYaml: (repo: string, workflow: string) =>
        invokeCommand<string>("github_actions_workflow_yaml", { repo, workflow }),
    githubActionsWorkflowDispatch: (
        repo: string,
        workflow: string,
        gitRef: string,
        inputsJson?: string | null,
    ) =>
        invokeCommand<string>("github_actions_workflow_dispatch", {
            repo,
            workflow,
            gitRef,
            inputsJson: inputsJson ?? null,
        }),
    getDeviceId: () => invokeCommand<string>("get_device_id"),
    setWorkspaceTrusted: (path: string, trusted: boolean) =>
        invokeCommand<void>("set_workspace_trusted", { path, trusted }),
    isWorkspaceTrusted: (path: string) =>
        invokeCommand<boolean>("is_workspace_trusted", { path }),
    gitClone: (url: string, parentDir: string) =>
        invokeCommand<string>("git_clone", { url, parentDir }),
    // Project statistics (local)
    getProjectStats: (projectPath?: string) =>
        invokeCommand<ProjectStatsSnapshot>("get_project_stats", {
            projectPath: projectPath ?? null,
        }),
    scanProjectLoc: (projectPath?: string) =>
        invokeCommand<ProjectStatsSnapshot>("scan_project_loc", {
            projectPath: projectPath ?? null,
        }),
    setStatsCustomIgnore: (ignore: string[], projectPath?: string) =>
        invokeCommand<ProjectStatsSnapshot>("set_stats_custom_ignore", {
            ignore,
            projectPath: projectPath ?? null,
        }),
    recordProjectActivity: (
        delta: { codingMs?: number; aiGeneratingMs?: number; focusedMs?: number },
        projectPath?: string,
    ) =>
        invokeCommand<ActivityTotals>("record_project_activity", {
            delta,
            projectPath: projectPath ?? null,
        }),
};

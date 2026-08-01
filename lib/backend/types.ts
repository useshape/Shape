export interface GitHubAuthStatus {
    loggedIn: boolean;
    username: string | null;
    avatarUrl: string | null;
    provider: "gcm" | "gh" | "none" | string;
}

export interface GitHubAuthLoginResult {
    started: boolean;
}

export interface FileInfo {
    path: string;
    name: string;
    is_dirty: boolean;
    is_pinned?: boolean;
    kind?: 'text' | 'diff';
    diff_metadata?: {
        staged: boolean;
    };
}

export interface ProjectState {
    project_path: string | null;
    open_files: FileInfo[];
    active_file: string | null;
}

export interface DiffMetadata {
    staged: boolean;
    commit_hash?: string;
}

export interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
}

export interface GitSyncStatus {
    ahead: number;
    behind: number;
}

export interface GitBranchDetail {
    name: string;
    author: string;
    authorEmail?: string;
    date: string;
    ahead?: number | null;
    behind?: number | null;
}

export interface GitBranchGraphNode {
    name: string;
    commit: string;
    author: string;
    authorEmail?: string;
    date: string;
    ahead: number;
    x: number;
    y: number;
    parentName?: string | null;
    parents?: string[];
    isCurrent: boolean;
    isRemote: boolean;
    isDetached?: boolean;
    isOrphanRoot?: boolean;
}

export interface GitBranchGraph {
    nodes: GitBranchGraphNode[];
    width: number;
    height: number;
    currentBranch: string;
    total: number;
    truncated: boolean;
    detached?: boolean;
}

export interface TerminalShellProfile {
    id: "powershell" | "pwsh" | "cmd" | "gitbash" | "wsl";
    label: string;
    path: string;
}

export interface GitFileParams {
    path: string;
    status: string;
    staged: boolean;
}

export interface GitHunkLine {
    type: "context" | "add" | "del" | string;
    content: string;
    oldLine?: number | null;
    newLine?: number | null;
}

export interface GitHunk {
    index: number;
    header: string;
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: GitHunkLine[];
}

export interface GitHunkList {
    path: string;
    staged: boolean;
    hunks: GitHunk[];
}

export interface GitRepoInfo {
    path: string;
    name: string;
    isBare: boolean;
}

export interface GraphPath {
    type: 'incoming' | 'outgoing' | 'passthrough';
    fromX: number;
    toX: number;
    color: string;
}

export interface GraphNode {
    lane: number;
    color: string;
    isMerge: boolean;
    paths: GraphPath[];
}

export interface GitLogEntry {
    hash: string;
    message: string;
    author: string;
    author_email: string;
    date: string;
    files_changed: number;
    insertions: number;
    deletions: number;
    refs: string[];
    parent_count: number;
    parents: string[];
    graphNode?: GraphNode;
}

/** Minimal commit sample for the manager activity minimap (full history). */
export interface GitActivityPoint {
    timestamp: number;
    hash: string;
}

export interface GitStashEntry {
    index: number;
    message: string;
    date: string;
}

export interface BlameLine {
    line: number;
    commit: string;
    author: string;
    date: string;
    summary: string;
}

export interface PackageDep {
    name: string;
    version: string;
    installed?: string | null;
    wanted?: string | null;
    latest?: string | null;
    is_dev: boolean;
}

export interface PackageInfo {
    name?: string | null;
    version?: string | null;
    dependencies: PackageDep[];
    dev_dependencies: PackageDep[];
}

export interface OutlineSymbol {
    id: string;
    name: string;
    kind: string;
    start_line: number;
    start_col: number;
    end_line: number;
    end_col: number;
    children: OutlineSymbol[];
}

export interface OutlineResponse {
    symbols: OutlineSymbol[];
    total_symbols: number;
    truncated: boolean;
    version: number;
}

export interface FileSearchResult {
    name: string;
    path: string;
    relative_path: string;
    score: number;
}

export interface SearchOptions {
    case_sensitive: boolean;
    whole_word: boolean;
    is_regex: boolean;
    include_pattern?: string;
    exclude_pattern?: string;
    respect_gitignore: boolean;
    include_hidden: boolean;
    follow_symlinks: boolean;
    exclude_tests: boolean;
    exclude_docs: boolean;
    exclude_build: boolean;
    exclude_assets: boolean;
    only_source: boolean;
}

export interface ContentMatch {
    line_number: number;
    line_text: string;
    column_start: number;
    column_end: number;
}

export interface ContentSearchResult {
    path: string;
    relative_path: string;
    matches: ContentMatch[];
}

export interface ReplaceResult {
    files_modified: number;
    replacements_count: number;
    errors: string[];
}

export interface ChatMessage {
    role: string;
    content: string;
    timestamp: number;
    model?: string;
    stats?: {
        timeMs?: number;
        cost?: number;
        tokens?: number;
        inputTokens?: number;
        outputTokens?: number;
        creditsCharged?: number;
        usedAuto?: boolean;
        autoPercent?: number;
    };
}

export interface Conversation {
    id: string;
    title: string;
    history: ChatMessage[];
    project_path: string;
    timestamp: number;
}

export interface IndexStatus {
    filesIndexed: number;
    totalFiles: number;
    chunks: number;
    vectors?: number;
    lastIndexedAt?: number | null;
    projectPath?: string | null;
    indexing?: boolean;
    embeddingsEnabled?: boolean;
}

export interface ChatGenerationState {
    isGenerating: boolean;
    turnId?: string | null;
    conversationId?: string | null;
    partialContent?: string | null;
    activityLabel?: string | null;
}

export interface IndexProgress {
    filesIndexed: number;
    totalFiles: number;
    chunks: number;
    phase: string;
}

export interface CodebaseSearchHit {
    file: string;
    startLine: number;
    endLine: number;
    excerpt: string;
    score: number;
}

export interface McpServerConfig {
    id: string;
    name: string;
    transport: "stdio" | "http";
    command: string;
    args: string[];
    env: Record<string, string>;
    url?: string;
    auth: "none" | "oauth";
    enabled: boolean;
}

export interface McpStatusEntry {
    id: string;
    name: string;
    status: "connected" | "needs_auth" | "error" | "disabled";
    toolCount: number;
    error?: string | null;
    auth?: "none" | "oauth";
}

export interface McpToolInfo {
    serverId: string;
    serverName: string;
    name: string;
    qualifiedName: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface HistoryEntry {
    id: string;
    timestamp: number;
    label: string;
    size: number;
}

export interface EslintDiagnostic {
    line: number;
    column: number;
    end_line: number;
    end_column: number;
    message: string;
    severity: string;
    rule_id?: string | null;
}

export interface EslintLintResult {
    diagnostics: EslintDiagnostic[];
    content?: string | null;
}

export interface TestDiscoveryResult {
    framework: string;
    test_files: string[];
}

export interface TestRunSummaryResult {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
}

export interface LanguageStats {
    name: string;
    files: number;
    code: number;
    blank: number;
    comment: number;
    bytes: number;
}

export interface LargeFileStat {
    path: string;
    lines: number;
    code: number;
    bytes: number;
    language: string;
}

export interface LocReport {
    scannedAt: number;
    totalFiles: number;
    totalBytes: number;
    code: number;
    blank: number;
    comment: number;
    totalLines: number;
    avgLinesPerFile: number;
    avgBytesPerFile: number;
    avgCodePerFile: number;
    commentRatio: number;
    blankRatio: number;
    codeRatio: number;
    filesOver500Lines: number;
    filesOver1000Lines: number;
    testFiles: number;
    configFiles: number;
    docFiles: number;
    uniqueLanguages: number;
    largestFiles: LargeFileStat[];
    languages: LanguageStats[];
}

export interface ActivityTotals {
    codingMs: number;
    aiGeneratingMs: number;
    focusedMs: number;
    updatedAt: number;
}

export interface ActivityHours {
    coding: number;
    aiGenerating: number;
    focused: number;
    totalActive: number;
}

export interface EventCounters {
    aiTerminalRuns: number;
    aiFileEdits: number;
    aiFileCreates: number;
    aiFileDeletes: number;
    aiFileRenames: number;
    aiSearches: number;
    aiReads: number;
    aiGitCommits: number;
    aiGitFetches: number;
    aiGitStages: number;
    aiChatTurns: number;
    aiSubagents: number;
    aiDesignPreviews: number;
    aiMcpCalls: number;
    aiPlanSaves: number;
    aiTodoUpdates: number;
    userFileSaves: number;
    userFilesOpened: number;
    userGitCommits: number;
    userGitPushes: number;
    userGitFetches: number;
    userGitPulls: number;
    chatStops: number;
}

export interface GitInsights {
    isRepo: boolean;
    commits: number;
    contributors: number;
    branches: number;
    remoteBranches: number;
    tags: number;
    remotes: number;
    mergeCommits: number;
    commitsToday: number;
    commitsLast7Days: number;
    commitsLast30Days: number;
    commitsLast90Days: number;
    additionsLast30Days: number;
    deletionsLast30Days: number;
    filesTouchedLast30Days: number;
    stashCount: number;
    dirtyFiles: number;
    untrackedFiles: number;
    firstCommitAt: number | null;
    ageDays: number;
    avgCommitsPerWeek: number;
    busiestWeekday: string | null;
    topAuthor: string | null;
    topAuthorCommits: number;
    currentBranch: string | null;
    lastCommitAt: number | null;
    lastCommitMessage: string | null;
    lastCommitAuthor: string | null;
    computedAt: number;
}

export interface ProjectStatsSnapshot {
    projectPath: string;
    projectName: string;
    customIgnore: string[];
    defaultIgnore: string[];
    loc: LocReport | null;
    activity: ActivityTotals;
    hours: ActivityHours;
    events: EventCounters;
    git: GitInsights | null;
    projectFolders: string[];
}

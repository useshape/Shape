#!/usr/bin/env node
/**
 * Generate GitHub release notes from commits since the previous tag.
 *
 * Grouping is **area-only** (Editor, Git, Workbench, …) — not mixed with
 * conventional-commit type buckets like Features / Fixes. Prefer commit
 * subjects shaped like `editor: …` (see COMMIT.md).
 *
 * Overview is optional: pass --overview / --overview-file only when you want one.
 * Usage:
 *   node scripts/release/notes.mjs [--from <ref>] [--to <ref>] [--output <file>]
 *   node scripts/release/notes.mjs --overview "Ships trust prompts and tab scroll fixes."
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

/** Area key → release section title. First match wins for aliases. */
const AREA_ORDER = [
    ["editor", "Editor"],
    ["agent", "Agent"],
    ["chat", "Agent"],
    ["git", "Git"],
    ["github", "Git"],
    ["terminal", "Terminal"],
    ["lsp", "Language servers"],
    ["search", "Search"],
    ["ui", "Workbench"],
    ["workbench", "Workbench"],
    ["app", "Workbench"],
    ["settings", "Workbench"],
    ["onboarding", "Workbench"],
    ["notifications", "Workbench"],
    ["updater", "Updater"],
    ["docs", "Documentation"],
    ["ci", "CI"],
];

/** Bare conventional types with no area — single fallback section, not Features/Fixes. */
const TYPE_ONLY = new Set([
    "feat",
    "fix",
    "chore",
    "refactor",
    "test",
    "perf",
    "security",
    "build",
    "style",
]);

const AREA_BY_KEY = new Map(AREA_ORDER);
const AREA_TITLE_ORDER = [...new Set(AREA_ORDER.map(([, title]) => title))];

const COMMIT_RE = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/;
const PR_RE = /\(#(\d+)\)\s*$/;
const MERGE_PR_RE = /Merge pull request #(\d+)\b/i;
const RELEASE_CHORE_RE = /^release\s+v?\d+\.\d+\.\d+/i;
/** Lockfile / version sync — not user-facing changelog material. */
const SKIP_SUBJECT_RE =
    /^(sync\s+cargo\.lock|bump\s+.*cargo\.lock|sync\s+.*app\s+version|cargo\.lock)/i;


const DEFAULT_REPO = "useshape/Shape";

const CO_AUTHOR_RE =
    /^Co-authored-by:\s*(.+?)\s*<([^>]+)>\s*$/gim;
const GITHUB_NOREPLY_RE =
    /^(?:(\d+)\+)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)@users\.noreply\.github\.com$/i;
const GITHUB_LOGIN_RE =
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

function parseArgs(argv) {
    const out = {
        from: null,
        to: "HEAD",
        dryRun: false,
        output: null,
        overview: null,
        overviewFile: null,
        repo: DEFAULT_REPO,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--from") out.from = argv[++i];
        else if (a === "--to") out.to = argv[++i];
        else if (a === "--dry-run") out.dryRun = true;
        else if (a === "--output") out.output = argv[++i];
        else if (a === "--overview") out.overview = argv[++i];
        else if (a === "--overview-file") out.overviewFile = argv[++i];
        else if (a === "--repo") out.repo = argv[++i];
    }
    return out;
}

function previousTag() {
    try {
        return execSync("git describe --tags --abbrev=0", {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return null;
    }
}

/** Resolve a ref to a tag-like name for compare URLs when possible. */
function refLabel(ref) {
    if (!ref || ref === "HEAD") return null;
    return ref;
}

/**
 * @returns {{
 *   hash: string,
 *   short: string,
 *   subject: string,
 *   authorName: string,
 *   authorEmail: string,
 *   body: string,
 * }[]}
 */
function gitLog(from, to) {
    const range = from ? `${from}..${to}` : to;
    // RS (\x1e) between commits; US (\x1f) between fields.
    try {
        return execSync(
            `git log ${range} --pretty=format:%H%x1f%an%x1f%ae%x1f%s%x1f%b%x1e`,
            { encoding: "utf8" },
        )
            .split("\x1e")
            .map((chunk) => chunk.replace(/^\r?\n/, "").trimEnd())
            .filter(Boolean)
            .map((chunk) => {
                const [hash = "", authorName = "", authorEmail = "", subject = "", ...bodyParts] =
                    chunk.split("\x1f");
                return {
                    hash,
                    short: hash.slice(0, 7),
                    authorName: authorName.trim(),
                    authorEmail: authorEmail.trim(),
                    subject: subject.trim(),
                    body: bodyParts.join("\x1f").trim(),
                };
            })
            .filter((c) => c.hash);
    } catch {
        return [];
    }
}

/** @returns {string | null} */
function githubLoginFromEmail(email) {
    if (!email) return null;
    const m = email.trim().match(GITHUB_NOREPLY_RE);
    return m ? m[2] : null;
}

/** @returns {string | null} */
function githubLoginFromName(name) {
    const n = (name || "").trim();
    if (!n || !GITHUB_LOGIN_RE.test(n)) return null;
    return n;
}

function isBotContributor(login, name, email) {
    const id = `${login || ""} ${name || ""} ${email || ""}`.toLowerCase();
    return (
        (login && (/\[bot\]$/i.test(login) || /(-|_)bot$/i.test(login))) ||
        /\[bot\]/.test(name || "") ||
        /dependabot|github-actions|renovate|greenkeeper|imgbot/.test(id)
    );
}

/**
 * Unique people who authored commits in this release (incl. Co-authored-by).
 * @returns {{ login: string | null, name: string, key: string }[]}
 */
function collectContributors(commits) {
    /** @type {Map<string, { login: string | null, name: string, key: string }>} */
    const byKey = new Map();

    const add = (name, email) => {
        const login =
            githubLoginFromEmail(email) || githubLoginFromName(name);
        if (isBotContributor(login, name, email)) return;
        const display = (name || "").trim() || login;
        if (!display) return;
        const key = (login || email || display).toLowerCase();
        if (!key) return;
        if (byKey.has(key)) {
            if (login && !byKey.get(key).login) {
                byKey.set(key, { login, name: display, key });
            }
            return;
        }
        byKey.set(key, { login, name: display, key });
    };

    for (const commit of commits) {
        add(commit.authorName, commit.authorEmail);
        if (!commit.body) continue;
        for (const m of commit.body.matchAll(CO_AUTHOR_RE)) {
            add(m[1].trim(), m[2].trim());
        }
    }

    return [...byKey.values()].sort((a, b) => {
        const la = (a.login || a.name).toLowerCase();
        const lb = (b.login || b.name).toLowerCase();
        return la.localeCompare(lb);
    });
}

function formatContributorLabel(person) {
    if (person.login) {
        const label = person.name && person.name !== person.login
            ? person.name
            : person.login;
        return `[${label}](https://github.com/${person.login})`;
    }
    return person.name;
}

function contributorsSection(commits) {
    const people = collectContributors(commits);
    if (!people.length) return "";
    const lines = people.map((p) => `- ${formatContributorLabel(p)}`);
    return `## Contributors\n\n${lines.join("\n")}\n`;
}

function extractPr(subject) {
    const m = subject.match(PR_RE) || subject.match(MERGE_PR_RE);
    return m ? m[1] : null;
}

function stripPrSuffix(subject) {
    return subject.replace(PR_RE, "").trim();
}

function classify(subject) {
    const cleaned = stripPrSuffix(subject);
    const m = cleaned.match(COMMIT_RE);
    if (!m) {
        return { title: "Changes", summary: cleaned, skip: false };
    }

    const head = m[1].toLowerCase();
    const scope = (m[2] || "").trim().toLowerCase();
    // Keep summary wording as written (after stripping area/type prefix).
    const summary = m[3].trim();

    if (TYPE_ONLY.has(head) && RELEASE_CHORE_RE.test(summary)) {
        return { title: null, summary, skip: true };
    }

    if (SKIP_SUBJECT_RE.test(summary) || SKIP_SUBJECT_RE.test(cleaned)) {
        return { title: null, summary, skip: true };
    }

    // type(scope): summary → group by scope area when known
    if (scope) {
        const scopeKey = scope.split(/[/,]/)[0].trim();
        if (AREA_BY_KEY.has(scopeKey)) {
            return { title: AREA_BY_KEY.get(scopeKey), summary, skip: false };
        }
    }

    if (AREA_BY_KEY.has(head)) {
        return { title: AREA_BY_KEY.get(head), summary, skip: false };
    }

    if (TYPE_ONLY.has(head)) {
        return { title: "Changes", summary, skip: false };
    }

    // Unknown prefix (e.g. "monaco:") — treat prefix as area label, strip it.
    const title =
        head.charAt(0).toUpperCase() + head.slice(1).replace(/-/g, " ");
    return { title, summary, skip: false };
}

/** PR refs only — bare SHAs render as tiny monospace on GitHub. */
function formatBullet(summary, pr) {
    if (pr) return `- ${summary} (#${pr})`;
    return `- ${summary}`;
}

function resolveOverview(args) {
    if (args.overviewFile) {
        return readFileSync(args.overviewFile, "utf8").trim();
    }
    if (typeof args.overview === "string") {
        return args.overview.trim();
    }
    return "";
}

function compareFooter(repo, from, to) {
    const left = refLabel(from);
    let right = refLabel(to);
    if (!left) return "";
    if (!right || right === "HEAD") {
        // Prefer the tip tag name when to is HEAD and we're on a tag commit.
        try {
            right = execSync("git describe --tags --exact-match HEAD", {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();
        } catch {
            right = "HEAD";
        }
    }
    if (right === "HEAD") return "";
    return `\n**Full Changelog**: https://github.com/${repo}/compare/${left}...${right}`;
}

function renderNotes(commits, overview, { repo, from, to } = {}) {
    /** @type {Map<string, { summary: string, pr: string | null }[]>} */
    const buckets = new Map();
    for (const title of AREA_TITLE_ORDER) buckets.set(title, []);
    buckets.set("Changes", []);

    for (const commit of commits) {
        const pr = extractPr(commit.subject);
        const { title, summary, skip } = classify(commit.subject);
        if (skip || !title) continue;
        if (!buckets.has(title)) buckets.set(title, []);
        buckets.get(title).push({ summary, pr });
    }

    const parts = [];
    if (overview) {
        parts.push(overview);
        parts.push("");
    }

    let any = false;
    const sectionOrder = [...AREA_TITLE_ORDER, "Changes"];
    // Include any unexpected dynamic titles after known ones
    for (const title of buckets.keys()) {
        if (!sectionOrder.includes(title)) sectionOrder.push(title);
    }

    for (const title of sectionOrder) {
        const items = buckets.get(title);
        if (!items?.length) continue;
        any = true;
        parts.push(`## ${title}\n`);
        for (const item of items) {
            parts.push(formatBullet(item.summary, item.pr));
        }
        parts.push("");
    }

    const contributors = contributorsSection(commits);
    if (contributors) {
        parts.push(contributors.trimEnd());
        parts.push("");
    }

    const footer = compareFooter(repo || DEFAULT_REPO, from, to);
    if (footer) {
        if (any || overview || contributors) parts.push(footer.trimStart());
        else parts.push(footer.trim());
    }

    if (!any && !overview) {
        const head = contributors
            ? `${contributors.trim()}\n`
            : "No notable commits in this range.";
        return footer ? `${head}\n${footer.trim()}\n` : `${head}\n`;
    }
    return parts.join("\n").trim() + "\n";
}

const args = parseArgs(process.argv.slice(2));
const overview = resolveOverview(args);
const from = args.from ?? previousTag();
const to = args.to;

const commits = gitLog(from, to);

const notes = renderNotes(commits, overview, {
    repo: args.repo,
    from,
    to,
});

if (args.output) {
    writeFileSync(args.output, notes.endsWith("\n") ? notes : `${notes}\n`);
}

if (args.dryRun || !args.output) {
    process.stdout.write(notes.endsWith("\n") ? notes : `${notes}\n`);
}

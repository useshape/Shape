#!/usr/bin/env node
/**
 * Prepare a desktop release: bump version, sync manifests, preview notes.
 *
 * Versioning follows Zed-style 0.x.y cadence. Pre-releases use a `-pre` suffix
 * (e.g. 0.2.1-pre) and are published as GitHub prereleases.
 *
 * Usage:
 *   npm run release -- 0.2.0
 *   npm run release -- --patch
 *   npm run release -- --patch --pre --commit --tag --push
 *   npm run release -- --patch --overview "Ships …" --commit --tag --push
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkgPath = join(root, "package.json");
const VERSION_FILES = [
    "package.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
];

function usage() {
    console.log(`Usage:
  npm run release -- <version> [--pre] [--overview "..."] [--dry-run] [--commit] [--tag] [--push]
  npm run release -- --patch|--minor|--major [--pre] [--overview "..."] [--dry-run] [--commit] [--tag] [--push]

Examples:
  npm run release -- 0.2.0 --dry-run
  npm run release -- --patch --commit --tag --push
  npm run release -- --patch --pre --commit --tag --push
  npm run release -- --patch --overview "Ships workspace trust and tab scroll fixes." --commit --tag --push
`);
}

function parseArgs(argv) {
    const out = {
        version: null,
        bump: null,
        dryRun: false,
        commit: false,
        tag: false,
        push: false,
        help: false,
        overview: null,
        pre: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--help" || a === "-h") out.help = true;
        else if (a === "--dry-run") out.dryRun = true;
        else if (a === "--commit") out.commit = true;
        else if (a === "--tag") out.tag = true;
        else if (a === "--push") out.push = true;
        else if (a === "--pre") out.pre = true;
        else if (a === "--overview") out.overview = argv[++i];
        else if (a === "--patch" || a === "--minor" || a === "--major") out.bump = a.slice(2);
        else if (a.startsWith("-")) {
            console.error(`Unknown flag: ${a}`);
            process.exit(1);
        } else out.version = a;
    }
    return out;
}

function baseSemver(version) {
    const m = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) throw new Error(`Cannot parse semver version: ${version}`);
    return `${m[1]}.${m[2]}.${m[3]}`;
}

function bumpSemver(version, kind) {
    const m = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) throw new Error(`Cannot bump non-semver version: ${version}`);
    let major = Number(m[1]);
    let minor = Number(m[2]);
    let patch = Number(m[3]);
    if (kind === "major") {
        major += 1;
        minor = 0;
        patch = 0;
    } else if (kind === "minor") {
        minor += 1;
        patch = 0;
    } else {
        patch += 1;
    }
    return `${major}.${minor}.${patch}`;
}

function withPre(version, pre) {
    const base = baseSemver(version);
    if (!pre) return base;
    // Allow explicit versions that already include -pre
    if (/-pre(?:\.|$)/i.test(version) || version.endsWith("-pre")) {
        return `${base}-pre`;
    }
    return `${base}-pre`;
}

function run(cmd, { dryRun, allowFail = false } = {}) {
    console.log(`$ ${cmd}`);
    if (dryRun) return { ok: true };
    try {
        execSync(cmd, { cwd: root, stdio: "inherit" });
        return { ok: true };
    } catch (err) {
        if (allowFail) return { ok: false };
        throw err;
    }
}

function capture(cmd) {
    try {
        return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
    } catch {
        return "";
    }
}

function hasStagedChanges() {
    try {
        execSync("git diff --cached --quiet", { cwd: root, stdio: "ignore" });
        return false;
    } catch {
        return true;
    }
}

function tagExists(tag) {
    return Boolean(capture(`git tag -l ${tag}`));
}

function shellQuote(s) {
    if (process.platform === "win32") {
        return `"${String(s).replace(/"/g, '\\"')}"`;
    }
    return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || (!args.version && !args.bump)) {
        usage();
        process.exit(args.help ? 0 : 1);
    }
    if (args.push && !args.tag) {
        console.error("--push requires --tag");
        process.exit(1);
    }

    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const previous = pkg.version;
    let next = args.version ?? bumpSemver(previous, args.bump);
    // Explicit version may already include -pre; --pre forces the suffix.
    if (args.pre || /-\w/.test(next)) {
        next = withPre(next, true);
    } else {
        next = withPre(next, false);
    }
    // If user passed --pre with a bump, ensure -pre even when version was computed clean.
    if (args.pre) next = withPre(next, true);

    if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(next)) {
        console.error(`Invalid version: ${next}`);
        process.exit(1);
    }

    const tag = `v${next}`;
    console.log(`Release ${previous} → ${next} (${tag})${args.dryRun ? " [dry-run]" : ""}`);

    if (previous !== next) {
        if (args.dryRun) {
            console.log(`Would set package.json version to ${next}`);
        } else {
            pkg.version = next;
            writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
            console.log(`Updated package.json to ${next}`);
        }
    } else {
        console.log("Version already set; syncing manifests only");
    }

    run("node scripts/release/version.mjs", { dryRun: args.dryRun });

    const notesCmd = args.overview
        ? `node scripts/release/notes.mjs --overview ${shellQuote(args.overview)}`
        : "node scripts/release/notes.mjs";
    run(notesCmd, { dryRun: false });

    if (args.commit) {
        run(`git add ${VERSION_FILES.join(" ")}`, { dryRun: args.dryRun });
        if (args.dryRun) {
            console.log(`$ git commit -m "chore: release ${tag}"`);
        } else if (!hasStagedChanges()) {
            console.log("Nothing new in version files to commit (already synced).");
        } else {
            run(`git commit -m "chore: release ${tag}"`, { dryRun: false });
        }
    }

    if (args.tag) {
        if (!args.dryRun && tagExists(tag)) {
            console.error(
                `Tag ${tag} already exists.\n` +
                    `Delete it and recreate after your fix is on main:\n` +
                    `  git tag -d ${tag}\n` +
                    `  git push origin :refs/tags/${tag}\n` +
                    `  npm run release -- ${next} --tag --push`,
            );
            process.exit(1);
        }
        run(`git tag ${tag}`, { dryRun: args.dryRun });
    }

    if (args.push) {
        run("git push", { dryRun: args.dryRun, allowFail: false });
        run(`git push origin ${tag}`, { dryRun: args.dryRun });
    }

    if (!args.push) {
        console.log(`
Next steps (commit any other fixes first, e.g. workflows):
  git add -A && git commit -m "ci: polish windows release assets"
  git push
  npm run release -- ${next} --tag --push
`);
    } else if (!args.dryRun) {
        console.log(`\nPushed ${tag}. Watch the Release workflow on GitHub.`);
    }
}

main();

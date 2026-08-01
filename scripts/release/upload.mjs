#!/usr/bin/env node
/**
 * Reliably upload release assets.
 * Avoids softprops + intermittent uploads.github.com "Error creating policy" (502).
 *
 *   node scripts/release/upload.mjs --tag v0.2.0 --dir dist/release --publish
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

function parseArgs(argv) {
  const out = {
    tag: null,
    dir: null,
    files: [],
    publish: false,
    notesFile: null,
    prerelease: false,
    repo: "useshape/Shape",
    releaseId: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tag") out.tag = argv[++i];
    else if (a === "--dir") out.dir = argv[++i];
    else if (a === "--file") out.files.push(argv[++i]);
    else if (a === "--publish") out.publish = true;
    else if (a === "--notes-file") out.notesFile = argv[++i];
    else if (a === "--prerelease") out.prerelease = true;
    else if (a === "--repo") out.repo = argv[++i];
    else if (a === "--release-id") out.releaseId = Number(argv[++i]);
  }
  return out;
}

function gh(args, opts = {}) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: opts.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function sleep(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

function withRetry(label, fn, attempts = 8) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return fn(attempt);
    } catch (err) {
      lastErr = err;
      const msg = String(err?.stderr || err?.message || err);
      const retryable =
        /503|502|504|429|Error creating policy|No server is currently available/i.test(
          msg,
        );
      console.warn(`${label} failed (attempt ${attempt}): ${msg.split("\n")[0]}`);
      if (!retryable || attempt === attempts) break;
      const wait = Math.min(60_000, 3000 * 2 ** (attempt - 1));
      console.warn(`Retry in ${Math.round(wait / 1000)}s`);
      sleep(wait);
    }
  }
  throw lastErr;
}

function token() {
  return (
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN ||
    gh(["auth", "token"]).trim()
  );
}

function findRelease(repo, tag) {
  // Prefer `gh release view` — works for drafts (/releases/tags/:tag omits them,
  // and the list endpoint can lag right after create).
  try {
    const view = ghJson([
      "release",
      "view",
      tag,
      "--repo",
      repo,
      "--json",
      "databaseId,isDraft,tagName,name,url",
    ]);
    if (view?.databaseId) {
      return {
        id: view.databaseId,
        tag_name: view.tagName || tag,
        name: view.name || tag,
        draft: Boolean(view.isDraft),
        html_url: view.url,
      };
    }
  } catch {
    /* not found yet */
  }

  try {
    const releases = ghJson(["api", `repos/${repo}/releases?per_page=100`]);
    return releases.find((r) => r.tag_name === tag || r.name === tag) || null;
  } catch {
    return null;
  }
}

function waitForRelease(repo, tag, attempts = 12) {
  for (let i = 1; i <= attempts; i++) {
    const rel = findRelease(repo, tag);
    if (rel) return rel;
    const wait = Math.min(15_000, 500 * 2 ** (i - 1));
    console.warn(
      `Release ${tag} not visible yet (attempt ${i}/${attempts}); retry in ${Math.round(wait / 1000)}s`,
    );
    sleep(wait);
  }
  return null;
}

function createDraftViaApi(repo, tag, { notesFile, prerelease }) {
  const body = {
    tag_name: tag,
    name: tag,
    draft: true,
    prerelease: Boolean(prerelease),
    body:
      notesFile && existsSync(notesFile)
        ? readFileSync(notesFile, "utf8")
        : "",
  };

  return withRetry("create draft", () => {
    const dir = mkdtempSync(join(tmpdir(), "shape-release-"));
    const tmp = join(dir, "body.json");
    writeFileSync(tmp, JSON.stringify(body));
    try {
      return ghJson([
        "api",
        "--method",
        "POST",
        `repos/${repo}/releases`,
        "--input",
        tmp,
      ]);
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  });
}

function ensureDraft(repo, tag, { notesFile, prerelease, releaseId }) {
  if (releaseId) {
    console.log(`Using release id=${releaseId}`);
    return { id: releaseId, tag_name: tag, draft: true };
  }

  let rel = findRelease(repo, tag);
  if (rel) {
    console.log(`Found release id=${rel.id} draft=${rel.draft}`);
    return rel;
  }

  rel = createDraftViaApi(repo, tag, { notesFile, prerelease });
  if (rel?.id) {
    console.log(`Created draft id=${rel.id} draft=${rel.draft}`);
    return rel;
  }

  rel = waitForRelease(repo, tag);
  if (!rel) throw new Error(`Created release ${tag} but could not load it`);
  return rel;
}

async function deleteAssetIfExists(repo, releaseId, name) {
  try {
    const assets = ghJson([
      "api",
      `repos/${repo}/releases/${releaseId}/assets`,
    ]);
    const existing = assets.find((a) => a.name === name);
    if (!existing) return;
    console.log(`Deleting existing ${name}`);
    try {
      gh(
        ["api", "-X", "DELETE", `repos/${repo}/releases/assets/${existing.id}`],
        { inherit: true },
      );
    } catch {
      /* ignore delete races / 404 */
    }
  } catch {
    /* list assets can 503 — skip delete and let upload conflict-retry */
  }
}

async function uploadOne(repo, releaseId, filePath, auth, attempt) {
  const name = basename(filePath);
  const size = statSync(filePath).size;
  await deleteAssetIfExists(repo, releaseId, name);

  const url = `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`;
  console.log(
    `Uploading ${name} (${(size / 1024 / 1024).toFixed(1)} MiB) attempt ${attempt}`,
  );

  // Buffer small-ish files; NSIS installers are ~25MB — fine in memory for reliability.
  const body = readFileSync(filePath);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.length),
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  console.log(`OK ${name}`);
  return data;
}

async function uploadWithRetry(repo, releaseId, filePath, auth) {
  let lastErr;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await uploadOne(repo, releaseId, filePath, auth, attempt);
      return;
    } catch (err) {
      lastErr = err;
      const status = err.status || 0;
      const retryable =
        status === 0 || status === 408 || status === 429 || status >= 500;
      console.warn(String(err.message || err));
      if (!retryable || attempt === 8) break;
      const wait = Math.min(60_000, 3000 * 2 ** (attempt - 1));
      console.warn(`Retry in ${Math.round(wait / 1000)}s`);
      sleep(wait);
    }
  }
  throw lastErr;
}

function collectFiles(args) {
  const files = [...args.files];
  if (args.dir) {
    for (const name of readdirSync(args.dir)) {
      const full = join(args.dir, name);
      if (statSync(full).isFile()) files.push(full);
    }
  }
  return files.filter((f) => existsSync(f)).sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tag) {
    console.error(
      "Usage: node scripts/release/upload.mjs --tag v0.2.0 --dir dist/release --publish",
    );
    process.exit(1);
  }
  const files = collectFiles(args);
  if (!files.length) {
    console.error("No files to upload");
    process.exit(1);
  }

  const auth = token();
  const rel = ensureDraft(args.repo, args.tag, args);

  for (const file of files) {
    await uploadWithRetry(args.repo, rel.id, file, auth);
  }

  if (args.publish) {
    withRetry("publish release", () => {
      const edit = [
        "release",
        "edit",
        args.tag,
        "--repo",
        args.repo,
        "--draft=false",
      ];
      if (args.prerelease) edit.push("--prerelease");
      gh(edit, { inherit: true });
    });
  }

  const view = withRetry("view release", () =>
    ghJson([
      "release",
      "view",
      args.tag,
      "--repo",
      args.repo,
      "--json",
      "url,isDraft,assets",
    ]),
  );
  console.log(
    JSON.stringify(
      {
        url: view.url,
        draft: view.isDraft,
        assets: (view.assets || []).map((a) => a.name),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

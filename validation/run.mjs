import { spawn } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveToken } from "./auth.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHAPE_ROOT = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(SHAPE_ROOT, "..");
const TAURI_DIR = path.join(SHAPE_ROOT, "src-tauri");
const API_BASE = (
  process.env.NEXT_PUBLIC_SHAPE_WEBSITE_URL || "https://www.useshape.org"
).replace(/\/$/, "");
const APP_VERSION = JSON.parse(
  await readFile(path.join(SHAPE_ROOT, "package.json"), "utf8"),
).version;

async function envFileValue(file, key) {
  try {
    const text = await readFile(file, "utf8");
    const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    if (!line) return null;
    return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") || null;
  } catch {
    return null;
  }
}

async function buildSecret() {
  if (process.env.SHAPE_CLOUD_BUILD_SECRET?.trim()) {
    return process.env.SHAPE_CLOUD_BUILD_SECRET.trim();
  }
  const files = [
    path.join(SHAPE_ROOT, ".env.local"),
    path.join(SHAPE_ROOT, ".env"),
    path.join(REPO_ROOT, "website", ".env.local"),
    path.join(REPO_ROOT, "website", ".env"),
    path.join(REPO_ROOT, "server", ".env"),
  ];
  for (const file of files) {
    const value = await envFileValue(file, "SHAPE_CLOUD_BUILD_SECRET");
    if (value) return value;
  }
  return null;
}

function parseArgs(argv) {
  const out = { login: false, files: [], prompt: null, ids: null, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--login") out.login = true;
    else if (arg === "--file" || arg === "-f") out.files.push(argv[++i]);
    else if (arg === "--prompt" || arg === "-p") out.prompt = argv[++i];
    else if (arg === "--ids") out.ids = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--limit") out.limit = Number(argv[++i]);
    else if (!arg.startsWith("-")) out.prompt = out.prompt ? `${out.prompt} ${arg}` : arg;
  }
  return out;
}

async function loadIndex() {
  return JSON.parse(await readFile(path.join(HERE, "prompts", "index.json"), "utf8"));
}

async function selectedPrompts(args) {
  if (args.prompt) {
    return [{ id: "adhoc", text: args.prompt, expect: "files" }];
  }
  if (args.files.length) {
    const out = [];
    for (const file of args.files) {
      const full = path.isAbsolute(file) ? file : path.join(HERE, file);
      out.push({
        id: path.basename(full, path.extname(full)),
        text: await readFile(full, "utf8"),
        expect: "files",
      });
    }
    return out;
  }
  const index = await loadIndex();
  let items = index;
  if (args.ids?.length) {
    const want = new Set(args.ids);
    items = index.filter((item) => want.has(item.id));
  }
  if (args.limit > 0) items = items.slice(0, args.limit);
    const out = [];
  for (const item of items) {
    out.push({
      id: item.id,
      text: await readFile(path.join(HERE, "prompts", item.file), "utf8"),
      expect: item.expect || "files",
      seed: item.seed || null,
    });
  }
  return out;
}

function runCargo(env) {
  return new Promise((resolve, reject) => {
    const child = spawn("cargo", ["run", "--", "--prompt"], {
      cwd: TAURI_DIR,
      env,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`cargo run killed (${signal})`));
      else resolve(code ?? 1);
    });
  });
}

const args = parseArgs(process.argv.slice(2));
const session = await resolveToken({ forceLogin: args.login });
if (args.login && !args.prompt && args.files.length === 0 && !args.ids && args.limit == null) {
  process.exit(0);
}

const prompts = await selectedPrompts(args);
if (!prompts.length) {
  console.error("No prompts selected.");
  process.exit(2);
}
const secret = await buildSecret();
if (!secret) {
  console.error(
    "No SHAPE_CLOUD_BUILD_SECRET found. Cloud AI rejects unsigned debug builds.",
  );
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const versionDir = path.join(HERE, "runs", `${APP_VERSION}-${stamp}`);
const jail = versionDir;
await mkdir(path.join(versionDir, "prompts"), { recursive: true });
await cp(path.join(HERE, "prompts"), path.join(versionDir, "prompts"), { recursive: true });

const jobs = [];
for (const prompt of prompts) {
  const jobRoot = path.join(versionDir, "jobs", prompt.id);
  const project = path.join(jobRoot, "workspace");
  const logs = path.join(jobRoot, "logs");
  await mkdir(project, { recursive: true });
  await mkdir(logs, { recursive: true });
  if (prompt.seed) {
    const seedDir = path.isAbsolute(prompt.seed)
      ? prompt.seed
      : path.join(HERE, "prompts", prompt.seed);
    await cp(seedDir, project, { recursive: true });
  }
  const promptFile = path.join(jobRoot, "prompt.txt");
  await writeFile(promptFile, prompt.text, "utf8");
  jobs.push({
    id: prompt.id,
    prompt_file: promptFile,
    project,
    logs,
    expect: prompt.expect,
  });
}

const manifestPath = path.join(versionDir, "manifest.json");
const suitePath = path.join(versionDir, "suite.json");
await writeFile(
  manifestPath,
  JSON.stringify({ jail, jobs }, null, 2),
  "utf8",
);
console.error(`version: ${path.relative(HERE, versionDir)}`);
console.error(`jobs: ${jobs.length} (sequential, one sandbox each)`);

const code = await runCargo({
  ...process.env,
  NEXT_PUBLIC_SHAPE_WEBSITE_URL: API_BASE,
  SHAPE_ACCESS_TOKEN: session.accessToken,
  SHAPE_CLOUD_BUILD_SECRET: secret,
  SHAPE_PROMPT_MANIFEST: manifestPath,
  SHAPE_VALIDATION_JAIL: jail,
  SHAPE_SUITE_SUMMARY: suitePath,
});
process.exit(code);

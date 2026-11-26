/**
 * FrontierHarness Eval v1.1 through Shape's headless validator.
 *
 * Folder is fixed so a later run does not depend on the shell cwd:
 *   C:\Users\User\Desktop\shape-monorepo\shape\validation\frontier-harness
 *
 * Model is GLM 5.3 Flash (`z-ai/glm-5.3-flash`): free in the Shape catalog,
 * and one of the five models in the published v1.1 leaderboard.
 *
 *   node validation/frontier-harness/run.mjs
 *   node validation/frontier-harness/run.mjs --tasks regex-log
 *   node validation/frontier-harness/run.mjs --all
 *
 * One attempt per task. Official scores use four attempts inside a fresh
 * Runta runtime. This runner is the local Shape harness, then the task's
 * own verifier in Docker.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveToken } from "../auth.mjs";

const EVAL_ROOT =
  "C:\\Users\\User\\Desktop\\shape-monorepo\\shape\\validation\\frontier-harness";
const SHAPE_ROOT = path.resolve(EVAL_ROOT, "..", "..");
const REPO_ROOT = path.resolve(SHAPE_ROOT, "..");
const TAURI_DIR = path.join(SHAPE_ROOT, "src-tauri");

const config = JSON.parse(await readFile(path.join(EVAL_ROOT, "config.json"), "utf8"));
const ALL_TASKS = JSON.parse(await readFile(path.join(EVAL_ROOT, "tasks.json"), "utf8"));

function parseArgs(argv) {
  const out = {
    tasks: null,
    all: false,
    downloadOnly: false,
    skipAgent: false,
    maxTimeoutSec: null,
    untilSec: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") out.all = true;
    else if (arg === "--download-only") out.downloadOnly = true;
    else if (arg === "--skip-agent") out.skipAgent = true;
    else if (arg === "--max-timeout-sec") out.maxTimeoutSec = Number(argv[++i]);
    else if (arg === "--until-sec") out.untilSec = Number(argv[++i]);
    else if (arg === "--tasks") {
      out.tasks = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return out;
}

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

async function hfTree(repo, rev, prefix) {
  const url = `https://huggingface.co/api/datasets/${repo}/tree/${rev}/${prefix}?recursive=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function downloadTask(name) {
  const dest = path.join(EVAL_ROOT, "tasks", name);
  const marker = path.join(dest, "instruction.md");
  try {
    await stat(marker);
    return dest;
  } catch {
    /* fetch */
  }
  let listing = null;
  let source = null;
  for (const src of config.sources) {
    listing = await hfTree(src.repo, src.rev, `tasks/${name}`);
    if (listing?.some((row) => row.type === "file" && row.path.endsWith("instruction.md"))) {
      source = src;
      break;
    }
    listing = null;
  }
  if (!listing || !source) {
    throw new Error(`No FrontierHarness task package for ${name}`);
  }
  for (const row of listing) {
    if (row.type !== "file") continue;
    if (row.path.includes("/solution/")) continue;
    const rel = row.path.slice(`tasks/${name}/`.length);
    const file = path.join(dest, rel);
    await mkdir(path.dirname(file), { recursive: true });
    const rawUrl = `https://huggingface.co/datasets/${source.repo}/resolve/${source.rev}/${row.path}`;
    const res = await fetch(rawUrl);
    if (!res.ok) throw new Error(`Download failed ${res.status} ${rawUrl}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(file, buf);
  }
  return dest;
}

function imageTag(name) {
  return `shape-fh-${name}`.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}

function pinnedImage(taskToml) {
  const match = taskToml.match(/docker_image\s*=\s*"([^"]+)"/);
  return match ? match[1] : null;
}

async function ensureImage(taskDir, name) {
  const tag = imageTag(name);
  const toml = await readFile(path.join(taskDir, "task.toml"), "utf8").catch(() => "");
  const pinned = pinnedImage(toml);
  if (pinned) {
    const pull = await run("docker", ["pull", pinned]);
    if (pull === 0) {
      const tagged = await run("docker", ["tag", pinned, tag]);
      if (tagged !== 0) throw new Error(`docker tag ${pinned} exited ${tagged}`);
      return tag;
    }
    process.stderr.write(`pull failed for ${pinned}; building ${name} locally\n`);
  }
  const envDir = path.join(taskDir, "environment");
  const code = await run("docker", ["build", "-t", tag, envDir], { cwd: envDir });
  if (code !== 0) throw new Error(`docker build ${name} exited ${code}`);
  return tag;
}

function capture(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${cmd} killed (${signal})`));
      else resolve({ code: code ?? 1, out, err });
    });
  });
}

async function seedFromImage(tag, workspace) {
  const cid = `shape-fh-seed-${Date.now()}`;
  const created = await run("docker", ["create", "--name", cid, tag]);
  if (created !== 0) throw new Error(`docker create ${tag} exited ${created}`);
  try {
    const inspected = await capture("docker", ["inspect", "-f", "{{.Config.WorkingDir}}", cid]);
    const workdir = inspected.out.trim() || "/app";
    const roots = [...new Set(["/app", workdir, "/workspace"].filter(Boolean))];
    for (const root of roots) {
      const copied = await run("docker", ["cp", `${cid}:${root}/.`, workspace]);
      if (copied === 0) return;
    }
    throw new Error(`docker cp found no /app or ${workdir} in ${tag}`);
  } finally {
    await run("docker", ["rm", cid]);
  }
}

function agentTimeoutSec(taskToml) {
  const match = taskToml.match(/\[agent\][\s\S]*?timeout_sec\s*=\s*([0-9.]+)/);
  const sec = match ? Math.ceil(Number(match[1])) : 12 * 60;
  return Number.isFinite(sec) && sec > 0 ? sec : 12 * 60;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: opts.stdio || "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${cmd} killed (${signal})`));
      else resolve(code ?? 1);
    });
  });
}

async function verify(tag, taskDir, workspace, logDir) {
  const tests = path.join(taskDir, "tests");
  const verifierLogs = path.join(logDir, "verifier");
  await mkdir(verifierLogs, { recursive: true });
  const code = await run(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${workspace}:/app`,
      "-v",
      `${tests}:/tests`,
      "-v",
      `${verifierLogs}:/logs`,
      "-w",
      "/app",
      tag,
      "bash",
      "/tests/test.sh",
    ],
    { cwd: workspace },
  );
  let reward = null;
  try {
    reward = (await readFile(path.join(verifierLogs, "verifier", "reward.txt"), "utf8")).trim();
  } catch {
    reward = null;
  }
  return { reward, dockerExit: code, passed: reward === "1" };
}

const args = parseArgs(process.argv.slice(2));
const selected = args.all ? ALL_TASKS : args.tasks || config.smokeTasks;

const prepared = [];
for (const name of selected) {
  process.stderr.write(`task package: ${name}\n`);
  const taskDir = await downloadTask(name);
  prepared.push({ name, taskDir });
}
if (args.downloadOnly) process.exit(0);

if (args.maxTimeoutSec > 0) {
  const kept = [];
  for (const task of prepared) {
    const toml = await readFile(path.join(task.taskDir, "task.toml"), "utf8").catch(() => "");
    const sec = agentTimeoutSec(toml);
    if (sec <= args.maxTimeoutSec) kept.push(task);
    else process.stderr.write(`skip ${task.name}: agent timeout ${sec}s\n`);
  }
  prepared.length = 0;
  prepared.push(...kept);
}

if (args.untilSec > 0) {
  const preferred = "fix-git";
  prepared.sort((a, b) => Number(b.name === preferred) - Number(a.name === preferred));
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const versionDir = path.join(EVAL_ROOT, "runs", stamp);
await mkdir(versionDir, { recursive: true });

async function prepareJob(task) {
  const jobRoot = path.join(versionDir, "jobs", task.name);
  const project = path.join(jobRoot, "workspace");
  const logs = path.join(jobRoot, "logs");
  await mkdir(project, { recursive: true });
  await mkdir(logs, { recursive: true });
  process.stderr.write(`image: ${task.name}\n`);
  const tag = await ensureImage(task.taskDir, task.name);
  await seedFromImage(tag, project);
  const instruction = await readFile(path.join(task.taskDir, "instruction.md"), "utf8");
  const promptFile = path.join(jobRoot, "prompt.txt");
  await writeFile(
    promptFile,
    `The workspace folder is /app from the task. A path that starts with /app/ is a file in this workspace.\n\n${instruction}`,
    "utf8",
  );
  const toml = await readFile(path.join(task.taskDir, "task.toml"), "utf8").catch(() => "");
  return {
    id: task.name,
    prompt_file: promptFile,
    project,
    logs,
    expect: "files",
    taskDir: task.taskDir,
    tag,
    timeoutSec: agentTimeoutSec(toml),
  };
}

const suitePath = path.join(versionDir, "suite.json");

async function writeManifest(slice) {
  const manifestPath = path.join(versionDir, "manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        jail: versionDir,
        jobs: slice.map(({ id, prompt_file, project, logs, expect }) => ({
          id,
          prompt_file,
          project,
          logs,
          expect,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
  return manifestPath;
}

async function runAgent(slice, perTaskTimeout) {
  const session = await resolveToken({ forceLogin: false });
  const secret = await buildSecret();
  if (!secret) {
    console.error("No SHAPE_CLOUD_BUILD_SECRET found. Cloud AI rejects unsigned debug builds.");
    process.exit(2);
  }
  const apiBase = (
    process.env.NEXT_PUBLIC_SHAPE_WEBSITE_URL || "https://www.useshape.org"
  ).replace(/\/$/, "");
  const manifestPath = await writeManifest(slice);
  return run("cargo", ["run", "--", "--prompt"], {
    cwd: TAURI_DIR,
    env: {
      ...process.env,
      NEXT_PUBLIC_SHAPE_WEBSITE_URL: apiBase,
      SHAPE_ACCESS_TOKEN: session.accessToken,
      SHAPE_CLOUD_BUILD_SECRET: secret,
      SHAPE_PROMPT_MANIFEST: manifestPath,
      SHAPE_VALIDATION_JAIL: versionDir,
      SHAPE_SUITE_SUMMARY: suitePath,
      SHAPE_VALIDATION_MODEL: config.model,
      SHAPE_VALIDATION_EFFORT: config.effort,
      SHAPE_VALIDATION_OPTIMIZE: "0",
      SHAPE_VALIDATION_GOLDFISH: "0",
      SHAPE_VALIDATION_TIMEOUT_SEC: String(perTaskTimeout),
    },
  });
}

let agentExit = 0;
let ranJobs = [];
if (!args.skipAgent) {
  process.stderr.write(
    `model: ${config.model}\ndataset: ${config.dataset}\ncandidates: ${prepared.length}\n`,
  );
  if (args.untilSec > 0) {
    const started = Date.now();
    const merged = [];
    for (const task of prepared) {
      if (ranJobs.length && Date.now() - started >= args.untilSec * 1000) {
        process.stderr.write(`budget reached after ${ranJobs.length} tasks\n`);
        break;
      }
      const job = await prepareJob(task);
      const code = await runAgent([job], job.timeoutSec);
      if (code !== 0) agentExit = code;
      ranJobs.push(job);
      try {
        const piece = JSON.parse(await readFile(suitePath, "utf8"));
        merged.push(...(piece.jobs || []));
      } catch {
        /* empty */
      }
    }
    await writeFile(
      suitePath,
      JSON.stringify({ failed: merged.filter((j) => j.completed === false || j.ok === false).length, jobs: merged }, null, 2),
      "utf8",
    );
  } else {
    const jobs = [];
    for (const task of prepared) {
      jobs.push(await prepareJob(task));
    }
    const timeoutSec = Math.max(12 * 60, ...jobs.map((job) => job.timeoutSec));
    process.stderr.write(`jobs: ${jobs.length}\ntimeoutSec: ${timeoutSec}\n`);
    if (jobs.length) agentExit = await runAgent(jobs, timeoutSec);
    ranJobs = jobs;
  }
} else {
  for (const task of prepared) {
    ranJobs.push(await prepareJob(task));
  }
}

let suite = { jobs: [] };
try {
  suite = JSON.parse(await readFile(suitePath, "utf8"));
} catch {
  /* agent did not write a suite */
}

const jobsToScore = ranJobs;

const results = [];
for (const job of jobsToScore) {
  process.stderr.write(`verifier: ${job.id}\n`);
  const verdict = await verify(job.tag, job.taskDir, job.project, job.logs);
  const agent = (suite.jobs || []).find((row) => row.id === job.id) || null;
  results.push({ id: job.id, agent, verifier: verdict });
}

const passed = results.filter((row) => row.verifier.passed).length;
const report = {
  dataset: config.dataset,
  model: config.model,
  effort: config.effort,
  attempts: 1,
  tasks: results.length,
  verifierPasses: passed,
  passRate: results.length ? passed / results.length : 0,
  agentExit,
  note: "One local attempt per task. Published FrontierHarness cells are 4 attempts on Runta. A subset is not a leaderboard score.",
  results,
};
const reportPath = path.join(versionDir, "report.json");
await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
process.stderr.write(`report: ${reportPath}\npasses: ${passed}/${results.length}\n`);
process.exit(passed === results.length && agentExit === 0 ? 0 : 1);

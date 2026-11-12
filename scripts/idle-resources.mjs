#!/usr/bin/env node
/**
 * Sample Shape.exe USER/GDI/handle growth while idle.
 *
 *   bun run test:idle
 *   bun run test:idle -- --duration 1800
 *   bun run test:idle -- --history
 *
 * Attaches to a running Shape.exe when present. Set SHAPE_EXE to launch a
 * binary, or SHAPE_IDLE_ALLOW_MISSING=1 to analyze ram-debug.log only.
 */

import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "tests", "diagnostics");
const USER_PER_MIN_FAIL = 30;
const MIN_SLOPE_SECS = 300;

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) return process.argv[idx + 1] ?? fallback;
  const flag = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (flag) return flag.slice(name.length + 3);
  return fallback;
}

const durationSec = Number(arg("duration", process.env.SHAPE_IDLE_DURATION || "600"));
const historyOnly = process.argv.includes("--history");
const allowMissing =
  process.argv.includes("--allow-missing") || process.env.SHAPE_IDLE_ALLOW_MISSING === "1";

function ramLogPath() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return path.join(local, "shape", "ram-debug.log");
}

function parseRamLine(line) {
  if (!line.includes("[ram]")) return null;
  const num = (key) => {
    const match = line.match(new RegExp(`(?:^|\\s)${key}=(-?\\d+(?:\\.\\d+)?)`));
    return match ? Number(match[1]) : null;
  };
  const elapsed = line.match(/(?:^|\s)t=(\d+(?:\.\d+)?)s/);
  return {
    seq: num("seq"),
    t: elapsed ? Number(elapsed[1]) : num("t"),
    handles: num("handles"),
    gdi: num("gdi"),
    user: num("user"),
    children: num("children"),
    childrenUser: num("children_user"),
    childrenGdi: num("children_gdi"),
    childrenHandles: num("children_handles"),
    raw: line.trim(),
  };
}

function readLogSamples(file, sinceBytes = 0) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8").slice(sinceBytes);
  return text
    .split(/\r?\n/)
    .map(parseRamLine)
    .filter((row) => row && row.user != null);
}

function slope(samples, field, fallbackSec) {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dtSec = (last.t ?? 0) - (first.t ?? 0);
  const minutes = Math.max(0.05, (dtSec >= 30 ? dtSec : fallbackSec) / 60);
  const a = first[field];
  const b = last[field];
  if (a == null || b == null) return null;
  return (b - a) / minutes;
}

function summarize(samples, duration) {
  const start = samples[0];
  const end = samples[samples.length - 1];
  const window = samples.filter((row) => {
    const t = row.t ?? 0;
    const lastT = end?.t ?? 0;
    return t >= lastT - Math.min(duration, 600);
  });
  const longEnough = duration >= MIN_SLOPE_SECS && window.length >= 2;
  const userSlope = slope(window, "user", duration);
  const childSlope = slope(window, "childrenUser", duration);
  const fail =
    longEnough && userSlope != null && userSlope > USER_PER_MIN_FAIL;
  return {
    samples: samples.length,
    durationSec: duration,
    startUser: start?.user ?? null,
    endUser: end?.user ?? null,
    startHandles: start?.handles ?? null,
    endHandles: end?.handles ?? null,
    startGdi: start?.gdi ?? null,
    endGdi: end?.gdi ?? null,
    startChildUser: start?.childrenUser ?? null,
    endChildUser: end?.childrenUser ?? null,
    userPerMin: userSlope,
    childUserPerMin: childSlope,
    fail,
    thresholdUserPerMin: USER_PER_MIN_FAIL,
    failWindowSec: MIN_SLOPE_SECS,
  };
}

function findShapePid() {
  if (process.platform !== "win32") return null;
  try {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(Shape|shape)\\.exe$' } | Select-Object -First 1 -ExpandProperty ProcessId",
      ],
      { encoding: "utf8" },
    ).trim();
    const pid = Number(out);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function launchShape() {
  const exe = process.env.SHAPE_EXE;
  if (exe && fs.existsSync(exe)) {
    return spawn(exe, [], { detached: true, stdio: "ignore" });
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const jsonlPath = path.join(OUT_DIR, `idle-${stamp}.jsonl`);
const summaryPath = path.join(OUT_DIR, `idle-${stamp}.json`);
const logFile = ramLogPath();

const startedPid = findShapePid();
let child = null;
if (!historyOnly && !startedPid) {
  child = launchShape();
}

const attachPid = startedPid || findShapePid();
const mode = historyOnly ? "history" : attachPid || child ? "live" : "log-only";

if (mode === "log-only" && !allowMissing && !historyOnly) {
  const msg = {
    error: "Shape.exe is not running. Start the app, set SHAPE_EXE, or pass --history / --allow-missing.",
    logFile,
  };
  fs.writeFileSync(summaryPath, JSON.stringify(msg, null, 2));
  console.error(JSON.stringify(msg, null, 2));
  process.exit(2);
}

const startSize = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
const live = [];
const deadline = Date.now() + durationSec * 1000;

if (!historyOnly && (attachPid || child || allowMissing)) {
  while (Date.now() < deadline) {
    const rows = readLogSamples(logFile, startSize);
    for (const row of rows) {
      if (live.some((item) => item.seq === row.seq && item.t === row.t)) continue;
      live.push(row);
      fs.appendFileSync(jsonlPath, `${JSON.stringify(row)}\n`);
    }
    await sleep(10_000);
  }
}

const historical = readLogSamples(logFile);
const samples = live.length >= 2 ? live : historical.slice(-Math.ceil(durationSec / 10) - 1);
const summary = {
  ...summarize(samples, durationSec),
  mode,
  pid: attachPid,
  logFile,
  jsonlPath,
  launched: Boolean(child),
};
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

if (child) {
  try {
    child.unref();
  } catch {
    /* ignore */
  }
}

if (summary.fail && mode === "live") process.exit(1);
process.exit(0);

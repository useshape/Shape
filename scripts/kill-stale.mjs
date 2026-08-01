import { execSync } from "node:child_process";
import { platform } from "node:os";

const DEV_PORT = 48921;

if (process.env.SKIP_KILL_STALE_SHAPE === "1") {
  process.exit(0);
}

function tryExec(command) {
  try {
    execSync(command, { stdio: "ignore", shell: true });
  } catch {
    /* ignore */
  }
}

tryExec(platform() === "win32" ? "taskkill /F /IM app.exe" : 'pkill -f "target/debug/app" || true');

if (platform() === "win32") {
  try {
    const out = execSync(`netstat -ano | findstr :${DEV_PORT}`, { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (!line.includes("LISTENING")) continue;
      const pid = line.trim().split(/\s+/).at(-1);
      if (pid && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      tryExec(`taskkill /F /PID ${pid}`);
    }
  } catch {
    /* port free */
  }
} else {
  tryExec(`lsof -ti :${DEV_PORT} | xargs kill -9 2>/dev/null || true`);
}

#!/usr/bin/env node
/**
 * After `tauri build`, produce clean Windows release asset names:
 *   Shape-<arch>-setup.exe  (NSIS installer)
 *   Shape-<arch>.zip        (portable: exe + sidecar files)
 *
 * Usage (from repo root, after a Windows build):
 *   node scripts/release/assets.mjs --arch x86_64
 *   node scripts/release/assets.mjs --arch aarch64 --out-dir dist/release
 */
import { execSync } from "node:child_process";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    rmSync,
    statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ARCH_TARGETS = {
    x86_64: null,
    aarch64: "aarch64-pc-windows-msvc",
};

function parseArgs(argv) {
    const out = { outDir: join(root, "dist", "release"), arch: "x86_64" };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--out-dir") out.outDir = argv[++i];
        else if (argv[i] === "--arch") out.arch = argv[++i];
    }
    return out;
}

function releaseDirForArch(arch) {
    const triple = ARCH_TARGETS[arch];
    if (triple === undefined) {
        console.error(`Unknown arch: ${arch} (expected x86_64 or aarch64)`);
        process.exit(1);
    }
    if (triple) {
        return join(root, "src-tauri", "target", triple, "release");
    }
    return join(root, "src-tauri", "target", "release");
}

function findNsisSetup(releaseDir) {
    const nsisDir = join(releaseDir, "bundle", "nsis");
    if (!existsSync(nsisDir)) return null;
    const setups = readdirSync(nsisDir).filter((f) => f.endsWith("-setup.exe"));
    if (setups.length === 0) return null;
    return join(nsisDir, setups[0]);
}

function findReleaseExe(releaseDir) {
    if (!existsSync(releaseDir)) return null;
    const preferred = join(releaseDir, "Shape.exe");
    if (existsSync(preferred)) return preferred;
    const exes = readdirSync(releaseDir).filter(
        (f) => f.endsWith(".exe") && !f.includes("uninstall"),
    );
    return exes.length ? join(releaseDir, exes[0]) : null;
}

function portableSidecars(dir, mainExeName) {
    const skip = new Set([mainExeName.toLowerCase(), "uninstall.exe"]);
    return readdirSync(dir)
        .filter((name) => {
            const lower = name.toLowerCase();
            if (skip.has(lower)) return false;
            if (name.endsWith(".pdb")) return false;
            if (name.endsWith(".exe")) return true;
            const full = join(dir, name);
            const st = statSync(full);
            if (st.isDirectory()) {
                return ["resources", "locales"].includes(name);
            }
            return /\.(dll|json|dat|bin|pak|txt)$/i.test(name);
        })
        .map((name) => join(dir, name));
}

function zipWindows(paths, outZip) {
    if (existsSync(outZip)) rmSync(outZip);
    const list = paths.map((p) => `'${p.replace(/'/g, "''")}'`).join(", ");
    const ps = `Compress-Archive -Path @(${list}) -DestinationPath '${outZip.replace(/'/g, "''")}' -Force`;
    execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: "inherit" });
}

function main() {
    const { outDir, arch } = parseArgs(process.argv.slice(2));
    const releaseDir = releaseDirForArch(arch);

    mkdirSync(outDir, { recursive: true });

    const setupSrc = findNsisSetup(releaseDir);
    if (!setupSrc) {
        console.error(`NSIS setup.exe not found under ${join(releaseDir, "bundle", "nsis")}`);
        process.exit(1);
    }

    const setupDest = join(outDir, `Shape-${arch}-setup.exe`);
    copyFileSync(setupSrc, setupDest);
    console.log(`Wrote ${setupDest}`);

    const setupSig = `${setupSrc}.sig`;
    if (existsSync(setupSig)) {
        const sigDest = `${setupDest}.sig`;
        copyFileSync(setupSig, sigDest);
        console.log(`Wrote ${sigDest}`);
    } else {
        console.warn(`No updater signature at ${setupSig} (signing key missing?)`);
    }

    const exe = findReleaseExe(releaseDir);
    if (!exe) {
        console.error(`Release Shape.exe not found under ${releaseDir}`);
        process.exit(1);
    }

    const mainName = exe.split(/[\\/]/).pop();
    const zipPaths = [exe, ...portableSidecars(releaseDir, mainName)];
    const zipDest = join(outDir, `Shape-${arch}.zip`);
    zipWindows(zipPaths, zipDest);
    console.log(`Wrote ${zipDest} (${zipPaths.length} entries)`);
}

main();

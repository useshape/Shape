#!/usr/bin/env node
/**
 * After `tauri build`, produce clean release asset names:
 *   Windows: Shape-<arch>-setup.exe + Shape-<arch>.zip
 *   macOS:   Shape-macos-<arch>.dmg + Shape-macos-<arch>.app.tar.gz (+ .sig)
 *
 * Usage (from repo root, after a platform build):
 *   node scripts/release/assets.mjs --os windows --arch x86_64
 *   node scripts/release/assets.mjs --os macos --arch aarch64 --out-dir dist/release
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
    windows: {
        x86_64: null,
        aarch64: "aarch64-pc-windows-msvc",
    },
    macos: {
        x86_64: "x86_64-apple-darwin",
        aarch64: "aarch64-apple-darwin",
    },
};

function parseArgs(argv) {
    const out = { outDir: join(root, "dist", "release"), arch: "x86_64", os: "windows" };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--out-dir") out.outDir = argv[++i];
        else if (argv[i] === "--arch") out.arch = argv[++i];
        else if (argv[i] === "--os") out.os = argv[++i];
    }
    return out;
}

function releaseDirFor(os, arch) {
    const osTargets = ARCH_TARGETS[os];
    if (!osTargets) {
        console.error(`Unknown os: ${os} (expected windows or macos)`);
        process.exit(1);
    }
    const triple = osTargets[arch];
    if (triple === undefined) {
        console.error(`Unknown arch for ${os}: ${arch}`);
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

function findDmg(releaseDir) {
    const dmgDir = join(releaseDir, "bundle", "dmg");
    if (!existsSync(dmgDir)) return null;
    const dmgs = readdirSync(dmgDir).filter((f) => f.endsWith(".dmg") && !f.endsWith(".sig"));
    if (dmgs.length === 0) return null;
    return join(dmgDir, dmgs[0]);
}

function findAppTarGz(releaseDir) {
    const macosDir = join(releaseDir, "bundle", "macos");
    if (!existsSync(macosDir)) return null;
    const tars = readdirSync(macosDir).filter(
        (f) => f.endsWith(".app.tar.gz") && !f.endsWith(".sig"),
    );
    if (tars.length === 0) return null;
    return join(macosDir, tars[0]);
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

function copyRequiredSig(src, dest) {
    const setupSig = `${src}.sig`;
    if (!existsSync(setupSig)) {
        console.error(`No updater signature at ${setupSig}. Release builds must be signed.`);
        process.exit(1);
    }
    copyFileSync(setupSig, dest);
    console.log(`Wrote ${dest}`);
}

function prepareWindows(releaseDir, outDir, arch) {
    const setupSrc = findNsisSetup(releaseDir);
    if (!setupSrc) {
        console.error(`NSIS setup.exe not found under ${join(releaseDir, "bundle", "nsis")}`);
        process.exit(1);
    }

    const setupDest = join(outDir, `Shape-${arch}-setup.exe`);
    copyFileSync(setupSrc, setupDest);
    console.log(`Wrote ${setupDest}`);
    copyRequiredSig(setupSrc, `${setupDest}.sig`);

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

function prepareMacos(releaseDir, outDir, arch) {
    const dmgSrc = findDmg(releaseDir);
    if (!dmgSrc) {
        console.error(`DMG not found under ${join(releaseDir, "bundle", "dmg")}`);
        process.exit(1);
    }
    const dmgDest = join(outDir, `Shape-macos-${arch}.dmg`);
    copyFileSync(dmgSrc, dmgDest);
    console.log(`Wrote ${dmgDest}`);
    const dmgSig = `${dmgSrc}.sig`;
    if (existsSync(dmgSig)) {
        copyFileSync(dmgSig, `${dmgDest}.sig`);
        console.log(`Wrote ${dmgDest}.sig`);
    }

    const tarSrc = findAppTarGz(releaseDir);
    if (!tarSrc) {
        console.error(`.app.tar.gz not found under ${join(releaseDir, "bundle", "macos")}`);
        process.exit(1);
    }
    const tarDest = join(outDir, `Shape-macos-${arch}.app.tar.gz`);
    copyFileSync(tarSrc, tarDest);
    console.log(`Wrote ${tarDest}`);
    copyRequiredSig(tarSrc, `${tarDest}.sig`);
}

function main() {
    const { outDir, arch, os } = parseArgs(process.argv.slice(2));
    const releaseDir = releaseDirFor(os, arch);
    mkdirSync(outDir, { recursive: true });
    if (os === "macos") prepareMacos(releaseDir, outDir, arch);
    else prepareWindows(releaseDir, outDir, arch);
}

main();

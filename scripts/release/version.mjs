import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkgPath = join(root, "package.json");
const tauriPath = join(root, "src-tauri", "tauri.conf.json");
const cargoPath = join(root, "src-tauri", "Cargo.toml");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const version = pkg.version;
if (!version || typeof version !== "string") {
    console.error("package.json is missing a string version field");
    process.exit(1);
}

const tauri = JSON.parse(readFileSync(tauriPath, "utf8"));
tauri.version = version;
writeFileSync(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`);

let cargo = readFileSync(cargoPath, "utf8");
if (!/^version\s*=\s*"[^"]+"/m.test(cargo)) {
    console.error("Cargo.toml is missing a package version field");
    process.exit(1);
}
cargo = cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
writeFileSync(cargoPath, cargo);

console.log(`Synced version ${version} → tauri.conf.json, Cargo.toml`);

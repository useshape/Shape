use std::env;

fn main() {
    println!("cargo:rerun-if-changed=../preview-runtime/entry.ts");
    println!("cargo:rerun-if-changed=../scripts/build/preview.mjs");
    // Do not watch the generated bundle — beforeDevCommand writes it on every
    // `tauri dev` start and that would restart the native app in a loop.
    // Official release CI injects this so the binary can attest to Shape Cloud AI.
    // Maintainers also set it at runtime for `tauri:dev` (see docs).
    println!("cargo:rerun-if-env-changed=SHAPE_CLOUD_BUILD_SECRET");
    if let Ok(secret) = env::var("SHAPE_CLOUD_BUILD_SECRET") {
        if !secret.is_empty() {
            println!("cargo:rustc-env=SHAPE_CLOUD_BUILD_SECRET={}", secret);
        }
    }
    // Bake website origin into release binaries (defaults to https://useshape.org).
    println!("cargo:rerun-if-env-changed=NEXT_PUBLIC_SHAPE_WEBSITE_URL");
    if let Ok(url) = env::var("NEXT_PUBLIC_SHAPE_WEBSITE_URL") {
        if !url.is_empty() {
            println!("cargo:rustc-env=NEXT_PUBLIC_SHAPE_WEBSITE_URL={}", url);
        }
    }
    tauri_build::build()
}

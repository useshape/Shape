# Desktop launch readiness (RE, browser, 3D)

Work is confined to `shape/`. Website, Go server, and Cloudflare were not changed.

## Verified

| Area | Evidence |
|------|----------|
| Vitest | `bun run test:all` — **527 passed** (92 files), including `generated_model` parse, media card download, save-download GLB bytes |
| Cargo | **275 passed** — GLB writer/edit/convert, RE identify/inspect/strings/disasm/extract, media stash ledger, pack detection (`low_poly_model_request_loads_media`, `reverse_request_loads_reverse_pack`), CDP fixture session |
| Browser CDP | `chromium_session_open_act_type_scroll_check_shot` **passed** on this machine (Chrome/Edge present): local HTML fixture, snapshot, click, type, scroll, check, JPEG shot, unreachable URL is not treated as success |
| Playwright 3D | `bunx playwright test` — **1 passed**: fixture GLB loads, canvas has pixels, orbit drag changes camera, download starts with `glTF` |
| Production UI | `bun run build` — Next.js compile + TypeScript **ok** |
| Artifact lifecycle | Chat tags carry `media_id` only; `read_media` IPC returns bytes/path; `save_media` remains the project copy; in-card Download uses original GLB bytes |

## Skipped (explicit, not weakened)

| Check | Reason |
|-------|--------|
| Blender / FBX | `blender_backend_skips_when_missing` printed skip — Blender is not on PATH. Local tessellated GLB still works. |
| Photoreal text-to-3D | No cloud `kind` on website `/api/generate` (out of scope). |
| Ghidra-quality decompile | Native pack is static (headers, strings, iced-x86). Optional MCP `rea-agents` if the user installs it. |
| Host execution of samples | RE tools are read-only. Untrusted binaries are never spawned. |
| Playwright in `test:all` / CI | CI keeps `bun run test:all` (Vitest + Cargo). Pre-release command is `bun run test:launch` (`test:all` + Playwright). |

## Blocked (honest limits)

- Photoreal Meshy-style generation until a cloud generate kind exists.
- Firmware unpack that shells out to binwalk.
- FBX without Blender.

## How to re-run

```
cd shape
bun run test:all      # CI gate
bun run test:e2e      # writes cube.glb fixture, then Playwright
bun run test:launch   # both
bun run build
```

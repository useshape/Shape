# Shape native (`src-tauri`)

Rust side of the desktop app (Tauri 2). The Next.js UI lives in `shape/` and talks to this crate over IPC.

## Layout

| Path | Role |
| --- | --- |
| `src/lib.rs` | App bootstrap, plugin init, command registration |
| `src/agent/` | Chat turns, tools, prompts, streaming, security |
| `src/commands/` | IPC: fs, git, pty, notifications; preview lives in `commands/preview/` |
| `src/adapters/` | Thin IPC wrappers around domain services |
| `src/domain/` | Filesystem / git / packages / terminal services |
| `src/core/` | Shared paths, process helpers, Windows toasts |
| `src/mcp/` | MCP client, OAuth, credentials |
| `preview-runtime/` | Inlined into HTML/design preview (`bundle.js`, `tailwind-browser.js`). Built from `shape/preview-runtime/entry.ts` via `npm run build:preview-runtime`. |

Agent prompts are Markdown under `src/agent/prompts/`. Those are product instructions, not user docs.

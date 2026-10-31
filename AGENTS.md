# Shape

Tauri 2 + Next.js desktop agent. Light chrome. Windows.

Do not invent UI. Open the nearest existing component and copy it.

## Git

Never push `main`. One concern per branch.

```
branch → commit → PR → CI green → CodeRabbit quiet → merge
```

Commit subject: `area: what changed` (`agent:`, `git:`, `chat:`, `docs:`, …). If it closes an issue, put `Closes #N` in the body. Do not invent `#` numbers.

If `COMMIT.md` exists locally, follow it.

After a PR is open: address CodeRabbit and CI until both are clean. Do not pile a second PR while the first is still moving.

## UI

Shared primitives live in `components/ui/`. Import `@/components/ui/icon` (Fluent glyph, not a string name, not Lucide, not raw SVG). Use semantic tokens (`text-text-primary`, `bg-panel`, `border-border-subtle`). No shadcn. No `text-gray-*`.

Menus: `@/components/ui/dropdown` / `context` only. Do not restyle `DropdownMenuContent`.

Settings rows: `features/settings/ui/setting-controls.tsx`. Panel headers: `features/panels/ui/sidebar-panel-header.tsx`.

## Tests

```bash
bun run test:all
```

Vitest plus Cargo. `bun run test` alone is not enough.

## Do not

- Debug labels, cloud URLs, or env names in shipped UI
- `console.log` on happy paths
- Long comments that restate the code
- Unattended agent PRs

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

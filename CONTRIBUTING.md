# Contributing to Shape

Thanks for contributing.

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md). Code you submit is licensed under [BUSL-1.1](./LICENSE), same as the rest of the repo.

## What helps most

Shape is a full IDE. Most useful contributions are small and concrete:

- Docs fixes and missing pages under `docs/`
- Bug fixes with clear reproduction
- Narrow improvements to something that already exists (editor, Git, agent, terminal, LSP, settings)
- Keybindings, polish, and platform gaps

Big new features need an issue first. Describe the problem and the intended behavior before opening a PR. Unsolicited large features usually don't land.

## Pull requests

Open a PR for bugfixes and small changes. We'll review when we can — pinging maintainers does not jump the queue.

To keep review tractable:

- One concern per PR
- Say what you fixed and how to check it
- Add or update tests when the change is non-trivial (`npm run test:all`)
- Screenshots or a short clip for UI changes
- Confirm features with an issue before building them

Prefer finishing one PR before stacking more. A pile of open branches against `main` goes stale fast.

## What we usually decline

- Broad refactors with no product outcome
- Style-only diffs that don't change behavior
- Features whose complexity outweighs who they help
- Changes the author can't explain
- Unattended agent PRs

## Using AI while contributing

LLMs are fine as a tool. You still own the result: understand the diff, write the PR description yourself, and reply to review in your own words.

If you paste model output into a discussion, quote it, say it came from a model, and add what you think it means.

## Getting the app running

Install Node.js 18+, Rust, and [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/), then:

```bash
npm install
cp .env.example .env   # optional
npm run tauri:dev
```

Cloud URL details: [Local development](./docs/developing/local-development.mdx).

```bash
npm run test          # Vitest
npm run test:rust     # Cargo
npm run test:all      # Both
```

## Where things live

| Path | What it is |
| --- | --- |
| `app/` | Next.js routes (workbench, settings, git, stats windows) |
| `features/` | Product UI — editor, chat, explorer, Git, terminal |
| `lib/` | Shared TypeScript (IPC wrappers, settings, auth) |
| `components/ui/` | Shared UI primitives |
| `src-tauri/` | Rust / Tauri — commands, agent, Git, PTY, LSP |
| `docs/` | Product and contributor docs (MDX) |
| `scripts/` | Build and release helpers |
| `tests/` | Vitest |

More architecture detail: [docs/developing](./docs/developing/overview.mdx).

## Commits

Release notes group by area. Prefer:

```text
area: short summary
```

Examples: `editor: …`, `git: …`, `agent: …`, `docs: …`. Keep `package.json`, Tauri, and Cargo versions in sync with `npm run sync-version` when you bump the app version.

## Security

Private reports only — see [SECURITY.md](./SECURITY.md).

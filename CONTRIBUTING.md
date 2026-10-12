# Contributing to Shape

Shape is a desktop agent. Chat, files, Git, and a terminal live in one Windows app. It is not an IDE you live in all day.

By taking part you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md). Code you send is licensed under [BUSL-1.1](./LICENSE).

## What helps

Small, concrete work:

- Docs under `docs/`
- Bug fixes with a way to reproduce
- Narrow changes to something that already exists (agent, Git, editor, terminal, LSP, settings)
- Keybindings, polish, platform gaps

File an issue before a large feature. Say the problem and the intended behavior. Unsolicited large features do not land.

## Pull requests

Open a PR for bugfixes and small changes. Review happens when someone has time. Pinging does not jump the queue.

- One concern per PR
- Say what you changed and how you checked it
- Run `npm run test:all` when the change is non-trivial
- A screenshot or a short clip for UI
- An issue before new features

Finish one PR before stacking more. Open branches against `main` go stale.

## What we decline

- Broad refactors with no product outcome
- Style-only diffs
- Features whose cost outweighs who they help
- Changes the author cannot explain
- Unattended agent PRs

## Using a model while contributing

You still own the result. Read the diff. Write the PR description. Reply to review in your own words.

If you paste model output into a thread, quote it, say a model wrote it, and add what you think it means.

## Run the app

Node.js 18+, Rust, and [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/):

```bash
npm install
cp .env.example .env   # optional
npm run tauri:dev
```

Cloud URLs: [Local development](./docs/developing/local-development.mdx).

```bash
npm run test          # Vitest
npm run test:rust     # Cargo
npm run test:all      # Both
```

A fork cannot sign in to Shape Cloud. Official builds can. Chat against a real account needs an installer from [download](https://useshape.org/download).

## Where things live

| Path | What it is |
| --- | --- |
| `app/` | Next.js routes (agent, settings, git, extra windows) |
| `features/` | Product UI — chat, editor, explorer, Git, terminal |
| `lib/` | Shared TypeScript (IPC, settings, auth) |
| `components/ui/` | Shared UI primitives |
| `src-tauri/` | Rust / Tauri — commands, agent, Git, PTY, LSP |
| `docs/` | Product and contributor docs (MDX) |
| `scripts/` | Build and release helpers |
| `tests/` | Vitest |

More: [docs/developing](./docs/developing/overview.mdx).

## Commits

Release notes group by area. Prefer:

```text
area: short summary
```

Examples: `agent: …`, `git: …`, `docs: …`. If the change closes a GitHub issue, put `Closes #N` in the body. See [COMMIT.md](./COMMIT.md).

Keep `package.json`, Tauri, and Cargo versions in sync with `npm run sync-version` when you bump the app.

## Security

Private reports only. [SECURITY.md](./SECURITY.md).

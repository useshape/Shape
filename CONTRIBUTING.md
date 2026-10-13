# Contributing to Shape

Shape is a desktop agent. You get chat, files, Git, and a terminal in one Windows app. Contributors keep the app in that shape.

By taking part you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md). See [BUSL-1.1](./LICENSE) for the project's license.

## What helps

Small, concrete work:

- Docs under `docs/`
- Bug fixes with a way to reproduce
- Narrow changes to something in the app (agent, Git, editor, terminal, LSP, settings)
- Keybindings, polish, platform gaps

## Large changes

Open an issue before you write the code. Name the problem and the behavior you want. Wait until a maintainer says the work should happen. Maintainers close a large feature that arrives without that agreement.

A change counts as large when it does any of these:

- Adds a new product surface
- Rewrites an existing flow
- Spreads across several of chat, Git, the editor, the terminal, LSP, settings, and the Rust agent

## CI, release, and repo policy

Leave the pipeline alone unless a maintainer accepted an issue that names the exact change. That covers:

- `.github/workflows/`
- `scripts/release/`
- Version files (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`)
- Signing, the updater, and publish steps
- `lefthook.yml` and branch-protection docs

A CI or release pull request must say which failure it fixes, how you checked it, and how to roll it back. Maintainers close drive-by workflow edits. Do not change CI to make a failing test pass.

## Pull requests

`main` is protected. Open a PR. Direct pushes are rejected.

CodeRabbit reviews every PR. CI runs `npm run test:all`. Address both before merge.

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
- Large features opened before a maintainer accepted the issue
- CI, release, signing, or version-bump edits without that same agreement

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
| `features/` | Product UI: chat, editor, explorer, Git, terminal |
| `lib/` | Shared TypeScript (IPC, settings, auth) |
| `components/ui/` | Shared UI primitives |
| `src-tauri/` | Rust / Tauri: commands, agent, Git, PTY, LSP |
| `docs/` | Product and contributor docs (MDX) |
| `scripts/` | Build and release helpers |
| `tests/` | Vitest |

More: [docs/developing](./docs/developing/overview.mdx).

## Commits

Release notes group by area. Prefer:

```text
area: short summary
```

Examples: `agent: …`, `git: …`, `docs: …`. If the change closes a GitHub issue, put `Closes #N` in the body. See [AGENTS.md](./AGENTS.md).

Keep `package.json`, Tauri, and Cargo versions in sync with `npm run sync-version` when you bump the app.

## Security

Private reports only. [SECURITY.md](./SECURITY.md).

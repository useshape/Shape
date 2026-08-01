# Shape Docs

In-app and website documentation for Shape. Pages live as MDX under this folder and are indexed for search.

## Preview

Edit MDX under `docs/`, then regenerate the search index:

```bash
npm run docs:index
```

Output: `docs/generated/search-index.json`.

User-facing docs are grouped as Getting started, Using Shape, Guides, Reference, and Help. Contributor material sits under **For contributors** (`docs/developing/`).

## Writing style

- Lead with what the page is for in one or two sentences.
- Prefer short steps and tables over long prose.
- One job per page. Link related topics instead of repeating them.
- Put implementation detail in **For contributors**, not in user guides.

## Structure

| Section | Purpose |
| --- | --- |
| `introduction/` | Install, accounts, first minutes in the app |
| `workspace/`, `editor/`, `files/`, `git/`, `ai/`, `terminal/`, `settings/` | Day-to-day product docs |
| `tutorials/` | Short guided walks |
| `reference/` | Shortcuts and stable reference |
| `help/` | FAQ, troubleshooting, error codes |
| `developing/` | Architecture, IPC, agent tools, local builds |

`meta.json` files control titles, icons, and section order in the docs UI.

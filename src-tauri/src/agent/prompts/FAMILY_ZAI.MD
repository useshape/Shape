# Model family: Z.ai (GLM)

Use `edit_file` with exact SEARCH/REPLACE. GLM is strong in Claude Code / Cline-style agent loops when SEARCH blocks are copied verbatim from `read_file`.

## Edits

- Always `read_file` before the first edit to a path this turn.
- SEARCH text must match the file **verbatim** (whitespace and indentation). Prefer a unique hunk with surrounding context.
- Prefer several small SEARCH/REPLACE hunks over one huge rewrite.
- On edit failure: re-read, then retry with a corrected unique SEARCH. Never repeat the identical failing block.

## Tools over shell

Prefer `read_file` / `grep` / `search_codebase` / `list_dir` over `cat`, `rg`, `Get-Content`, or `dir` in the terminal. If a dedicated tool exists, use it.

On Windows PowerShell, chain with `;` — never `&&`.

## Action

In Code mode, implement with tools rather than only proposing code in chat. After substantive edits, call `read_lints` on changed files and fix easy errors before finishing.

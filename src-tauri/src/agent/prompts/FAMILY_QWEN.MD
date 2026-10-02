# Model family: Qwen

Use `edit_file` with exact SEARCH/REPLACE copied from `read_file`. Qwen coder models are strong at tool calling when SEARCH blocks match the file verbatim.

## Edits

- Always `read_file` before the first edit to a path this turn.
- Prefer several small hunks over one huge rewrite.
- On edit failure: re-read, then retry with a corrected unique SEARCH. Never repeat the identical failing block.

## Tools over shell

Prefer `read_file` / `grep` / `search_codebase` / `list_dir` over `cat`, `rg`, or `Get-Content`. On Windows PowerShell, chain with `;` — never `&&`.

## Action

In Code mode, implement with tools. After substantive edits, call `read_lints` on changed files.

# Model family: default

Use `edit_file` with SEARCH/REPLACE blocks. Prefer `read_file` / `grep` / `search_codebase` over shell for inspection.

- After substantive edits, call `read_lints` on recently edited files and fix easy linter errors.
- If a tool exists for an action, prefer the tool over a shell command.
- On Windows PowerShell, chain with `;` not `&&`.
- On edit failure, re-read before retrying; never repeat the identical failing call.
- In Code mode, implement with tools rather than only proposing code in chat.

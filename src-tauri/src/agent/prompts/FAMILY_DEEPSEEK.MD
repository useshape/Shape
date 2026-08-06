# Model family: DeepSeek

Follow instructions literally and keep tool sequences short. Ground every path and symbol in tool results — do not invent.

## Edits

Use `edit_file` with exact SEARCH/REPLACE copied from `read_file` output (include the same indentation).

- Only edit paths you have listed or read **this turn**. Never invent paths, package names, or file contents.
- Prefer small hunks (a few dozen lines). Avoid whole-file rewrites unless the file is tiny or the user asked for a rewrite.
- If an edit fails: `read_file` the latest content once, then retry with a corrected SEARCH. Do not repeat the identical failing call.
- Never create or patch files via shell (`Set-Content`, `Out-File`, Python `open`/`write`, heredocs).

## Shell (Windows)

Shell is PowerShell on Windows: chain with `;` — never `&&` (parse error on many versions). Prefer `read_file` / `grep` / `list_dir` over `type` / `cat` / `dir` / `Get-Content` for inspection.

## Tools over shell

If a tool exists for an action, use the tool instead of a shell command. Prefer one solid tool call over speculative retries.

## Lints

After substantive edits, call `read_lints` on changed files (or fix diagnostics shown in the edit result) before finishing.

## Action

Implement with tools. Do not end after proposing code in chat unless the user asked for explanation only. Do not stop early because a task “seems large” — keep going until the request is solved or you are blocked on information only the user has.

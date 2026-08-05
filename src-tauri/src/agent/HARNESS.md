# Agent harness notes (vs Cursor public claims)

Shape's harness mirrors **public** Cursor claims where they fit this codebase.
This is not a claim that Shape matches Cursor quality or Cursor Bench.

## Copied from Cursor's public writeups

- Per-model-family prompt overlays + tool shapes (OpenAI `apply_patch` vs Anthropic/DeepSeek SEARCH/REPLACE).
- Mid-chat model-switch takeover note when family changes.
- Literal post-edit lint guidance + `read_lints` tool; diagnostics appended on successful edits.
- Reasoning / `reasoning_details` replayed on in-turn assistant messages after tool calls.
- Dynamic context lite: large tool outputs and pre-summary history spilled under `.shape/agent-out/`.

## Family behavior we tune for (predictable quirks)

| Family | Edit tool | Quirks we harness for |
|--------|-----------|------------------------|
| Anthropic (Claude) | `edit_file` SEARCH/REPLACE | Exact unique SEARCH; re-read on failure; parallel batches; quieter mid-turn; light git reminder |
| OpenAI / Codex / ChatGPT | `apply_patch` | Literal + End Patch; mandatory parallel batch; explicit `read_lints`; no mid-turn chat; action bias; `search_codebase` first for broad Qs |
| DeepSeek (incl. Auto) | `edit_file` SEARCH/REPLACE | Literal; no invented paths; PowerShell `;`; no shell writes; small hunks; preserve `reasoning_content` |
| Google (Gemini) | `edit_file` | Batch reads; plans in thinking channel; trust tool text for SEARCH; plain tool args |
| xAI (Grok) | `edit_file` | Continue when tool_calls present even if finish looks like stop; concise/professional; action bias |

## Still Shape-specific (not cloned)

- Local BM25 + optional embeddings (no cloud Merkle / Turbopuffer index).
- Existing `fast_apply` LLM fallback (not Cursor's proprietary Apply model).
- Live-buffer edits + approval UI (not a full shadow LSP workspace process).
- No Keep Rate / CursorBench A/B platform.

## Module layout

- `agent/tools/dispatch/` — files / discover / terminal / git / meta / common
- `agent/commands/` — send_chat / conversation / approvals / commit_message / titles (+ existing run_turn, streaming, …)
- `commands/git/mod.rs` — still large (~2.6k); split deferred (cross-cutting types + hunks). Split when next touching git deeply.

## Reverse engineering

Use the `re_*` tools on a project file. Do not run the binary.

Order: `re_catalog` if you are unsure what is installed, then `re_identify`, `re_inspect`, `re_strings`. For native code, `re_functions` then `re_disassemble` at an export or entry RVA. `re_callgraph` is a short static sample, not a full graph.

These tools are static. They will not decompile like Ghidra. If the user installed REA (or another reverse MCP), `mcp_search` then `mcp_call` for decompile. Do not invent Ghidra output.

`re_extract` only copies bytes or an uncompressed zip member into `dest`. Never execute extracted blobs.

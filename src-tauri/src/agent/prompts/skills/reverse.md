## Binary inspection

Use the `re_*` tools on a file the user pointed at. Do not run the binary.

Order: `re_identify`, then `re_inspect`. `re_strings` for text. `re_functions` for exports and, on x64 PE, the exception directory. `re_disassemble` at an export or the entry RVA. `re_callgraph` for direct calls in that scanned set.

`re_disassemble` returns a gas listing and a lift. The lift covers moves, arithmetic, comparisons, branches, calls, jumps, returns, pushes, and pops. Any other instruction is left as its mnemonic. Do not invent C around that. If the arch is not x86 or x64, say so and stop at the structure.

`re_callgraph` is capped. If it says the scan stopped, the graph is incomplete.

`re_extract` only copies a byte range or a zip member into `dest`. Never execute extracted bytes.

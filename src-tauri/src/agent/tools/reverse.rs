//! Static reverse-engineering tools. Never execute the target.

use goblin::{elf, mach, pe, Object};
use iced_x86::{Decoder, DecoderOptions, Formatter, GasFormatter, Instruction};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::agent::security;

use super::dispatch::{ToolCtx, ToolOutcome};

fn err(_name: &str, message: &str) -> ToolOutcome {
    ToolOutcome {
        tool_result: format!("ERROR: {message}"),
        ui_chunk: String::new(),
        side_effect: None,
    }
}

const MAX_BYTES: u64 = 64 * 1024 * 1024;
const MAX_STRINGS: usize = 400;
const MAX_INSNS: usize = 96;
const MAX_FUNCS: usize = 80;

fn read_target(path: &str, ctx: &ToolCtx<'_>) -> Result<(String, Vec<u8>), String> {
    let resolved = security::paths::resolve_safe_path(path, ctx.project_path).map_err(|e| e.to_string())?;
    let meta = std::fs::metadata(&resolved).map_err(|e| e.to_string())?;
    if meta.len() > MAX_BYTES {
        return Err(format!(
            "File is {} bytes; reverse tools cap at {} bytes.",
            meta.len(),
            MAX_BYTES
        ));
    }
    let bytes = std::fs::read(&resolved).map_err(|e| e.to_string())?;
    Ok((resolved.to_string_lossy().into_owned(), bytes))
}

fn path_arg(args: &Value) -> Result<String, String> {
    args.get("path")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| "Pass path.".to_string())
}

fn identify_bytes(bytes: &[u8]) -> Value {
    let sha = Sha256::digest(bytes);
    json!({
        "size": bytes.len(),
        "sha256": format!("{sha:x}"),
        "entropy": entropy(bytes),
        "format": format_label(bytes),
        "magic": magic_hex(bytes),
    })
}

fn magic_hex(bytes: &[u8]) -> String {
    bytes.iter().take(8).map(|b| format!("{b:02x}")).collect::<Vec<_>>().join(" ")
}

fn format_label(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(b"MZ") {
        "pe"
    } else if bytes.starts_with(b"\x7fELF") {
        "elf"
    } else if bytes.starts_with(b"\0asm") {
        "wasm"
    } else if bytes.starts_with(&[0xfe, 0xed, 0xfa, 0xce])
        || bytes.starts_with(&[0xce, 0xfa, 0xed, 0xfe])
        || bytes.starts_with(&[0xfe, 0xed, 0xfa, 0xcf])
        || bytes.starts_with(&[0xcf, 0xfa, 0xed, 0xfe])
        || bytes.starts_with(&[0xca, 0xfe, 0xba, 0xbe])
    {
        "mach-o"
    } else if bytes.starts_with(b"PK\x03\x04") || bytes.starts_with(b"PK\x05\x06") {
        "zip"
    } else {
        "unknown"
    }
}

fn entropy(bytes: &[u8]) -> f64 {
    if bytes.is_empty() {
        return 0.0;
    }
    let mut counts = [0u64; 256];
    for b in bytes {
        counts[*b as usize] += 1;
    }
    let n = bytes.len() as f64;
    let mut h = 0.0;
    for c in counts {
        if c == 0 {
            continue;
        }
        let p = c as f64 / n;
        h -= p * p.log2();
    }
    (h * 1000.0).round() / 1000.0
}

fn inspect_bytes(bytes: &[u8]) -> Value {
    match Object::parse(bytes) {
        Ok(Object::PE(pe)) => inspect_pe(&pe, bytes),
        Ok(Object::Elf(elf)) => inspect_elf(&elf),
        Ok(Object::Mach(mach)) => inspect_mach(&mach),
        Ok(_) => json!({ "format": format_label(bytes), "note": "Parsed as an object file without a detailed inspector." }),
        Err(e) => {
            if bytes.starts_with(b"\0asm") {
                inspect_wasm(bytes)
            } else {
                json!({ "format": format_label(bytes), "parseError": e.to_string() })
            }
        }
    }
}

fn inspect_pe(pe: &pe::PE, bytes: &[u8]) -> Value {
    let imports: Vec<String> = pe.libraries.iter().map(|s| s.to_string()).collect();
    let exports: Vec<String> = pe.exports.iter().filter_map(|e| e.name.map(|n| n.to_string())).take(80).collect();
    let sections: Vec<Value> = pe
        .sections
        .iter()
        .map(|s| {
            json!({
                "name": s.name().unwrap_or(""),
                "virtualAddress": s.virtual_address,
                "virtualSize": s.virtual_size,
                "rawSize": s.size_of_raw_data
            })
        })
        .collect();
    let clr = pe
        .header
        .optional_header
        .and_then(|h| h.data_directories.get_clr_runtime_header().cloned())
        .map(|d| d.size > 0)
        .unwrap_or(false);
    json!({
        "format": "pe",
        "is64": pe.is_64,
        "entry": pe.entry,
        "imports": imports,
        "exports": exports,
        "sections": sections,
        "clr": clr,
        "authenticode": pe_has_cert(bytes, pe),
        "goBuildinfo": scan_ascii(bytes, "Go buildinf:"),
        "rustMarker": scan_ascii(bytes, "rustc") || scan_ascii(bytes, "cargo"),
    })
}

fn pe_has_cert(bytes: &[u8], pe: &pe::PE) -> bool {
    pe.header
        .optional_header
        .and_then(|h| h.data_directories.get_certificate_table().cloned())
        .map(|d| d.size > 0 && (d.virtual_address as usize) < bytes.len())
        .unwrap_or(false)
}

fn inspect_elf(elf: &elf::Elf) -> Value {
    let imports: Vec<String> = elf.libraries.iter().map(|s| s.to_string()).collect();
    let exports: Vec<String> = elf
        .dynsyms
        .iter()
        .filter(|s| !s.is_import())
        .filter_map(|s| elf.dynstrtab.get_at(s.st_name).map(|n| n.to_string()))
        .filter(|n| !n.is_empty())
        .take(80)
        .collect();
    let sections: Vec<Value> = elf
        .section_headers
        .iter()
        .filter_map(|s| {
            let name = elf.shdr_strtab.get_at(s.sh_name)?;
            Some(json!({ "name": name, "addr": s.sh_addr, "size": s.sh_size, "type": s.sh_type }))
        })
        .collect();
    json!({
        "format": "elf",
        "is64": elf.is_64,
        "entry": elf.entry,
        "imports": imports,
        "exports": exports,
        "sections": sections,
        "interpreter": elf.interpreter,
    })
}

fn inspect_mach(mach: &mach::Mach) -> Value {
    match mach {
        mach::Mach::Binary(m) => json!({
            "format": "mach-o",
            "is64": m.is_64,
            "entry": m.entry,
            "name": m.name.clone().unwrap_or_default(),
        }),
        mach::Mach::Fat(fat) => json!({
            "format": "mach-o-fat",
            "arches": fat.narches,
        }),
    }
}

fn inspect_wasm(bytes: &[u8]) -> Value {
    let version = if bytes.len() >= 8 {
        u32::from_le_bytes(bytes[4..8].try_into().unwrap_or([0; 4]))
    } else {
        0
    };
    json!({ "format": "wasm", "version": version, "size": bytes.len() })
}

fn scan_ascii(bytes: &[u8], needle: &str) -> bool {
    let n = needle.as_bytes();
    bytes.windows(n.len()).any(|w| w.eq_ignore_ascii_case(n))
}

fn extract_strings(bytes: &[u8], min_len: usize) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = Vec::new();
    for &b in bytes {
        if (0x20..=0x7e).contains(&b) {
            cur.push(b);
            continue;
        }
        if cur.len() >= min_len {
            if let Ok(s) = String::from_utf8(cur.clone()) {
                out.push(s);
                if out.len() >= MAX_STRINGS {
                    break;
                }
            }
        }
        cur.clear();
    }
    if cur.len() >= min_len && out.len() < MAX_STRINGS {
        if let Ok(s) = String::from_utf8(cur) {
            out.push(s);
        }
    }
    out
}

fn disassemble_bytes(bytes: &[u8], args: &Value) -> Result<String, String> {
    let obj = Object::parse(bytes).map_err(|e| format!("Not a recognized binary: {e}"))?;
    let (code, ip, bitness) = text_slice(&obj, bytes, args)?;
    let mut decoder = Decoder::with_ip(bitness, code, ip, DecoderOptions::NONE);
    let mut formatter = GasFormatter::new();
    let mut output = String::new();
    let mut insn = Instruction::default();
    let mut n = 0;
    while decoder.can_decode() && n < MAX_INSNS {
        decoder.decode_out(&mut insn);
        let mut line = String::new();
        formatter.format(&insn, &mut line);
        output.push_str(&format!("0x{:x}: {line}\n", insn.ip()));
        n += 1;
    }
    if output.is_empty() {
        return Err("No instructions decoded.".into());
    }
    Ok(output)
}

fn text_slice<'a>(obj: &Object<'a>, bytes: &'a [u8], args: &Value) -> Result<(&'a [u8], u64, u32), String> {
    let rva = args.get("rva").and_then(|v| v.as_u64());
    let length = args.get("length").and_then(|v| v.as_u64()).unwrap_or(256).clamp(16, 4096) as usize;
    match obj {
        Object::PE(pe) => {
            let va = rva.unwrap_or(pe.entry as u64);
            let file_off = pe_rva_to_off(pe, va as u32).ok_or("Could not map RVA to a file offset.")?;
            let end = (file_off + length).min(bytes.len());
            let bitness = if pe.is_64 { 64 } else { 32 };
            Ok((&bytes[file_off..end], va, bitness))
        }
        Object::Elf(elf) => {
            let va = rva.unwrap_or(elf.entry);
            let (off, file_va) = elf_va_to_off(elf, va).ok_or("Could not map address to a file offset.")?;
            let end = (off + length).min(bytes.len());
            let bitness = if elf.is_64 { 64 } else { 32 };
            Ok((&bytes[off..end], file_va, bitness))
        }
        _ => Err("Disassembly currently supports PE and ELF.".into()),
    }
}

fn pe_rva_to_off(pe: &pe::PE, rva: u32) -> Option<usize> {
    for s in &pe.sections {
        let start = s.virtual_address;
        let end = start.saturating_add(s.virtual_size.max(s.size_of_raw_data));
        if rva >= start && rva < end {
            return Some((s.pointer_to_raw_data + (rva - start)) as usize);
        }
    }
    None
}

fn elf_va_to_off(elf: &elf::Elf, va: u64) -> Option<(usize, u64)> {
    for s in &elf.section_headers {
        if va >= s.sh_addr && va < s.sh_addr + s.sh_size {
            let delta = va - s.sh_addr;
            return Some(((s.sh_offset + delta) as usize, va));
        }
    }
    None
}

fn list_functions(bytes: &[u8]) -> Result<Vec<Value>, String> {
    let obj = Object::parse(bytes).map_err(|e| e.to_string())?;
    let mut funcs = Vec::new();
    match obj {
        Object::PE(pe) => {
            for e in pe.exports.iter().take(MAX_FUNCS) {
                funcs.push(json!({
                    "name": e.name.unwrap_or(""),
                    "rva": e.rva,
                    "offset": e.offset
                }));
            }
        }
        Object::Elf(elf) => {
            for s in elf.dynsyms.iter() {
                if s.st_value == 0 {
                    continue;
                }
                if let Some(name) = elf.dynstrtab.get_at(s.st_name) {
                    if name.is_empty() {
                        continue;
                    }
                    funcs.push(json!({ "name": name, "addr": s.st_value, "size": s.st_size }));
                    if funcs.len() >= MAX_FUNCS {
                        break;
                    }
                }
            }
        }
        _ => return Err("Function listing currently supports PE and ELF.".into()),
    }
    Ok(funcs)
}

fn callgraph(bytes: &[u8]) -> Result<Vec<Value>, String> {
    let funcs = list_functions(bytes)?;
    let obj = Object::parse(bytes).map_err(|e| e.to_string())?;
    let mut edges = Vec::new();
    for f in funcs.iter().take(24) {
        let rva = f.get("rva").or_else(|| f.get("addr")).and_then(|v| v.as_u64());
        let Some(rva) = rva else { continue };
        let args = json!({ "rva": rva, "length": 192 });
        let Ok(listing) = (|| {
            let (code, ip, bitness) = text_slice(&obj, bytes, &args)?;
            let mut decoder = Decoder::with_ip(bitness, code, ip, DecoderOptions::NONE);
            let mut insn = Instruction::default();
            let mut calls = Vec::new();
            let mut n = 0;
            while decoder.can_decode() && n < 48 {
                decoder.decode_out(&mut insn);
                if insn.is_call_near() {
                    calls.push(format!("0x{:x}", insn.near_branch_target()));
                }
                n += 1;
            }
            Ok::<_, String>(calls)
        })() else {
            continue;
        };
        if !listing.is_empty() {
            edges.push(json!({
                "from": f.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                "fromAddr": format!("0x{rva:x}"),
                "to": listing
            }));
        }
    }
    Ok(edges)
}

fn catalog() -> Value {
    json!({
        "builtin": [
            {"name": "re_identify", "does": "Format, hashes, entropy. Never runs the file."},
            {"name": "re_inspect", "does": "PE/ELF/Mach-O/WASM structure, imports, exports, sections."},
            {"name": "re_strings", "does": "Printable ASCII strings."},
            {"name": "re_disassemble", "does": "x86/x64 disassembly of an RVA range or entry. No decompile."},
            {"name": "re_functions", "does": "Exported and dynamic symbols."},
            {"name": "re_callgraph", "does": "Static near-call edges from a sample of functions."},
            {"name": "re_extract", "does": "Copy a byte range or stored zip member to a project path. Does not execute."}
        ],
        "optional": {
            "rizin": lookup_bin("rizin").or_else(|| lookup_bin("r2")),
            "objdump": lookup_bin("objdump").or_else(|| lookup_bin("llvm-objdump")),
            "rea": lookup_bin("rea"),
            "ghidra": lookup_bin("ghidraRun").or_else(|| lookup_bin("analyzeHeadless"))
        },
        "limits": "Static only. No sandbox run of untrusted binaries. Ghidra-quality decompile needs an optional MCP such as REA with a local engine."
    })
}

fn lookup_bin(name: &str) -> Option<String> {
    let mut cmd = if cfg!(windows) {
        let mut c = std::process::Command::new("where");
        c.arg(name);
        c
    } else {
        let mut c = std::process::Command::new("which");
        c.arg(name);
        c
    };
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && !s.to_ascii_lowercase().contains("could not"))
}

fn extract_range(bytes: &[u8], args: &Value) -> Result<Vec<u8>, String> {
    if let Some(member) = args.get("member").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
        return zip_member(bytes, member);
    }
    let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    let length = args.get("length").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    if length == 0 {
        return Err("Pass length, or member for a stored zip entry.".into());
    }
    let end = offset.saturating_add(length);
    if end > bytes.len() {
        return Err("Range is past the end of the file.".into());
    }
    Ok(bytes[offset..end].to_vec())
}

fn zip_member(bytes: &[u8], name: &str) -> Result<Vec<u8>, String> {
    let mut i = 0;
    while i + 30 <= bytes.len() {
        if &bytes[i..i + 4] != b"PK\x03\x04" {
            i += 1;
            continue;
        }
        let method = u16::from_le_bytes(bytes[i + 8..i + 10].try_into().unwrap());
        let comp = u32::from_le_bytes(bytes[i + 18..i + 22].try_into().unwrap()) as usize;
        let name_len = u16::from_le_bytes(bytes[i + 26..i + 28].try_into().unwrap()) as usize;
        let extra = u16::from_le_bytes(bytes[i + 28..i + 30].try_into().unwrap()) as usize;
        let name_at = i + 30;
        let data_at = name_at + name_len + extra;
        if data_at + comp > bytes.len() {
            break;
        }
        let found = std::str::from_utf8(&bytes[name_at..name_at + name_len]).unwrap_or("");
        if found == name {
            if method != 0 {
                return Err("Only uncompressed (stored) zip members can be extracted.".into());
            }
            return Ok(bytes[data_at..data_at + comp].to_vec());
        }
        i = data_at + comp;
    }
    Err(format!("Zip member '{name}' was not found."))
}

fn ok(body: String) -> ToolOutcome {
    ToolOutcome {
        tool_result: body,
        ui_chunk: String::new(),
        side_effect: None,
    }
}

pub fn tool_re_catalog(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    ok(serde_json::to_string_pretty(&catalog()).unwrap_or_default())
}

pub fn tool_re_identify(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let path = match path_arg(args) {
        Ok(p) => p,
        Err(e) => return err("re_identify", &e),
    };
    match read_target(&path, ctx) {
        Ok((abs, bytes)) => ok(format!(
            "{abs}\n{}",
            serde_json::to_string_pretty(&identify_bytes(&bytes)).unwrap_or_default()
        )),
        Err(e) => err("re_identify", &e),
    }
}

pub fn tool_re_inspect(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let path = match path_arg(args) {
        Ok(p) => p,
        Err(e) => return err("re_inspect", &e),
    };
    match read_target(&path, ctx) {
        Ok((abs, bytes)) => ok(format!(
            "{abs}\n{}",
            serde_json::to_string_pretty(&inspect_bytes(&bytes)).unwrap_or_default()
        )),
        Err(e) => err("re_inspect", &e),
    }
}

pub fn tool_re_strings(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let path = match path_arg(args) {
        Ok(p) => p,
        Err(e) => return err("re_strings", &e),
    };
    let min = args.get("min_length").and_then(|v| v.as_u64()).unwrap_or(4).clamp(4, 32) as usize;
    match read_target(&path, ctx) {
        Ok((_, bytes)) => {
            let strings = extract_strings(&bytes, min);
            ok(format!("{} strings (min {min}):\n{}", strings.len(), strings.join("\n")))
        }
        Err(e) => err("re_strings", &e),
    }
}

pub fn tool_re_disassemble(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let path = match path_arg(args) {
        Ok(p) => p,
        Err(e) => return err("re_disassemble", &e),
    };
    match read_target(&path, ctx) {
        Ok((_, bytes)) => match disassemble_bytes(&bytes, args) {
            Ok(text) => ok(text),
            Err(e) => err("re_disassemble", &e),
        },
        Err(e) => err("re_disassemble", &e),
    }
}

pub fn tool_re_functions(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let path = match path_arg(args) {
        Ok(p) => p,
        Err(e) => return err("re_functions", &e),
    };
    match read_target(&path, ctx) {
        Ok((_, bytes)) => match list_functions(&bytes) {
            Ok(funcs) => ok(serde_json::to_string_pretty(&funcs).unwrap_or_default()),
            Err(e) => err("re_functions", &e),
        },
        Err(e) => err("re_functions", &e),
    }
}

pub fn tool_re_callgraph(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let path = match path_arg(args) {
        Ok(p) => p,
        Err(e) => return err("re_callgraph", &e),
    };
    match read_target(&path, ctx) {
        Ok((_, bytes)) => match callgraph(&bytes) {
            Ok(edges) => ok(serde_json::to_string_pretty(&edges).unwrap_or_default()),
            Err(e) => err("re_callgraph", &e),
        },
        Err(e) => err("re_callgraph", &e),
    }
}

pub fn tool_re_extract(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let path = match path_arg(args) {
        Ok(p) => p,
        Err(e) => return err("re_extract", &e),
    };
    let dest = match args.get("dest").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
        Some(d) => d.to_string(),
        None => return err("re_extract", "Pass dest."),
    };
    let bytes = match read_target(&path, ctx) {
        Ok((_, b)) => b,
        Err(e) => return err("re_extract", &e),
    };
    let blob = match extract_range(&bytes, args) {
        Ok(b) => b,
        Err(e) => return err("re_extract", &e),
    };
    match crate::agent::tools::files::write_bytes(&dest, &blob, ctx.project_path) {
        Ok(msg) => ok(format!("{msg} Extracted {} bytes. The blob was not executed.", blob.len())),
        Err(e) => err("re_extract", &e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tiny_wasm() -> Vec<u8> {
        let mut b = b"\0asm".to_vec();
        b.extend_from_slice(&1u32.to_le_bytes());
        b.extend_from_slice(b"SHAPE_RE_TEST_STRING");
        b
    }

    #[test]
    fn identify_wasm_magic_and_hash() {
        let bytes = tiny_wasm();
        let info = identify_bytes(&bytes);
        assert_eq!(info["format"], "wasm");
        assert!(info["sha256"].as_str().unwrap().len() == 64);
        assert!(info["size"].as_u64().unwrap() > 8);
    }

    #[test]
    fn strings_finds_marker() {
        let found = extract_strings(&tiny_wasm(), 4);
        assert!(found.iter().any(|s| s.contains("SHAPE_RE_TEST_STRING")));
    }

    #[test]
    fn inspect_current_exe() {
        let path = std::env::current_exe().unwrap();
        let bytes = std::fs::read(&path).unwrap();
        let info = inspect_bytes(&bytes);
        let format = info["format"].as_str().unwrap_or("");
        assert!(
            format == "pe" || format == "elf" || format == "mach-o",
            "unexpected format {format}"
        );
        if format == "pe" || format == "elf" {
            assert!(info.get("sections").is_some());
        }
    }

    #[test]
    fn disassemble_current_exe_entry() {
        let path = std::env::current_exe().unwrap();
        let bytes = std::fs::read(&path).unwrap();
        let text = disassemble_bytes(&bytes, &json!({ "length": 64 })).unwrap();
        assert!(text.contains("0x"), "{text}");
        assert!(text.lines().count() >= 2);
    }

    #[test]
    fn stored_zip_member_extracts() {
        // local file header, stored, name a.txt, payload hello
        let mut z = Vec::new();
        z.extend_from_slice(b"PK\x03\x04");
        z.extend_from_slice(&[20, 0, 0, 0]); // ver, flag
        z.extend_from_slice(&0u16.to_le_bytes()); // method stored
        z.extend_from_slice(&[0u8; 8]); // time/crc skip
        z.extend_from_slice(&5u32.to_le_bytes()); // comp
        z.extend_from_slice(&5u32.to_le_bytes()); // uncomp
        z.extend_from_slice(&5u16.to_le_bytes()); // name len
        z.extend_from_slice(&0u16.to_le_bytes()); // extra
        z.extend_from_slice(b"a.txt");
        z.extend_from_slice(b"hello");
        let out = zip_member(&z, "a.txt").unwrap();
        assert_eq!(out, b"hello");
    }
}

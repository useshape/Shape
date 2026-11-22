//! Static binary inspection. goblin parses PE, ELF, and Mach-O. iced-x86
//! disassembles and lifts x86/x64. Nothing in this module executes the file.

use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{Cursor, Read};
use std::path::Path;

use goblin::Object;
use iced_x86::{Decoder, DecoderOptions, FlowControl, Formatter, GasFormatter, Instruction, Mnemonic, OpKind, Register};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::dispatch::{ToolCtx, ToolOutcome};
use crate::agent::security::paths;
use crate::core::error::AppError;

const MAX_BYTES: u64 = 32 * 1024 * 1024;
const LIST_CAP: usize = 80;
const FUNC_CAP: usize = 400;
const INSN_CAP: usize = 180;
const CALL_FUNCS: usize = 32;
const CALL_INSNS: usize = 64;
const EDGE_CAP: usize = 80;
const FACT_CAP: usize = 40;

struct Section {
    name: String,
    va: u64,
    file_off: usize,
    file_len: usize,
    executable: bool,
}

#[derive(Clone)]
struct Symbol {
    name: String,
    va: u64,
    end: u64,
}

struct Image {
    format: String,
    arch: String,
    bits: u32,
    image_base: u64,
    entry: u64,
    sections: Vec<Section>,
    imports: Vec<(String, String)>,
    libraries: Vec<String>,
    symbols: Vec<Symbol>,
    notes: Vec<String>,
    clr: bool,
    signed: bool,
}

struct View {
    summary: String,
    facts: Vec<(String, String)>,
    body: String,
}

pub fn tool_re_catalog(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    let view = View {
        summary: "Built-in static analyzer".into(),
        facts: vec![
            ("Parser".into(), "PE, ELF, Mach-O, WASM".into()),
            ("Disassembly".into(), "x86 and x64".into()),
            ("Lift".into(), "mov, arithmetic, cmp/jcc, call, jmp, ret, push, pop".into()),
            ("Calls".into(), "direct calls from exports, entry, and the PE exception directory".into()),
            ("Runs the file".into(), "no".into()),
        ],
        body: "Unmodeled instructions stay as their mnemonic. The call graph stops at a fixed cap and says so. Other CPU families are identified and are not disassembled.\n".into(),
    };
    finish("catalog", "", view)
}

pub fn tool_re_identify(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let (label, bytes) = match read_user_file(args, ctx) {
        Ok(v) => v,
        Err(message) => return fail(message),
    };
    finish("identify", &label, identify_view(&label, &bytes))
}

pub fn tool_re_inspect(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let (label, bytes) = match read_user_file(args, ctx) {
        Ok(v) => v,
        Err(message) => return fail(message),
    };
    match parse_image(&bytes) {
        Ok(image) => finish("inspect", &label, inspect_view(&label, &bytes, &image)),
        Err(message) => {
            let mut view = identify_view(&label, &bytes);
            view.summary = format!("Could not map {label}");
            view.facts.push(("Parser".into(), message));
            finish("inspect", &label, view)
        }
    }
}

pub fn tool_re_strings(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let (label, bytes) = match read_user_file(args, ctx) {
        Ok(v) => v,
        Err(message) => return fail(message),
    };
    let min = args.get("min_length").and_then(|v| v.as_u64()).unwrap_or(5).clamp(4, 32) as usize;
    let found = collect_strings(&bytes, min);
    let mut body = String::new();
    for (off, text) in found.iter().take(LIST_CAP) {
        body.push_str(&format!("0x{off:x}  {text}\n"));
    }
    if found.len() > LIST_CAP {
        body.push_str(&format!("Stopped after {LIST_CAP} of {} strings.\n", found.len()));
    }
    finish(
        "strings",
        &label,
        View {
            summary: format!("{} strings", found.len()),
            facts: vec![
                ("File".into(), label.clone()),
                ("Minimum".into(), min.to_string()),
                ("Count".into(), found.len().to_string()),
            ],
            body,
        },
    )
}

pub fn tool_re_disassemble(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let (label, bytes) = match read_user_file(args, ctx) {
        Ok(v) => v,
        Err(message) => return fail(message),
    };
    let image = match parse_image(&bytes) {
        Ok(image) => image,
        Err(message) => return fail(message),
    };
    if !image.arch.starts_with("x86") {
        return fail(format!(
            "{label} is {}. This build disassembles x86 and x64.",
            image.arch
        ));
    }
    let length = args.get("length").and_then(|v| v.as_u64()).unwrap_or(256).clamp(1, 4096) as usize;
    let rva = args.get("rva").and_then(|v| v.as_u64());
    let va = resolve_va(&image, rva);
    let (listing, lifted, stopped) = decode_window(&bytes, &image, va, length, INSN_CAP);
    if listing.is_empty() {
        return fail(format!("No executable bytes at {va:#x} in {label}."));
    }
    let mut facts = vec![
        ("File".into(), label.clone()),
        ("Address".into(), format!("{va:#x}")),
        ("Arch".into(), image.arch.clone()),
        ("Instructions".into(), listing.len().to_string()),
    ];
    for (addr, text) in lifted.iter().take(12) {
        facts.push((format!("{addr:#x}"), text.clone()));
    }
    let mut body = String::from("Disassembly:\n");
    for (addr, text) in &listing {
        body.push_str(&format!("{addr:016x}  {text}\n"));
    }
    body.push_str("\nLift:\n");
    for (addr, text) in &lifted {
        body.push_str(&format!("{addr:016x}  {text}\n"));
    }
    if stopped {
        body.push_str(&format!("Stopped after {INSN_CAP} instructions.\n"));
    }
    finish(
        "disassemble",
        &label,
        View {
            summary: format!("{va:#x} · {} insns", listing.len()),
            facts,
            body,
        },
    )
}

pub fn tool_re_functions(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let (label, bytes) = match read_user_file(args, ctx) {
        Ok(v) => v,
        Err(message) => return fail(message),
    };
    let image = match parse_image(&bytes) {
        Ok(image) => image,
        Err(message) => return fail(message),
    };
    let mut body = String::new();
    for symbol in image.symbols.iter().take(LIST_CAP) {
        body.push_str(&format!("{:#x}  {}\n", symbol.va, symbol.name));
    }
    if image.symbols.len() > LIST_CAP {
        body.push_str(&format!(
            "Stopped after {LIST_CAP} of {} functions.\n",
            image.symbols.len()
        ));
    }
    finish(
        "functions",
        &label,
        View {
            summary: format!("{} functions", image.symbols.len()),
            facts: vec![
                ("File".into(), label.clone()),
                ("Count".into(), image.symbols.len().to_string()),
                ("Entry".into(), format!("{:#x}", image.entry)),
            ],
            body,
        },
    )
}

pub fn tool_re_callgraph(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let (label, bytes) = match read_user_file(args, ctx) {
        Ok(v) => v,
        Err(message) => return fail(message),
    };
    let image = match parse_image(&bytes) {
        Ok(image) => image,
        Err(message) => return fail(message),
    };
    if !image.arch.starts_with("x86") {
        return fail(format!(
            "{label} is {}. Call edges are decoded for x86 and x64.",
            image.arch
        ));
    }
    let (edges, scanned, truncated) = direct_calls(&bytes, &image);
    let mut body = String::new();
    for (from, to, name) in edges.iter().take(EDGE_CAP) {
        body.push_str(&format!("{from:#x} -> {to:#x}  {name}\n"));
    }
    if truncated || edges.len() > EDGE_CAP {
        body.push_str("Scan stopped at the cap. This is not the full graph.\n");
    }
    if edges.is_empty() {
        body.push_str("No direct calls in the scanned functions.\n");
    }
    finish(
        "callgraph",
        &label,
        View {
            summary: format!("{} direct calls", edges.len().min(EDGE_CAP)),
            facts: vec![
                ("File".into(), label.clone()),
                ("Functions scanned".into(), scanned.to_string()),
                ("Direct calls".into(), edges.len().min(EDGE_CAP).to_string()),
                ("Complete".into(), if truncated { "no" } else { "within the cap" }.into()),
            ],
            body,
        },
    )
}

pub fn tool_re_extract(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let (label, bytes) = match read_user_file(args, ctx) {
        Ok(v) => v,
        Err(message) => return fail(message),
    };
    let dest = match args.get("dest").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
        Some(dest) => dest,
        None => return fail("Pass dest, a project-relative path.".into()),
    };
    let extracted = if let Some(member) = args.get("member").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
        read_zip_member(&bytes, member)
    } else {
        let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let length = args.get("length").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        if length == 0 {
            Err("Pass length, or member for a zip entry.".into())
        } else {
            read_range(&bytes, offset, length)
        }
    };
    let payload = match extracted {
        Ok(payload) => payload,
        Err(message) => return fail(message),
    };
    let path = match paths::validate_write_path(dest, ctx.project_path) {
        Ok(path) => path,
        Err(error) => return fail(error_text(error)),
    };
    if let Some(parent) = path.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            return fail(error.to_string());
        }
    }
    if let Err(error) = fs::write(&path, &payload) {
        return fail(error.to_string());
    }
    finish(
        "extract",
        &label,
        View {
            summary: format!("{} bytes", payload.len()),
            facts: vec![
                ("From".into(), label.clone()),
                ("Wrote".into(), dest.into()),
                ("Bytes".into(), payload.len().to_string()),
            ],
            body: "Copied bytes only. The file was not executed.\n".into(),
        },
    )
}

fn finish(tool: &str, path: &str, view: View) -> ToolOutcome {
    let mut body = String::new();
    for (key, value) in view.facts.iter().take(FACT_CAP) {
        body.push_str(key);
        body.push('\t');
        body.push_str(&value.replace(['\n', '\r', '\t'], " "));
        body.push('\n');
    }
    ToolOutcome {
        tool_result: format!("{}\n{}{}", view.summary, facts_text(&view.facts), view.body),
        ui_chunk: format!(
            "\n<re_view tool=\"{}\" path=\"{}\" summary=\"{}\">\n{body}</re_view>\n",
            xml(tool),
            xml(path),
            xml(&view.summary),
        ),
        side_effect: None,
    }
}

fn facts_text(facts: &[(String, String)]) -> String {
    let mut out = String::new();
    for (key, value) in facts {
        out.push_str(key);
        out.push_str(": ");
        out.push_str(value);
        out.push('\n');
    }
    out
}

fn fail(message: String) -> ToolOutcome {
    ToolOutcome {
        tool_result: message,
        ui_chunk: String::new(),
        side_effect: None,
    }
}

fn read_user_file(args: &Value, ctx: &ToolCtx<'_>) -> Result<(String, Vec<u8>), String> {
    let label = args
        .get("path")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Pass path.".to_string())?;
    let path = paths::validate_read_path(label, ctx.project_path).map_err(error_text)?;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err(format!("{label} is not a file."));
    }
    if meta.len() > MAX_BYTES {
        return Err(format!(
            "{label} is {} bytes. This analyzer reads up to {} MB.",
            meta.len(),
            MAX_BYTES / 1024 / 1024
        ));
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok((label.to_string(), bytes))
}

fn error_text(error: AppError) -> String {
    error.to_string()
}

fn identify_view(label: &str, bytes: &[u8]) -> View {
    let mut facts = vec![
        ("File".into(), label.into()),
        ("Size".into(), bytes.len().to_string()),
        ("SHA-256".into(), hex::encode(Sha256::digest(bytes))),
        ("Entropy".into(), format!("{:.2}", entropy(bytes))),
        ("Magic".into(), magic_hex(bytes)),
    ];
    match parse_image(bytes) {
        Ok(image) => {
            facts.push(("Format".into(), image.format));
            facts.push(("Arch".into(), image.arch));
        }
        Err(_) => {
            facts.push(("Format".into(), sniff_format(bytes).into()));
        }
    }
    View {
        summary: facts.iter().find(|(k, _)| k == "Format").map(|(_, v)| v.clone()).unwrap_or_else(|| "file".into()),
        facts,
        body: String::new(),
    }
}

fn inspect_view(label: &str, bytes: &[u8], image: &Image) -> View {
    let mut facts = vec![
        ("File".into(), label.into()),
        ("Format".into(), image.format.clone()),
        ("Arch".into(), image.arch.clone()),
        ("Image base".into(), format!("{:#x}", image.image_base)),
        ("Entry".into(), format!("{:#x}", image.entry)),
        ("Sections".into(), image.sections.len().to_string()),
        ("Imports".into(), image.imports.len().to_string()),
        ("Functions".into(), image.symbols.len().to_string()),
        ("Libraries".into(), image.libraries.len().to_string()),
        ("CLR".into(), if image.clr { "yes" } else { "no" }.into()),
        ("Certificate".into(), if image.signed { "yes" } else { "no" }.into()),
        ("SHA-256".into(), hex::encode(Sha256::digest(bytes))),
    ];
    for note in &image.notes {
        facts.push(("Note".into(), note.clone()));
    }
    let mut body = String::from("Sections:\n");
    for section in image.sections.iter().take(LIST_CAP) {
        body.push_str(&format!(
            "{:16} va={:#x} file={:#x} len={:#x} {}\n",
            section.name,
            section.va,
            section.file_off,
            section.file_len,
            if section.executable { "exec" } else { "data" }
        ));
    }
    body.push_str("\nImports:\n");
    for (dll, name) in image.imports.iter().take(LIST_CAP) {
        body.push_str(&format!("{dll}!{name}\n"));
    }
    if image.imports.len() > LIST_CAP {
        body.push_str(&format!("Stopped after {LIST_CAP} imports.\n"));
    }
    body.push_str("\nLibraries:\n");
    for lib in image.libraries.iter().take(LIST_CAP) {
        body.push_str(lib);
        body.push('\n');
    }
    View {
        summary: format!("{} {}", image.format, image.arch),
        facts,
        body,
    }
}

fn parse_image(bytes: &[u8]) -> Result<Image, String> {
    if bytes.starts_with(b"\0asm") {
        return Ok(parse_wasm(bytes));
    }
    match Object::parse(bytes) {
        Ok(Object::PE(pe)) => Ok(parse_pe(bytes, &pe)),
        Ok(Object::Elf(elf)) => Ok(parse_elf(&elf)),
        Ok(Object::Mach(mach)) => parse_mach(bytes, mach),
        Ok(Object::Archive(_)) => Err("Unix archive. Inspect a member, not the archive wrapper.".into()),
        Ok(Object::Unknown(_)) => Err(format!("Unrecognized container ({})", sniff_format(bytes))),
        Err(error) => Err(error.to_string()),
        Ok(_) => Err(format!("Unrecognized container ({})", sniff_format(bytes))),
    }
}

fn parse_pe(bytes: &[u8], pe: &goblin::pe::PE) -> Image {
    let image_base = pe.image_base as u64;
    let mut sections = Vec::new();
    for section in &pe.sections {
        let name = section.name().unwrap_or("").trim_matches('\0').to_string();
        let file_len = section.size_of_raw_data as usize;
        let file_off = section.pointer_to_raw_data as usize;
        if file_len == 0 || file_off >= bytes.len() {
            continue;
        }
        sections.push(Section {
            name,
            va: image_base + section.virtual_address as u64,
            file_off,
            file_len: file_len.min(bytes.len() - file_off),
            executable: section.characteristics & goblin::pe::section_table::IMAGE_SCN_MEM_EXECUTE != 0,
        });
    }
    let mut symbols = Vec::new();
    symbols.push(Symbol {
        name: "entry".into(),
        va: image_base + pe.entry as u64,
        end: 0,
    });
    for export in &pe.exports {
        let Some(name) = export.name else { continue };
        symbols.push(Symbol {
            name: name.to_string(),
            va: image_base + export.rva as u64,
            end: 0,
        });
        if symbols.len() >= FUNC_CAP {
            break;
        }
    }
    if let Some(table) = &pe.exception_data {
        for function in table.functions().flatten() {
            if symbols.len() >= FUNC_CAP {
                break;
            }
            let chained = table
                .get_unwind_info(function, &pe.sections)
                .ok()
                .and_then(|info| info.chained_info)
                .is_some();
            if chained || function.begin_address == 0 {
                continue;
            }
            let va = image_base + function.begin_address as u64;
            if symbols.iter().any(|symbol| symbol.va == va) {
                if let Some(existing) = symbols.iter_mut().find(|symbol| symbol.va == va) {
                    existing.end = image_base + function.end_address as u64;
                }
                continue;
            }
            symbols.push(Symbol {
                name: format!("sub_{va:x}"),
                va,
                end: image_base + function.end_address as u64,
            });
        }
    }
    let clr = pe.imports.iter().any(|import| import.dll.eq_ignore_ascii_case("mscoree.dll"))
        || bytes.windows(4).any(|window| window == b"BSJB");
    Image {
        format: if pe.is_64 { "PE32+".into() } else { "PE32".into() },
        arch: pe_arch(pe.header.coff_header.machine, pe.is_64),
        bits: if pe.is_64 { 64 } else { 32 },
        image_base,
        entry: image_base + pe.entry as u64,
        sections,
        imports: pe
            .imports
            .iter()
            .take(FUNC_CAP)
            .map(|import| (import.dll.to_string(), import.name.to_string()))
            .collect(),
        libraries: pe.libraries.iter().map(|lib| (*lib).to_string()).collect(),
        symbols,
        notes: Vec::new(),
        clr,
        signed: !pe.certificates.is_empty(),
    }
}

fn parse_elf(elf: &goblin::elf::Elf) -> Image {
    let mut sections = Vec::new();
    for header in &elf.section_headers {
        let name = elf
            .shdr_strtab
            .get_at(header.sh_name)
            .unwrap_or("")
            .to_string();
        if header.sh_type == goblin::elf::section_header::SHT_NOBITS || header.sh_size == 0 {
            continue;
        }
        let Some(range) = header.file_range() else { continue };
        sections.push(Section {
            name,
            va: header.sh_addr,
            file_off: range.start,
            file_len: range.end.saturating_sub(range.start),
            executable: header.is_executable(),
        });
    }
    let mut symbols = vec![Symbol {
        name: "entry".into(),
        va: elf.entry,
        end: 0,
    }];
    for sym in elf.syms.iter().chain(elf.dynsyms.iter()) {
        if !sym.is_function() || sym.st_value == 0 || symbols.len() >= FUNC_CAP {
            continue;
        }
        let name = elf
            .strtab
            .get_at(sym.st_name)
            .or_else(|| elf.dynstrtab.get_at(sym.st_name))
            .unwrap_or("")
            .to_string();
        if name.is_empty() || symbols.iter().any(|item| item.va == sym.st_value) {
            continue;
        }
        symbols.push(Symbol {
            name,
            va: sym.st_value,
            end: sym.st_value.saturating_add(sym.st_size),
        });
    }
    Image {
        format: if elf.is_64 { "ELF64".into() } else { "ELF32".into() },
        arch: elf_arch(elf.header.e_machine),
        bits: if elf.is_64 { 64 } else { 32 },
        image_base: sections.iter().map(|section| section.va).min().unwrap_or(0),
        entry: elf.entry,
        sections,
        imports: Vec::new(),
        libraries: elf.libraries.iter().map(|lib| (*lib).to_string()).collect(),
        symbols,
        notes: Vec::new(),
        clr: false,
        signed: false,
    }
}

fn parse_mach(bytes: &[u8], mach: goblin::mach::Mach) -> Result<Image, String> {
    match mach {
        goblin::mach::Mach::Binary(binary) => Ok(parse_macho(&binary, 0)),
        goblin::mach::Mach::Fat(fat) => {
            let arches = fat.arches().map_err(|e| e.to_string())?;
            let index = arches
                .iter()
                .position(|arch| arch.cputype() == goblin::mach::constants::cputype::CPU_TYPE_X86_64)
                .or_else(|| {
                    arches
                        .iter()
                        .position(|arch| arch.cputype() == goblin::mach::constants::cputype::CPU_TYPE_X86)
                })
                .unwrap_or(0);
            let base = arches.get(index).map(|arch| arch.offset as usize).unwrap_or(0);
            match fat.get(index).map_err(|e| e.to_string())? {
                goblin::mach::SingleArch::MachO(binary) => {
                    let mut image = parse_macho(&binary, base);
                    image.notes.push(format!("Fat binary, {} slices. Using slice {index}.", arches.len()));
                    let _ = bytes;
                    Ok(image)
                }
                goblin::mach::SingleArch::Archive(_) => Err("Fat slice is a static archive.".into()),
            }
        }
    }
}

fn parse_macho(macho: &goblin::mach::MachO, base: usize) -> Image {
    let mut sections = Vec::new();
    for iterator in macho.segments.sections() {
        for item in iterator.flatten() {
            let (section, _) = item;
            let name = section.name().unwrap_or("").to_string();
            let file_len = section.size as usize;
            if file_len == 0 {
                continue;
            }
            let executable = section.flags
                & (goblin::mach::constants::S_ATTR_PURE_INSTRUCTIONS
                    | goblin::mach::constants::S_ATTR_SOME_INSTRUCTIONS)
                != 0;
            sections.push(Section {
                name,
                va: section.addr,
                file_off: base + section.offset as usize,
                file_len,
                executable,
            });
        }
    }
    let mut symbols = vec![Symbol {
        name: "entry".into(),
        va: macho.entry,
        end: 0,
    }];
    if let Ok(exports) = macho.exports() {
        for export in exports {
            if symbols.len() >= FUNC_CAP {
                break;
            }
            if export.offset == 0 || symbols.iter().any(|item| item.va == export.offset) {
                continue;
            }
            symbols.push(Symbol {
                name: export.name,
                va: export.offset,
                end: 0,
            });
        }
    }
    let imports = macho
        .imports()
        .unwrap_or_default()
        .into_iter()
        .take(FUNC_CAP)
        .map(|import| (String::new(), import.name.to_string()))
        .collect();
    let (arch, bits) = mach_arch(macho.header.cputype, macho.is_64);
    Image {
        format: "Mach-O".into(),
        arch,
        bits,
        image_base: sections.iter().map(|section| section.va).min().unwrap_or(0),
        entry: macho.entry,
        sections,
        imports,
        libraries: macho.libs.iter().map(|lib| (*lib).to_string()).collect(),
        symbols,
        notes: Vec::new(),
        clr: false,
        signed: false,
    }
}

fn parse_wasm(bytes: &[u8]) -> Image {
    let mut notes = Vec::new();
    let mut offset = 8;
    let mut count = 0usize;
    let names = [
        "custom", "type", "import", "function", "table", "memory", "global", "export", "start", "element", "code", "data",
    ];
    while offset + 1 < bytes.len() && count < 64 {
        let id = bytes[offset] as usize;
        offset += 1;
        let (size, used) = read_leb(bytes, offset);
        offset += used;
        let name = names.get(id).copied().unwrap_or("unknown");
        notes.push(format!("section {id} {name} {size} bytes"));
        offset = offset.saturating_add(size);
        count += 1;
    }
    Image {
        format: "WASM".into(),
        arch: "wasm".into(),
        bits: 32,
        image_base: 0,
        entry: 0,
        sections: Vec::new(),
        imports: Vec::new(),
        libraries: Vec::new(),
        symbols: Vec::new(),
        notes,
        clr: false,
        signed: false,
    }
}

fn read_leb(bytes: &[u8], mut offset: usize) -> (usize, usize) {
    let mut value = 0usize;
    let mut shift = 0;
    let start = offset;
    while offset < bytes.len() && shift < 28 {
        let byte = bytes[offset];
        offset += 1;
        value |= ((byte & 0x7f) as usize) << shift;
        if byte & 0x80 == 0 {
            break;
        }
        shift += 7;
    }
    (value, offset - start)
}

fn resolve_va(image: &Image, rva: Option<u64>) -> u64 {
    let Some(rva) = rva else {
        return image.entry;
    };
    if image.sections.iter().any(|section| contains_va(section, rva)) {
        return rva;
    }
    let based = image.image_base.saturating_add(rva);
    if image.sections.iter().any(|section| contains_va(section, based)) {
        return based;
    }
    rva
}

fn contains_va(section: &Section, va: u64) -> bool {
    let len = section.file_len as u64;
    va >= section.va && va < section.va.saturating_add(len)
}

fn section_bytes<'a>(bytes: &'a [u8], section: &Section) -> &'a [u8] {
    let end = section.file_off.saturating_add(section.file_len).min(bytes.len());
    if section.file_off >= bytes.len() || section.file_off >= end {
        &[]
    } else {
        &bytes[section.file_off..end]
    }
}

fn bytes_at<'a>(bytes: &'a [u8], image: &Image, va: u64) -> Option<(&'a [u8], usize)> {
    let section = image.sections.iter().find(|section| section.executable && contains_va(section, va))?;
    let slice = section_bytes(bytes, section);
    let index = (va - section.va) as usize;
    if index >= slice.len() {
        return None;
    }
    Some((&slice[index..], index))
}

fn decode_window(bytes: &[u8], image: &Image, va: u64, length: usize, cap: usize) -> (Vec<(u64, String)>, Vec<(u64, String)>, bool) {
    let Some((slice, _)) = bytes_at(bytes, image, va) else {
        return (Vec::new(), Vec::new(), false);
    };
    let window = &slice[..slice.len().min(length)];
    let mut decoder = Decoder::with_ip(image.bits, window, va, DecoderOptions::NONE);
    let mut formatter = GasFormatter::new();
    let mut instruction = Instruction::default();
    let mut listing = Vec::new();
    let mut lifted = Vec::new();
    let mut regs: HashMap<String, String> = HashMap::new();
    let mut stack: Vec<String> = Vec::new();
    let mut compare: Option<(String, String)> = None;
    let mut gas = String::new();
    let mut count = 0;
    while decoder.can_decode() && count < cap {
        decoder.decode_out(&mut instruction);
        if instruction.is_invalid() {
            break;
        }
        gas.clear();
        formatter.format(&instruction, &mut gas);
        let addr = instruction.ip();
        listing.push((addr, gas.clone()));
        if let Some(line) = lift_one(&instruction, &mut regs, &mut stack, &mut compare, &image.symbols) {
            lifted.push((addr, line));
        }
        count += 1;
        if instruction.flow_control() == FlowControl::Return && count > 1 {
            break;
        }
    }
    (listing, lifted, decoder.can_decode() && count >= cap)
}

fn lift_one(
    instruction: &Instruction,
    regs: &mut HashMap<String, String>,
    stack: &mut Vec<String>,
    compare: &mut Option<(String, String)>,
    symbols: &[Symbol],
) -> Option<String> {
    let mnemonic = instruction.mnemonic();
    match mnemonic {
        Mnemonic::Nop | Mnemonic::Endbr64 | Mnemonic::Endbr32 => None,
        Mnemonic::Ret => Some("return".into()),
        Mnemonic::Push => {
            stack.push(operand(instruction, 0, regs));
            Some(format!("push {}", operand(instruction, 0, regs)))
        }
        Mnemonic::Pop => {
            let value = stack.pop().unwrap_or_else(|| "stack".into());
            if let Some(name) = dest_reg(instruction) {
                regs.insert(name, value.clone());
            }
            Some(format!("pop {value}"))
        }
        Mnemonic::Mov | Mnemonic::Movzx | Mnemonic::Movsx | Mnemonic::Lea => {
            let source = if mnemonic == Mnemonic::Lea {
                memory_text(instruction)
            } else {
                operand(instruction, 1, regs)
            };
            if let Some(name) = dest_reg(instruction) {
                regs.insert(name.clone(), source.clone());
                Some(format!("{name} = {source}"))
            } else {
                Some(format!("{} = {source}", memory_text(instruction)))
            }
        }
        Mnemonic::Add | Mnemonic::Sub | Mnemonic::Xor | Mnemonic::And | Mnemonic::Or | Mnemonic::Shl | Mnemonic::Shr | Mnemonic::Imul => {
            let op = match mnemonic {
                Mnemonic::Add => "+",
                Mnemonic::Sub => "-",
                Mnemonic::Xor => "^",
                Mnemonic::And => "&",
                Mnemonic::Or => "|",
                Mnemonic::Shl => "<<",
                Mnemonic::Shr => ">>",
                _ => "*",
            };
            let right = operand(instruction, instruction.op_count().saturating_sub(1), regs);
            if let Some(name) = dest_reg(instruction) {
                let left = regs.get(&name).cloned().unwrap_or_else(|| name.clone());
                let value = format!("({left} {op} {right})");
                regs.insert(name.clone(), value.clone());
                Some(format!("{name} = {value}"))
            } else {
                Some(format!("asm {}", gas_fallback(instruction)))
            }
        }
        Mnemonic::Cmp | Mnemonic::Test => {
            let left = operand(instruction, 0, regs);
            let right = operand(instruction, 1, regs);
            *compare = Some((left.clone(), right.clone()));
            Some(format!("cmp {left}, {right}"))
        }
        Mnemonic::Call => Some(format!("call {}", branch_name(instruction, symbols, regs))),
        Mnemonic::Jmp => Some(format!("goto {}", branch_name(instruction, symbols, regs))),
        _ if instruction.flow_control() == FlowControl::ConditionalBranch => {
            let target = branch_name(instruction, symbols, regs);
            let word = cond_word(mnemonic);
            Some(match compare.clone() {
                Some((left, right)) if !word.is_empty() => format!("if ({left} {word} {right}) goto {target}"),
                _ => format!("if ({}) goto {target}", mnemonic_name(mnemonic)),
            })
        }
        _ => Some(format!("asm {}", gas_fallback(instruction))),
    }
}

fn gas_fallback(instruction: &Instruction) -> String {
    let mut formatter = GasFormatter::new();
    let mut text = String::new();
    formatter.format(instruction, &mut text);
    text
}

fn dest_reg(instruction: &Instruction) -> Option<String> {
    if instruction.op_count() == 0 || instruction.op_kind(0) != OpKind::Register {
        return None;
    }
    let name = reg_name(instruction.op0_register());
    if name.is_empty() { None } else { Some(name) }
}

fn operand(instruction: &Instruction, index: u32, regs: &HashMap<String, String>) -> String {
    if index >= instruction.op_count() {
        return "?".into();
    }
    match instruction.op_kind(index) {
        OpKind::Register => {
            let name = reg_name(instruction.op_register(index));
            regs.get(&name).cloned().unwrap_or(name)
        }
        OpKind::NearBranch16 | OpKind::NearBranch32 | OpKind::NearBranch64 => {
            format!("{:#x}", instruction.near_branch_target())
        }
        OpKind::Immediate8
        | OpKind::Immediate16
        | OpKind::Immediate32
        | OpKind::Immediate64
        | OpKind::Immediate8to16
        | OpKind::Immediate8to32
        | OpKind::Immediate8to64
        | OpKind::Immediate32to64 => format!("{:#x}", instruction.immediate64()),
        kind if is_memory(kind) => memory_text(instruction),
        _ => "?".into(),
    }
}

fn memory_text(instruction: &Instruction) -> String {
    let base = reg_name(instruction.memory_base());
    let index = reg_name(instruction.memory_index());
    let scale = instruction.memory_index_scale();
    let disp = instruction.memory_displacement64() as i64;
    let mut text = String::from("[");
    if !base.is_empty() {
        text.push_str(&base);
    }
    if !index.is_empty() {
        if text.len() > 1 {
            text.push('+');
        }
        text.push_str(&index);
        if scale > 1 {
            text.push_str(&format!("*{scale}"));
        }
    }
    if disp != 0 || text.len() == 1 {
        if disp >= 0 && text.len() > 1 {
            text.push('+');
        }
        text.push_str(&format!("{disp:#x}"));
    }
    text.push(']');
    text
}

fn branch_name(instruction: &Instruction, symbols: &[Symbol], regs: &HashMap<String, String>) -> String {
    if matches!(
        instruction.op_kind(0),
        OpKind::NearBranch16 | OpKind::NearBranch32 | OpKind::NearBranch64
    ) {
        let target = instruction.near_branch_target();
        if let Some(symbol) = symbols.iter().find(|symbol| symbol.va == target) {
            return symbol.name.clone();
        }
        return format!("{target:#x}");
    }
    operand(instruction, 0, regs)
}

fn cond_word(mnemonic: Mnemonic) -> &'static str {
    match mnemonic {
        Mnemonic::Je => "==",
        Mnemonic::Jne => "!=",
        Mnemonic::Ja | Mnemonic::Jg => ">",
        Mnemonic::Jae | Mnemonic::Jge => ">=",
        Mnemonic::Jb | Mnemonic::Jl => "<",
        Mnemonic::Jbe | Mnemonic::Jle => "<=",
        _ => "",
    }
}

fn mnemonic_name(mnemonic: Mnemonic) -> String {
    format!("{mnemonic:?}").to_ascii_lowercase()
}

fn reg_name(register: Register) -> String {
    if register == Register::None {
        return String::new();
    }
    format!("{register:?}").to_ascii_lowercase()
}

fn is_memory(kind: OpKind) -> bool {
    matches!(
        kind,
        OpKind::Memory
            | OpKind::MemorySegSI
            | OpKind::MemorySegESI
            | OpKind::MemorySegRSI
            | OpKind::MemorySegDI
            | OpKind::MemorySegEDI
            | OpKind::MemorySegRDI
            | OpKind::MemoryESDI
            | OpKind::MemoryESEDI
            | OpKind::MemoryESRDI
    )
}

fn direct_calls(bytes: &[u8], image: &Image) -> (Vec<(u64, u64, String)>, usize, bool) {
    let mut names: BTreeMap<u64, String> = BTreeMap::new();
    for symbol in &image.symbols {
        names.entry(symbol.va).or_insert_with(|| symbol.name.clone());
    }
    let mut starts: Vec<Symbol> = image.symbols.iter().take(CALL_FUNCS).cloned().collect();
    if starts.is_empty() {
        starts.push(Symbol { name: "entry".into(), va: image.entry, end: 0 });
    }
    let scanned = starts.len().min(CALL_FUNCS);
    let mut edges = Vec::new();
    let mut truncated = image.symbols.len() > CALL_FUNCS;
    for symbol in &starts {
        let length = if symbol.end > symbol.va {
            (symbol.end - symbol.va) as usize
        } else {
            256
        };
        let Some((slice, _)) = bytes_at(bytes, image, symbol.va) else {
            continue;
        };
        let window = &slice[..slice.len().min(length.min(2048))];
        let mut decoder = Decoder::with_ip(image.bits, window, symbol.va, DecoderOptions::NONE);
        let mut instruction = Instruction::default();
        let mut seen = 0;
        while decoder.can_decode() && seen < CALL_INSNS && edges.len() < EDGE_CAP {
            decoder.decode_out(&mut instruction);
            seen += 1;
            if instruction.mnemonic() != Mnemonic::Call {
                continue;
            }
            if !matches!(
                instruction.op_kind(0),
                OpKind::NearBranch16 | OpKind::NearBranch32 | OpKind::NearBranch64
            ) {
                continue;
            }
            let target = instruction.near_branch_target();
            let name = names.get(&target).cloned().unwrap_or_else(|| format!("sub_{target:x}"));
            edges.push((instruction.ip(), target, name));
        }
        if edges.len() >= EDGE_CAP {
            truncated = true;
            break;
        }
    }
    (edges, scanned, truncated)
}

fn collect_strings(bytes: &[u8], min: usize) -> Vec<(usize, String)> {
    let mut out = Vec::new();
    let mut start = None;
    for (index, byte) in bytes.iter().enumerate() {
        let printable = byte.is_ascii_graphic() || *byte == b' ' || *byte == b'\t';
        if printable {
            if start.is_none() {
                start = Some(index);
            }
        } else if let Some(from) = start.take() {
            push_string(&mut out, from, &bytes[from..index], min);
        }
    }
    if let Some(from) = start {
        push_string(&mut out, from, &bytes[from..], min);
    }
    let mut index = 0;
    while index + min * 2 < bytes.len() {
        if bytes[index + 1] != 0 {
            index += 1;
            continue;
        }
        let from = index;
        let mut chars = String::new();
        while index + 1 < bytes.len() && bytes[index].is_ascii_graphic() && bytes[index + 1] == 0 {
            chars.push(bytes[index] as char);
            index += 2;
        }
        if chars.chars().count() >= min {
            out.push((from, chars));
        } else {
            index = from + 1;
        }
    }
    out.truncate(LIST_CAP * 2);
    out
}

fn push_string(out: &mut Vec<(usize, String)>, offset: usize, bytes: &[u8], min: usize) {
    if bytes.len() >= min {
        if let Ok(text) = std::str::from_utf8(bytes) {
            out.push((offset, text.to_string()));
        }
    }
}

fn read_range(bytes: &[u8], offset: usize, length: usize) -> Result<Vec<u8>, String> {
    if length > 1024 * 1024 {
        return Err("Refusing to copy more than 1 MB.".into());
    }
    let end = offset.checked_add(length).ok_or_else(|| "Range overflows.".to_string())?;
    if end > bytes.len() {
        return Err(format!("Range {offset:#x}+{length:#x} is past the end of the file."));
    }
    Ok(bytes[offset..end].to_vec())
}

fn read_zip_member(bytes: &[u8], member: &str) -> Result<Vec<u8>, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut file = archive.by_name(member).map_err(|e| e.to_string())?;
    if file.size() > 1024 * 1024 {
        return Err("Refusing to copy more than 1 MB.".into());
    }
    let mut payload = Vec::new();
    file.read_to_end(&mut payload).map_err(|e| e.to_string())?;
    Ok(payload)
}

fn entropy(bytes: &[u8]) -> f64 {
    if bytes.is_empty() {
        return 0.0;
    }
    let mut counts = [0u64; 256];
    for byte in bytes {
        counts[*byte as usize] += 1;
    }
    let total = bytes.len() as f64;
    counts.iter().filter(|count| **count > 0).fold(0.0, |acc, count| {
        let p = *count as f64 / total;
        acc - p * p.log2()
    })
}

fn magic_hex(bytes: &[u8]) -> String {
    bytes.iter().take(8).map(|byte| format!("{byte:02x}")).collect::<Vec<_>>().join(" ")
}

fn sniff_format(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(b"MZ") {
        "PE"
    } else if bytes.starts_with(b"\x7fELF") {
        "ELF"
    } else if bytes.starts_with(&[0xfe, 0xed, 0xfa, 0xce]) || bytes.starts_with(&[0xfe, 0xed, 0xfa, 0xcf]) || bytes.starts_with(&[0xca, 0xfe, 0xba, 0xbe]) {
        "Mach-O"
    } else if bytes.starts_with(b"\0asm") {
        "WASM"
    } else if bytes.starts_with(b"PK\x03\x04") {
        "ZIP"
    } else {
        "unknown"
    }
}

fn pe_arch(machine: u16, is_64: bool) -> String {
    match machine {
        0x8664 => "x86_64".into(),
        0x14c => "x86".into(),
        0xAA64 => "arm64".into(),
        0x1c0 | 0x1c4 => "arm".into(),
        _ if is_64 => format!("machine {machine:#x}"),
        _ => format!("machine {machine:#x}"),
    }
}

fn elf_arch(machine: u16) -> String {
    match machine {
        62 => "x86_64".into(),
        3 => "x86".into(),
        183 => "arm64".into(),
        40 => "arm".into(),
        other => format!("machine {other:#x}"),
    }
}

fn mach_arch(cputype: u32, is_64: bool) -> (String, u32) {
    use goblin::mach::constants::cputype::{CPU_TYPE_ARM, CPU_TYPE_ARM64, CPU_TYPE_X86, CPU_TYPE_X86_64};
    if cputype == CPU_TYPE_X86_64 {
        ("x86_64".into(), 64)
    } else if cputype == CPU_TYPE_X86 {
        ("x86".into(), 32)
    } else if cputype == CPU_TYPE_ARM64 {
        ("arm64".into(), 64)
    } else if cputype == CPU_TYPE_ARM {
        ("arm".into(), 32)
    } else {
        (format!("cputype {cputype:#x}"), if is_64 { 64 } else { 32 })
    }
}

fn xml(text: &str) -> String {
    text.replace('&', "&amp;").replace('"', "&quot;").replace('<', "&lt;").replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifts_mov_add_and_return() {
        let bytes = [0x48, 0x89, 0xc8, 0x48, 0x83, 0xc0, 0x01, 0xc3];
        let image = raw_x64(&bytes);
        let (_listing, lifted, _) = decode_window(&bytes, &image, 0x1000, bytes.len(), 16);
        let text = lifted.iter().map(|(_, line)| line.as_str()).collect::<Vec<_>>().join("\n");
        assert!(text.contains("rax = rcx"), "{text}");
        assert!(text.contains("rax = (rcx + 0x1)") || text.contains("rax = (rax + 0x1)"), "{text}");
        assert!(text.contains("return"), "{text}");
    }

    #[test]
    fn lifts_compare_and_branch() {
        // cmp rax, 0; je +0; ret
        let bytes = [0x48, 0x83, 0xf8, 0x00, 0x74, 0x00, 0xc3];
        let image = raw_x64(&bytes);
        let (_listing, lifted, _) = decode_window(&bytes, &image, 0x1000, bytes.len(), 16);
        let text = lifted.iter().map(|(_, line)| line.as_str()).collect::<Vec<_>>().join("\n");
        assert!(text.contains("cmp rax, 0x0"), "{text}");
        assert!(text.contains("if (rax == 0x0) goto"), "{text}");
    }

    #[test]
    fn strings_and_wasm_sections_are_real() {
        let blob = b"\0asm\x01\x00\x00\x00\x01\x04hello";
        let image = parse_image(blob).unwrap();
        assert_eq!(image.format, "WASM");
        assert!(image.notes.iter().any(|note| note.contains("type")));
        let found = collect_strings(b"xx\0hello-static\0yy", 5);
        assert!(found.iter().any(|(_, text)| text == "hello-static"));
    }

    #[test]
    fn windows_system_binary_parses_and_disassembles() {
        let path = Path::new(r"C:\Windows\System32\notepad.exe");
        if !path.exists() {
            return;
        }
        let bytes = fs::read(path).unwrap();
        let image = parse_image(&bytes).expect("notepad should parse");
        assert!(image.format.starts_with("PE"), "{}", image.format);
        assert!(image.arch.starts_with("x86"), "{}", image.arch);
        assert!(!image.sections.is_empty());
        assert!(!image.imports.is_empty(), "expected imports");
        let (listing, lifted, _) = decode_window(&bytes, &image, image.entry, 128, 32);
        assert!(!listing.is_empty(), "entry did not disassemble");
        assert!(!lifted.is_empty(), "entry did not lift");
    }

    fn raw_x64(code: &[u8]) -> Image {
        Image {
            format: "raw".into(),
            arch: "x86_64".into(),
            bits: 64,
            image_base: 0x1000,
            entry: 0x1000,
            sections: vec![Section {
                name: ".text".into(),
                va: 0x1000,
                file_off: 0,
                file_len: code.len(),
                executable: true,
            }],
            imports: Vec::new(),
            libraries: Vec::new(),
            symbols: vec![Symbol { name: "entry".into(), va: 0x1000, end: 0 }],
            notes: Vec::new(),
            clr: false,
            signed: false,
        }
    }
}

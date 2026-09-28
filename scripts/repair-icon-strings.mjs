import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const ATTR_FIXES = [
    [/type=RiFileLine/g, 'type="file"'],
    [/pane=RiListOrdered/g, 'pane="list"'],
    [/value=RiStickyNoteLine/g, 'value="notes"'],
    [/className=RiAlignTop/g, 'className="align-top"'],
    [/property=RiFilterLine/g, 'property="filter"'],
    [/type=RiFileLine/g, 'type="file"'],
    [/type="RiFileLine"/g, 'type="file"'],
    [/<mention_context type=RiFileLine/g, '<mention_context type="file"'],
];

const DOMAIN_FIXES = [
    [/export type AttachmentKind = "image" \| "audio" \| RiFileLine \| "terminal" \| RiCodeLine/g,
        'export type AttachmentKind = "image" | "audio" | "file" | "terminal" | "code"'],
    [/if \(file\.type === "text\/x-shape-code"\) return RiCodeLine/g,
        'if (file.type === "text/x-shape-code") return "code"'],
    [/return RiFileLine;/g, 'return "file";'],
    [/Record<Exclude<AttachmentKind, RiFileLine>/g, 'Record<Exclude<AttachmentKind, "file">'],
    [/if \(kind === RiFileLine\)/g, 'if (kind === "file")'],
    [/\| RiFileLine\n/g, '| "file"\n'],
    [/\| RiCodeLine\n/g, '| "code"\n'],
    [/kind: "image" \| "font" \| "video" \| "vector" \| "style" \| "component" \| RiCodeLine/g,
        'kind: "image" | "font" | "video" | "vector" | "style" | "component" | "code"'],
    [/kind: "dropdown" \| "nav" \| RiLink \| "button"/g, 'kind: "dropdown" | "nav" | "link" | "button"'],
    [/\| \{ kind: RiFileLine;/g, '| { kind: "file";'],
    [/selection\?\.kind === RiFileLine/g, 'selection?.kind === "file"'],
    [/kind === RiFileLine/g, 'kind === "file"'],
    [/setDetail\(\{ kind: RiFileLine/g, 'setDetail({ kind: "file"'],
    [/detail\?\.kind === RiFileLine/g, 'detail?.kind === "file"'],
    [/prev\?\.kind === RiFileLine/g, 'prev?.kind === "file"'],
    [/type CategoryId = "files" \| RiCodeLine/g, 'type CategoryId = "files" | "code"'],
    [/\{ id: RiCodeLine, label: "Code", icon: RiCodeLine \}/g, '{ id: "code", label: "Code", icon: RiCodeLine }'],
    [/activeCategory === RiCodeLine/g, 'activeCategory === "code"'],
    [/group === RiCodeLine/g, 'group === "code"'],
    [/else if \(group === RiCodeLine\)/g, 'else if (group === "code")'],
    [/expect\(libraryGroup\("lib\/utils\.ts", RiCodeLine\)\)\.toBe\(RiCodeLine\)/g,
        'expect(libraryGroup("lib/utils.ts", "code")).toBe("code")'],
    [/detail: \{ type: RiFileLine \}/g, 'detail: { type: "file" }'],
    [/remembered\?\.kind === RiCodeLine/g, 'remembered?.kind === "code"'],
    [/openInApp\(app === "vscode" \? RiCodeLine/g, 'openInApp(app === "vscode" ? "code"'],
    [/onClick=\{\(\) => onFormat\(RiCodeLine\)/g, 'onClick={() => onFormat("code")'],
    [/\|\| RiFileLine/g, '|| "file"'],
    [/return RiFileLine;/g, 'return "file";'],
    [/kind: isFolder \? RiFolder5Fill : RiFileLine/g, 'kind: isFolder ? "folder" : "file"'],
    [/kind: path\.endsWith\("\/"\) \? \(RiFolder5Fill as const\) : \(RiFileLine as const\)/g,
        'kind: path.endsWith("/") ? ("folder" as const) : ("file" as const)'],
    [/parsed\.kind !== RiFileLine/g, 'parsed.kind !== "file"'],
    [/mention\.kind === RiFileLine/g, 'mention.kind === "file"'],
    [/\(mention\.kind === RiFileLine/g, '(mention.kind === "file"'],
    [/item\.kind === RiFileLine/g, 'item.kind === "file"'],
];

function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === "node_modules" || ent.name === ".next" || ent.name === "scripts") continue;
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p, out);
        else if (/\.(tsx|ts)$/.test(ent.name)) out.push(p);
    }
    return out;
}

let n = 0;
for (const f of walk(ROOT)) {
    let t = fs.readFileSync(f, "utf8");
    const b = t;
    for (const [re, rep] of ATTR_FIXES) t = t.replace(re, rep);
    for (const [re, rep] of DOMAIN_FIXES) t = t.replace(re, rep);
    if (t !== b) {
        fs.writeFileSync(f, t);
        n++;
        console.log(path.relative(ROOT, f));
    }
}
console.log(`repaired ${n}`);

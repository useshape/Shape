import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const fixes = [
    [/\bkind === RiFolder5Fill\b/g, 'kind === "folder"'],
    [/\bkind === RiFileLine\b/g, 'kind === "file"'],
    [/\bmention\.kind === RiFolder5Fill\b/g, 'mention.kind === "folder"'],
    [/\bmention\.kind === RiFileLine\b/g, 'mention.kind === "file"'],
    [/\| RiFolder5Fill\b/g, '| "folder"'],
    [/\| RiFileLine\b/g, '| "file"'],
    [/\bRiFileLine \|/g, '"file" |'],
    [/\bas RiFileLine\b/g, 'as "file"'],
    [/\bas RiFolder5Fill\b/g, 'as "folder"'],
    [/"login" as const/g, '"login" as const'], // noop guard
    [/\bRiLoginBoxLine\b/g, '"login"'],
    [/\bRiListOrdered as const\b/g, '"list" as const'],
    [/\bRiCursorAiFill \| "vscode"/g, '"cursor" | "vscode"'],
    [/\| RiCursorAiFill/g, '| "cursor"'],
    [/\bRiTabletLine \|/g, '"tablet" |'],
    [/\| RiTabletLine/g, '| "tablet"'],
    [/\bRiShadowLine \|/g, '"layers" |'],
    [/\| RiShadowLine/g, '| "layers"'],
    [/\bRiHistoryLine \|/g, '"history" |'],
    [/\{ kind: RiHistoryLine/g, '{ kind: "history"'],
    [/\bkind: RiHistoryLine\b/g, 'kind: "history"'],
    [/\bRiIncognitoLine\b/g, "RiUserLine"], // fallback — menu may need real icon
    [/import \{ type RemixiconComponentType, type RemixiconComponentType/g, "import { type RemixiconComponentType"],
    [/import \{ type RemixiconComponentType \} from "@remixicon\/react";\nimport \{ type RemixiconComponentType \}/g, 'import { type RemixiconComponentType }'],
    [/from "@\/components\/ui\/icon";\n\nimport \{ type RemixiconComponentType \} from "@remixicon\/react";/g, 'from "@/components/ui/icon";'],
];

function walk(d, a = []) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (["node_modules", ".next", "scripts"].includes(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, a);
        else if (/\.(tsx|ts)$/.test(e.name)) a.push(p);
    }
    return a;
}

for (const f of walk(ROOT)) {
    let t = fs.readFileSync(f, "utf8");
    const b = t;
    for (const [re, rep] of fixes) t = t.replace(re, rep);
    if (t !== b) fs.writeFileSync(f, t);
}

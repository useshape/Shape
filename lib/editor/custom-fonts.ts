"use client";

const STYLE_ID = "shape-custom-editor-fonts";
const loadedFamilies = new Set<string>();

function ensureStyleSheet(): HTMLStyleElement {
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
        el = document.createElement("style");
        el.id = STYLE_ID;
        document.head.appendChild(el);
    }
    return el;
}

function formatForExt(ext: string): string {
    switch (ext) {
        case "woff2": return "woff2";
        case "woff": return "woff";
        case "otf": return "opentype";
        case "ttf": return "truetype";
        default: return "truetype";
    }
}

export async function loadCustomEditorFont(file: File): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["ttf", "otf", "woff", "woff2"].includes(ext)) {
        throw new Error("Supported font formats: .ttf, .otf, .woff, .woff2");
    }

    const family = `ShapeCustom-${file.name.replace(/\.[^.]+$/, "").replace(/\W+/g, "") || "Font"}`;
    if (loadedFamilies.has(family)) {
        return `'${family}', monospace`;
    }

    const buffer = await file.arrayBuffer();
    const blob = new Blob([buffer], { type: file.type || `font/${ext}` });
    const url = URL.createObjectURL(blob);
    const sheet = ensureStyleSheet();
    sheet.appendChild(document.createTextNode(
        `@font-face{font-family:'${family}';src:url('${url}') format('${formatForExt(ext)}');font-display:swap;}`
    ));
    loadedFamilies.add(family);

    try {
        await document.fonts.load(`16px '${family}'`);
    } catch {
        // Font may still render once loaded by the browser
    }

    return `'${family}', monospace`;
}

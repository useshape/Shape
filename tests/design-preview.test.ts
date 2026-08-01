import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMessageContent } from "@/features/chat/ui/md/renderer";
import {
    PREVIEW_BUNDLE_FILENAME,
    PREVIEW_TAILWIND_FILENAME,
    PREVIEW_EMIT_FN,
    PREVIEW_INITIALIZATION_SCRIPT,
    PREVIEW_READY_GLOBAL,
    PREVIEW_READY_TITLE_SUFFIX,
    buildBodyPreviewHtml,
    buildPreviewReadyScript,
    buildReactSandboxHtml,
    escapeScriptClosers,
    normalizePreviewJsx,
} from "@/lib/design-preview-sandbox";

const runtimeBundle = readFileSync(
    join(process.cwd(), "src-tauri", "preview-runtime", "bundle.js"),
    "utf8",
);

describe("normalizePreviewJsx", () => {
    it("wraps bare JSX in function App", () => {
        const result = normalizePreviewJsx('<div className="p-4">Wiki</div>');
        expect(result).toContain("function App()");
        expect(result).toContain("Wiki");
    });

    it("preserves an existing App component", () => {
        const source = `function App() { return React.createElement("main", null, "Hello"); }`;
        expect(normalizePreviewJsx(source)).toBe(source);
    });
});

describe("buildReactSandboxHtml", () => {
    it("uses external bundled runtime instead of CDN scripts", () => {
        const html = buildReactSandboxHtml(`function App() {
  return <div className="text-white">Classic</div>;
}`);
        expect(html).not.toContain("unpkg.com");
        expect(html).not.toContain("cdn.tailwindcss.com");
        expect(html).not.toContain("esm.sh");
        expect(html).toContain("ShapePreviewRuntime.mountPreview");
        expect(html).toContain("Classic");
        expect(html).toContain(`src="${PREVIEW_BUNDLE_FILENAME}"`);
        expect(html).toContain(`src="${PREVIEW_TAILWIND_FILENAME}"`);
        expect(html).not.toContain('@import "tailwindcss"');
        expect(html.length).toBeLessThan(20_000);
        expect(runtimeBundle.length).toBeGreaterThan(10_000);
    });

    it("accepts an absolute asset bundle URL", () => {
        const abs = "http://asset.localhost/C%3A%5Ctemp%5Cbundle.js";
        const html = buildReactSandboxHtml(`function App() { return <div>Hi</div>; }`, {
            bundleSrc: abs,
        });
        expect(html).toContain(`src="${abs}"`);
    });

    it("escapes script closers inside agent JSX", () => {
        const html = buildReactSandboxHtml('function App() { return <div></script></div>; }');
        expect(html).not.toContain("</script></div>");
        expect(html).toContain("\\\\/script>");
    });
});

async function runPreviewReadyScript(script: string) {
    const trimmed = script.trim().replace(/;\s*$/, "");
    // eslint-disable-next-line no-new-func
    await new Function(`return ${trimmed}`)();
}

describe("buildPreviewReadyScript", () => {
    it("calls the preview emit helper when available", async () => {
        const script = buildPreviewReadyScript();
        let emitted = false;
        (globalThis as typeof globalThis & Record<string, unknown>)[PREVIEW_EMIT_FN] = async () => {
            emitted = true;
        };
        await runPreviewReadyScript(script);
        expect(emitted).toBe(true);
    });

    it("sets title suffix and ready global without helper", async () => {
        const script = buildPreviewReadyScript();
        delete (globalThis as typeof globalThis & Record<string, unknown>)[PREVIEW_EMIT_FN];
        Object.defineProperty(document, "title", { value: "shape-preview-test", writable: true });
        await runPreviewReadyScript(script);
        expect(document.title.endsWith(PREVIEW_READY_TITLE_SUFFIX)).toBe(true);
        expect((globalThis as typeof globalThis & Record<string, unknown>)[PREVIEW_READY_GLOBAL]).toBe(
            true,
        );
    });
});

describe("PREVIEW_INITIALIZATION_SCRIPT", () => {
    it("defines a Tauri-aware emit helper with title fallback", () => {
        expect(PREVIEW_INITIALIZATION_SCRIPT).toContain(PREVIEW_EMIT_FN);
        expect(PREVIEW_INITIALIZATION_SCRIPT).toContain("preview-ready");
        expect(PREVIEW_INITIALIZATION_SCRIPT).toContain("getCurrentWebview");
        expect(PREVIEW_INITIALIZATION_SCRIPT).toContain(PREVIEW_READY_TITLE_SUFFIX);
    });
});

describe("buildBodyPreviewHtml", () => {
    it("wraps static HTML bodies with ready script", () => {
        const html = buildBodyPreviewHtml("<p>Body</p>");
        expect(html).toContain("<p>Body</p>");
        expect(html).toContain(PREVIEW_EMIT_FN);
    });

    it("signals parent iframe when static preview is ready", () => {
        const html = buildBodyPreviewHtml("<main>Preview</main>");
        expect(html).toContain("shape-preview-ready");
        expect(html).toContain("postMessage");
    });
});

describe("escapeScriptClosers", () => {
    it("escapes closing script tags", () => {
        expect(escapeScriptClosers("</script>")).toBe("<\\/script>");
    });
});

describe("parseMessageContent design_previews", () => {
    it("parses design preview XML from agent output", () => {
        const text = `
<design_previews selected="">
<design_preview id="primary-btn" name="PrimaryButton" style="radix" path="C:\\\\tmp\\\\a.html" width="640" height="360" kind="html"/>
</design_previews>`;

        const chunks = parseMessageContent(text);
        const block = chunks.find((c) => c.type === "design_previews");
        expect(block?.designPreviews).toHaveLength(1);
        expect(block?.designPreviews?.[0]).toMatchObject({
            id: "primary-btn",
            name: "PrimaryButton",
            width: 640,
            height: 360,
        });
    });
});

describe("preview runtime bundle", () => {
    it("ships offline React and Tailwind browser artifacts for Rust include_str", () => {
        expect(runtimeBundle).toContain("ShapePreviewRuntime");
        expect(runtimeBundle).toContain("mountPreview");
        const tailwindBundle = readFileSync(
            join(process.cwd(), "src-tauri", "preview-runtime", "tailwind-browser.js"),
            "utf8",
        );
        expect(tailwindBundle.length).toBeGreaterThan(100_000);
        expect(tailwindBundle).toContain("tailwindcss");
    });
});

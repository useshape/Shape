/**
 * Design preview document helpers mirrored by Rust (`design_sandbox.rs`).
 * Vitest validates structure and ready-signaling contracts.
 */

export const PREVIEW_READY_GLOBAL = "__SHAPE_PREVIEW_READY__";
export const PREVIEW_EMIT_FN = "__shapeSignalPreviewReady";
export const PREVIEW_READY_TITLE_SUFFIX = "|ready";

export function normalizePreviewJsx(jsx: string): string {
    const trimmed = jsx.trim();
    if (!trimmed) {
        return `function App() {
  return React.createElement("div", { className: "p-8 text-white" }, "Empty preview");
}`;
    }
    if (trimmed.includes("function App") || trimmed.startsWith("const App")) {
        return trimmed;
    }
    return `function App() {
  return (
    ${trimmed}
  );
}`;
}

export function escapeScriptClosers(source: string): string {
    return source.replace(/<\/script>/gi, "<\\/script>");
}

export const PREVIEW_INITIALIZATION_SCRIPT = `(function () {
  window.${PREVIEW_EMIT_FN} = function signalPreviewReady() {
    window.${PREVIEW_READY_GLOBAL} = true;
    try {
      var base = document.title || "";
      if (!base.endsWith("${PREVIEW_READY_TITLE_SUFFIX}")) document.title = base + "${PREVIEW_READY_TITLE_SUFFIX}";
    } catch (_) {}
    var tauri = window.__TAURI__;
    if (!tauri) return Promise.resolve();
    try {
      if (tauri.webview && typeof tauri.webview.getCurrentWebview === "function") {
        return tauri.webview.getCurrentWebview().emit("preview-ready", {});
      }
    } catch (_) {}
    try {
      if (tauri.event && typeof tauri.event.emit === "function") {
        return tauri.event.emit("preview-ready", {});
      }
    } catch (_) {}
    return Promise.resolve();
  };
})();`;

export function buildPreviewReadyScript(): string {
    return `(async () => {
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  } catch (_) {}
  try {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "shape-preview-ready" }, "*");
    }
  } catch (_) {}
  if (typeof window.${PREVIEW_EMIT_FN} === "function") {
    await window.${PREVIEW_EMIT_FN}();
  } else {
    window.${PREVIEW_READY_GLOBAL} = true;
    document.title = (document.title || "") + "${PREVIEW_READY_TITLE_SUFFIX}";
  }
})();`;
}

export const PREVIEW_BUNDLE_FILENAME = "bundle.js";
export const PREVIEW_TAILWIND_FILENAME = "tailwind-browser.js";

/** Offline preview shell: external bundled runtime + no CDN dependencies. */
export function buildReactSandboxHtml(
    jsx: string,
    options?: { projectCss?: string; bundleSrc?: string; tailwindSrc?: string },
): string {
    const userCode = escapeScriptClosers(normalizePreviewJsx(jsx));
    const projectCss = options?.projectCss ?? "";
    const bundleSrc = options?.bundleSrc ?? PREVIEW_BUNDLE_FILENAME;
    const tailwindSrc = options?.tailwindSrc ?? PREVIEW_TAILWIND_FILENAME;
    const userCodeJson = JSON.stringify(userCode);
    const projectCssJson = JSON.stringify(projectCss);
    const bundleSrcAttr = bundleSrc
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const tailwindSrcAttr = tailwindSrc
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="data:," />
  <title>shape-preview-doc</title>
  <script src="${tailwindSrcAttr}"></script>
</head>
<body>
  <div id="root"></div>
  <script src="${bundleSrcAttr}"></script>
  <script>
    (async () => {
      try {
        if (typeof ShapePreviewRuntime === "undefined" || !ShapePreviewRuntime.mountPreview) {
          throw new Error("Preview runtime failed to load from ${bundleSrcAttr}");
        }
        await ShapePreviewRuntime.mountPreview(${userCodeJson}, ${projectCssJson});
      } catch (error) {
        const root = document.getElementById("root");
        if (root) {
          root.innerHTML = '<pre style="color:#fca5a5;padding:16px;white-space:pre-wrap;">' + String(error) + '</pre>';
        }
        if (typeof window.${PREVIEW_EMIT_FN} === "function") {
          await window.${PREVIEW_EMIT_FN}();
        } else {
          window.${PREVIEW_READY_GLOBAL} = true;
          document.title = (document.title || "") + "${PREVIEW_READY_TITLE_SUFFIX}";
        }
        try {
          if (window.parent !== window) {
            window.parent.postMessage({ type: "shape-preview-ready" }, "*");
          }
        } catch (_) {}
      }
    })();
  </script>
</body>
</html>`;
}

export function buildBodyPreviewHtml(bodyHtml: string, projectCss = ""): string {
    const sanitized = projectCss
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return (
                trimmed.length > 0 &&
                !trimmed.startsWith("@import") &&
                !trimmed.startsWith("@plugin") &&
                !trimmed.startsWith("@source") &&
                !trimmed.startsWith("@tailwind")
            );
        })
        .join("\n");
    const themeBlock = sanitized
        ? `<style type="text/tailwindcss">
${sanitized}
</style>`
        : "";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="data:," />
  <title>shape-preview-doc</title>
  <script src="${PREVIEW_TAILWIND_FILENAME}"></script>
  ${themeBlock}
</head>
<body>
${bodyHtml}
<script>
  ${buildPreviewReadyScript()}
</script>
</body>
</html>`;
}

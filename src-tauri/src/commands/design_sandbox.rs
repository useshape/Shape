use std::path::{Path, PathBuf};

use crate::core::error::AppError;

#[allow(dead_code)]
pub const PREVIEW_READY_GLOBAL: &str = "__SHAPE_PREVIEW_READY__";
#[allow(dead_code)]
pub const PREVIEW_EMIT_FN: &str = "__shapeSignalPreviewReady";
#[allow(dead_code)]
pub const PREVIEW_READY_TITLE_SUFFIX: &str = "|ready";

pub const PREVIEW_BUNDLE_FILENAME: &str = "bundle.js";
pub const PREVIEW_TAILWIND_FILENAME: &str = "tailwind-browser.js";

static PREVIEW_RUNTIME_BUNDLE: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/preview-runtime/bundle.js"));

static PREVIEW_TAILWIND_BROWSER: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/preview-runtime/tailwind-browser.js"));

#[allow(dead_code)]
pub fn preview_runtime_bundle_bytes() -> &'static str {
    PREVIEW_RUNTIME_BUNDLE
}

pub fn ensure_preview_runtime_bundle(dir: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(dir)
        .map_err(|e| AppError::Env(format!("Failed to create preview dir: {e}")))?;
    let bundle_path = dir.join(PREVIEW_BUNDLE_FILENAME);
    let needs_bundle = match std::fs::metadata(&bundle_path) {
        Ok(meta) => meta.len() as usize != PREVIEW_RUNTIME_BUNDLE.len(),
        Err(_) => true,
    };
    if needs_bundle {
        std::fs::write(&bundle_path, PREVIEW_RUNTIME_BUNDLE)
            .map_err(|e| AppError::Env(format!("Failed to write preview runtime bundle: {e}")))?;
    }
    let tailwind_path = dir.join(PREVIEW_TAILWIND_FILENAME);
    let needs_tailwind = match std::fs::metadata(&tailwind_path) {
        Ok(meta) => meta.len() as usize != PREVIEW_TAILWIND_BROWSER.len(),
        Err(_) => true,
    };
    if needs_tailwind {
        std::fs::write(&tailwind_path, PREVIEW_TAILWIND_BROWSER).map_err(|e| {
            AppError::Env(format!("Failed to write preview tailwind browser: {e}"))
        })?;
    }
    Ok(())
}

/// Injected before page scripts so preview windows can emit `preview-ready`.
#[allow(dead_code)]
pub const PREVIEW_INITIALIZATION_SCRIPT: &str = r#"(function () {
  window.__shapeSignalPreviewReady = function signalPreviewReady() {
    window.__SHAPE_PREVIEW_READY__ = true;
    try {
      var base = document.title || "";
      if (!base.endsWith("|ready")) document.title = base + "|ready";
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
})();"#;

pub fn sandbox_root() -> PathBuf {
    std::env::temp_dir().join("shape-design-sandbox")
}

pub fn session_dir(session_id: &str) -> PathBuf {
    sandbox_root().join(sanitize_path_segment(session_id))
}

pub fn ensure_session_dir(session_id: &str) -> Result<PathBuf, AppError> {
    let dir = session_dir(session_id);
    std::fs::create_dir_all(&dir)
        .map_err(|e| AppError::Env(format!("Failed to create design sandbox dir: {e}")))?;
    Ok(dir)
}

/// Escape so inlined JS cannot terminate the surrounding `<script>` tag.
fn escape_for_inline_script(source: &str) -> String {
    source.replace("</script>", "<\\/script>")
}

fn replace_script_src_containing(html: &str, needle: &str, replacement: &str) -> String {
    let mut out = html.to_string();
    let mut search_from = 0;
    while let Some(rel) = out[search_from..].find("<script ") {
        let idx = search_from + rel;
        let Some(end_rel) = out[idx..].find("</script>") else {
            break;
        };
        let end = idx + end_rel + "</script>".len();
        let tag = &out[idx..end];
        if tag.contains("src=") && tag.contains(needle) {
            out = format!("{}{}{}", &out[..idx], replacement, &out[end..]);
            break;
        }
        search_from = end;
    }
    out
}

/// Inline React + Tailwind browser bundles into the document.
/// Required for live iframes on Windows: WebView2 often cannot load sibling
/// `asset.localhost` script URLs from inside an iframe (`convertFileSrc` HTML).
pub fn inline_preview_runtime_scripts(document: &str) -> String {
    let tw_tag = format!(
        "<script>\n{}\n</script>",
        escape_for_inline_script(PREVIEW_TAILWIND_BROWSER)
    );
    let bundle_tag = format!(
        "<script>\n{}\n</script>",
        escape_for_inline_script(PREVIEW_RUNTIME_BUNDLE)
    );
    let with_tw = replace_script_src_containing(document, "tailwind-browser.js", &tw_tag);
    replace_script_src_containing(&with_tw, "bundle.js", &bundle_tag)
}

/// Write a self-contained live preview HTML (scripts inlined) for gallery iframes.
pub fn write_live_preview_document(
    session_id: &str,
    concept_id: &str,
    document: &str,
) -> Result<PathBuf, AppError> {
    let html = inline_preview_runtime_scripts(document);
    write_concept_document(session_id, concept_id, &html)
}

pub fn write_concept_document(
    session_id: &str,
    concept_id: &str,
    html: &str,
) -> Result<PathBuf, AppError> {
    let dir = ensure_session_dir(session_id)?;
    let path = dir.join(format!("concept-{}.html", sanitize_path_segment(concept_id)));
    std::fs::write(&path, html)
        .map_err(|e| AppError::Env(format!("Failed to write concept preview html: {e}")))?;
    Ok(path)
}

pub fn cleanup_session(session_id: &str) {
    let dir = session_dir(session_id);
    let _ = std::fs::remove_dir_all(dir);
}

pub fn build_react_sandbox_html(
    jsx: &str,
    project_path: Option<&str>,
    use_project_tokens: bool,
) -> String {
    build_react_sandbox_html_with_bundle_src(
        jsx,
        project_path,
        use_project_tokens,
        PREVIEW_BUNDLE_FILENAME,
    )
}

/// `bundle_src` must be an absolute asset URL on Windows — relative paths break under
/// `https://asset.localhost/<encodeURIComponent(fullPath)>` because siblings don't resolve.
pub fn build_react_sandbox_html_with_bundle_src(
    jsx: &str,
    project_path: Option<&str>,
    use_project_tokens: bool,
    bundle_src: &str,
) -> String {
    build_react_sandbox_html_with_assets(
        jsx,
        project_path,
        use_project_tokens,
        bundle_src,
        PREVIEW_TAILWIND_FILENAME,
    )
}

pub fn build_react_sandbox_html_with_assets(
    jsx: &str,
    project_path: Option<&str>,
    use_project_tokens: bool,
    bundle_src: &str,
    tailwind_src: &str,
) -> String {
    let project_css = if use_project_tokens {
        load_project_css(project_path)
    } else {
        String::new()
    };
    build_offline_preview_document(
        PreviewDocumentKind::React {
            user_code: jsx,
            bundle_src,
            tailwind_src,
        },
        &project_css,
    )
}

pub fn build_static_preview_html(body_html: &str, project_css: &str) -> String {
    build_offline_preview_document(
        PreviewDocumentKind::StaticBody {
            body_html: body_html.to_string(),
        },
        project_css,
    )
}

enum PreviewDocumentKind<'a> {
    React {
        user_code: &'a str,
        bundle_src: &'a str,
        tailwind_src: &'a str,
    },
    StaticBody { body_html: String },
}

fn preview_document_head(tailwind_src: &str, project_css: &str) -> String {
    let tailwind_src_attr = html_attr_escape(tailwind_src);
    let theme_block = if project_css.trim().is_empty() {
        String::new()
    } else {
        format!(
            r#"
  <style type="text/tailwindcss">
{project_css}
  </style>"#
        )
    };
    // Load tailwind-browser.js first. Do NOT put `@import "tailwindcss"` in HTML — WebView2
    // resolves it via the asset protocol (`…/tailwindcss`) before Tailwind's virtual loader runs.
    format!(
        r#"<meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="data:," />
  <title>shape-preview-doc</title>
  <script src="{tailwind_src_attr}"></script>{theme_block}"#
    )
}

fn build_offline_preview_document(kind: PreviewDocumentKind<'_>, project_css: &str) -> String {
    let user_code_json = match &kind {
        PreviewDocumentKind::React { user_code, .. } => {
            serde_json::to_string(user_code).unwrap_or_else(|_| "\"\"".to_string())
        }
        PreviewDocumentKind::StaticBody { .. } => "\"\"".to_string(),
    };
    let project_css_json =
        serde_json::to_string(project_css).unwrap_or_else(|_| "\"\"".to_string());

    let head = match &kind {
        PreviewDocumentKind::React { tailwind_src, .. } => {
            preview_document_head(tailwind_src, project_css)
        }
        PreviewDocumentKind::StaticBody { .. } => {
            preview_document_head(PREVIEW_TAILWIND_FILENAME, project_css)
        }
    };

    let body = match kind {
        PreviewDocumentKind::React {
            bundle_src,
            ..
        } => {
            let bundle_src_attr = html_attr_escape(bundle_src);
            format!(
                r#"<div id="root"></div>
<script src="{bundle_src_attr}"></script>
<script>
  (async () => {{
    try {{
      if (typeof ShapePreviewRuntime === "undefined" || !ShapePreviewRuntime.mountPreview) {{
        throw new Error("Preview runtime failed to load from {bundle_src_attr}");
      }}
      await ShapePreviewRuntime.mountPreview({user_code_json}, {project_css_json});
    }} catch (error) {{
      const root = document.getElementById("root");
      if (root) {{
        root.innerHTML = '<pre style="color:#fca5a5;padding:16px;white-space:pre-wrap;">' + String(error) + '</pre>';
      }}
      if (typeof window.__shapeSignalPreviewReady === "function") {{
        await window.__shapeSignalPreviewReady();
      }} else {{
        window.__SHAPE_PREVIEW_READY__ = true;
        document.title = (document.title || "") + "|ready";
      }}
      try {{
        if (window.parent !== window) {{
          window.parent.postMessage({{ type: "shape-preview-ready" }}, "*");
        }}
      }} catch (_) {{}}
    }}
  }})();
</script>"#
            )
        }
        PreviewDocumentKind::StaticBody { body_html } => {
            format!(
                r#"{body_html}
<script>
  (async () => {{
    try {{
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }} catch (_) {{}}
    try {{
      if (window.parent !== window) {{
        window.parent.postMessage({{ type: "shape-preview-ready" }}, "*");
      }}
    }} catch (_) {{}}
    if (typeof window.__shapeSignalPreviewReady === "function") {{
      await window.__shapeSignalPreviewReady();
    }} else {{
      window.__SHAPE_PREVIEW_READY__ = true;
      document.title = (document.title || "") + "|ready";
    }}
  }})();
</script>"#
            )
        }
    };

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  {head}
  <style>
    html, body {{
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #09090b;
      color: #fafafa;
    }}
    body {{
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 28px 24px;
      overflow: auto;
    }}
    #root {{
      display: flex;
      align-items: center;
      justify-content: center;
      width: max-content;
      max-width: 100%;
      margin: 0 auto;
    }}
  </style>
</head>
<body>
{body}
</body>
</html>"#
    )
}

#[allow(dead_code)]
pub fn build_preview_ready_script(_max_wait_ms: u64) -> String {
    r#"(async () => {
  if (typeof window.__shapeSignalPreviewReady === "function") {
    await window.__shapeSignalPreviewReady();
  } else {
    window.__SHAPE_PREVIEW_READY__ = true;
    document.title = (document.title || "") + "|ready";
  }
})();"#
    .to_string()
}

fn load_project_css(project_path: Option<&str>) -> String {
    let Some(root) = project_path else {
        return String::new();
    };
    let candidates = [
        Path::new(root).join("app").join("globals.css"),
        Path::new(root).join("src").join("app").join("globals.css"),
        Path::new(root).join("shape").join("app").join("globals.css"),
        Path::new(root).join("globals.css"),
    ];
    for path in candidates {
        if let Ok(css) = std::fs::read_to_string(&path) {
            return sanitize_project_css(&css);
        }
    }
    String::new()
}

fn sanitize_project_css(css: &str) -> String {
    css.lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty()
                && !trimmed.starts_with("@import")
                && !trimmed.starts_with("@plugin")
                && !trimmed.starts_with("@source")
                && !trimmed.starts_with("@tailwind")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn sanitize_path_segment(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn html_attr_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inline_preview_runtime_scripts_embeds_bundles() {
        let shell = build_react_sandbox_html(
            r#"function App() { return <div className="p-8">Hello</div>; }"#,
            None,
            false,
        );
        let inlined = inline_preview_runtime_scripts(&shell);
        assert!(!inlined.contains(r#"src="bundle.js""#));
        assert!(!inlined.contains(r#"src="tailwind-browser.js""#));
        assert!(inlined.contains("ShapePreviewRuntime"));
        assert!(inlined.len() > 100_000);
        // HTML must not declare @import in a style tag; the browser bundle may mention it in JS.
        assert!(!inlined.contains(r#"type="text/tailwindcss">
@import "tailwindcss""#));
    }

    #[test]
    fn offline_document_includes_bundled_runtime_not_cdn() {
        let html = build_react_sandbox_html(
            r#"function App() { return <div className="p-8">Hello</div>; }"#,
            None,
            false,
        );
        assert!(!html.contains("unpkg.com"));
        assert!(!html.contains("cdn.tailwindcss.com"));
        assert!(!html.contains("esm.sh"));
        assert!(html.contains("ShapePreviewRuntime.mountPreview"));
        assert!(html.contains("function App"));
        assert!(html.contains(r#"src="bundle.js""#));
        assert!(html.contains(r#"src="tailwind-browser.js""#));
        assert!(!html.contains(r#"@import "tailwindcss""#));
        assert!(html.len() < 20_000);

        let with_abs = build_react_sandbox_html_with_bundle_src(
            r#"function App() { return <div>Hi</div>; }"#,
            None,
            false,
            "http://asset.localhost/C%3A%5Ctemp%5Cbundle.js",
        );
        assert!(with_abs.contains(r#"src="http://asset.localhost/C%3A%5Ctemp%5Cbundle.js""#));
    }

    #[test]
    fn static_document_signals_ready_without_network() {
        let html = build_static_preview_html("<main>Preview</main>", "");
        assert!(html.contains("__shapeSignalPreviewReady"));
        assert!(html.contains("<main>Preview</main>"));
        assert!(html.contains("shape-preview-ready"));
        assert!(html.contains("postMessage"));
    }

    #[test]
    fn bundle_is_embedded() {
        assert!(PREVIEW_RUNTIME_BUNDLE.contains("ShapePreviewRuntime"));
        assert!(PREVIEW_TAILWIND_BROWSER.contains("tailwindcss"));
    }

    #[test]
    fn sanitize_project_css_strips_unsupported_at_rules() {
        let raw = r#"@import "tailwindcss";
@plugin "foo";
:root { --accent: #3946FF; }
.card { color: red; }"#;
        let cleaned = sanitize_project_css(raw);
        assert!(!cleaned.contains("@import"));
        assert!(!cleaned.contains("@plugin"));
        assert!(cleaned.contains("--accent"));
        assert!(cleaned.contains(".card"));
    }

    #[test]
    fn init_script_targets_preview_ready_event() {
        assert!(PREVIEW_INITIALIZATION_SCRIPT.contains("preview-ready"));
        assert!(PREVIEW_INITIALIZATION_SCRIPT.contains("getCurrentWebview"));
    }
}

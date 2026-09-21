import React from "react";
import { createRoot } from "react-dom/client";
import { transform } from "sucrase";

const BASE_LAYOUT_CSS = `
  html, body, #root { margin: 0; min-height: 100%; width: 100%; }
`;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeProjectCss(css: string): string {
    return css
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
        .join("\n")
        .trim();
}

function injectTailwindTheme(projectCss: string) {
    const sanitized = sanitizeProjectCss(projectCss);
    if (!sanitized) return;
    let style = document.querySelector<HTMLStyleElement>('style[type="text/tailwindcss"]');
    if (!style) {
        style = document.createElement("style");
        style.setAttribute("type", "text/tailwindcss");
        document.head.appendChild(style);
    }
    const base = style.textContent?.trim() ?? "";
    if (!base.includes(sanitized)) {
        style.textContent = base ? `${base}\n${sanitized}` : sanitized;
    }
}

function injectBaseLayoutCss() {
    const style = document.createElement("style");
    style.textContent = BASE_LAYOUT_CSS;
    document.head.appendChild(style);
}

function normalizeUserCode(source: string): string {
    const trimmed = source.trim();
    if (!trimmed) {
        return `function App() { return React.createElement("div", { className: "p-8 text-white bg-zinc-950" }, "Empty preview"); }`;
    }
    if (trimmed.includes("function App") || trimmed.startsWith("const App")) {
        return trimmed;
    }
    return `function App() { return (${trimmed}); }`;
}

async function signalPreviewReady() {
    (window as Window & { __SHAPE_PREVIEW_READY__?: boolean }).__SHAPE_PREVIEW_READY__ = true;
    try {
        const base = document.title || "";
        if (!base.endsWith("|ready")) document.title = `${base}|ready`;
    } catch {
        // ignore
    }
    const tauri = (window as Window & {
        __TAURI__?: {
            webview?: { getCurrentWebview?: () => { emit: (e: string, p: unknown) => Promise<void> } };
            event?: { emit: (e: string, p: unknown) => Promise<void> };
        };
    }).__TAURI__;
    try {
        await tauri?.webview?.getCurrentWebview?.().emit("preview-ready", {});
        return;
    } catch {
        // fall through
    }
    try {
        await tauri?.event?.emit?.("preview-ready", {});
    } catch {
        // ignore
    }
    try {
        if (window.parent !== window) {
            window.parent.postMessage({ type: "shape-preview-ready" }, "*");
        }
    } catch {
        // ignore
    }
}

function compileUserCode(source: string): string {
    const normalized = normalizeUserCode(source);
    if (!/[<][A-Za-z/!]/.test(normalized)) {
        return `${normalized}\n;return App;`;
    }
    const { code } = transform(normalized, {
        transforms: ["jsx"],
        jsxRuntime: "classic",
        production: true,
    });
    return `${code}\n;return App;`;
}

async function waitForTailwindPaint(root: HTMLElement) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const styled = Array.from(root.querySelectorAll<HTMLElement>("[class]")).some((el) => {
            const classes = Array.from(el.classList);
            if (classes.length === 0) return false;
            const style = getComputedStyle(el);
            if (classes.some((c) => c === "flex" || c === "grid" || c.startsWith("grid-cols"))) {
                if (style.display === "flex" || style.display === "grid") return true;
            }
            if (classes.some((c) => c.startsWith("bg-"))) {
                const bg = style.backgroundColor;
                if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return true;
            }
            if (classes.some((c) => c.startsWith("text-"))) {
                const color = style.color;
                if (color && color !== "rgb(0, 0, 0)") return true;
            }
            if (classes.some((c) => c.startsWith("p-") || c.startsWith("px-") || c.startsWith("py-"))) {
                return style.paddingTop !== "0px" || style.paddingLeft !== "0px";
            }
            return false;
        });
        if (styled) {
            await sleep(120);
            return;
        }
        await sleep(50);
    }
}

export async function mountPreview(userCode: string, projectCss = "") {
    injectBaseLayoutCss();
    injectTailwindTheme(projectCss);
    const wrapped = compileUserCode(userCode);
    // eslint-disable-next-line no-new-func
    const App = new Function("React", wrapped)(React) as React.ComponentType;
    const root = document.getElementById("root");
    if (!root) throw new Error("Missing #root");
    createRoot(root).render(React.createElement(App));
    await waitForTailwindPaint(root);
    try {
        if (document.fonts?.ready) await document.fonts.ready;
    } catch {
        // ignore
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await signalPreviewReady();
}

(window as Window & { ShapePreviewRuntime?: { mountPreview: typeof mountPreview } }).ShapePreviewRuntime = {
    mountPreview,
};

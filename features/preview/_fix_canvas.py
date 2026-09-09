from pathlib import Path

# 1) iframe attrs
exec(open(r"c:/Users/User/Desktop/shape-monorepo/shape/features/preview/ui/_patch_iframe.py", encoding="utf-8").read()) if Path(r"c:/Users/User/Desktop/shape-monorepo/shape/features/preview/ui/_patch_iframe.py").exists() else None

p = Path(r"c:/Users/User/Desktop/shape-monorepo/shape/features/preview/ui/design-studio.tsx")
t = p.read_text(encoding="utf-8")

# Ensure sandbox on iframe
needle = 'className="absolute inset-0 h-full w-full border-0 bg-white"\n                                onLoad={() => enableInspect()}'
repl = (
    'className="absolute inset-0 h-full w-full border-0 bg-white"\n'
    '                                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"\n'
    '                                referrerPolicy="no-referrer"\n'
    '                                onLoad={() => enableInspect()}'
)
if "sandbox=" not in t and needle in t:
    t = t.replace(needle, repl, 1)
    print("sandbox added")
elif "sandbox=" in t:
    print("sandbox present")
else:
    print("WARN: could not add sandbox")

# Wrapper height
old_wrap = 'className="relative min-h-0 w-full max-w-[1400px] flex-1 overflow-hidden rounded-xl border border-white/8 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]"'
new_wrap = 'className="relative h-full w-full max-w-[1400px] overflow-hidden rounded-xl border border-white/8 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]" style={{ width: "100%", height: "100%" }}'
if old_wrap in t:
    t = t.replace(old_wrap, new_wrap, 1)
    print("wrapper sized")

# Import showPreviewUrl
if "showPreviewUrl" not in t:
    anchor = 'from "@/features/preview/lib/discover-routes";'
    if anchor in t:
        t = t.replace(
            anchor,
            anchor + '\nimport { showPreviewUrl } from "@/features/preview/store";',
            1,
        )
        print("import added")
    else:
        print("WARN: discover-routes import missing")

# Ready effect: also showPreviewUrl
for fn in ("previewUrlForPage", "previewUrlForPage"):
    old = f"        setFrameSrc({fn}(preview.url, pagePath));\n    }}, [preview.phase, preview.url, pagePath, reloadKey]);"
    new = (
        f"        const src = {fn}(preview.url, pagePath);\n"
        f"        setFrameSrc(src);\n"
        f"        showPreviewUrl(src);\n"
        f"    }}, [preview.phase, preview.url, pagePath, reloadKey]);"
    )
    if old in t:
        t = t.replace(old, new, 1)
        print("ready effect wired with", fn)
        break
else:
    i = t.find("setFrameSrc(")
    print("WARN ready effect; nearby:", repr(t[i : i + 220]))

p.write_text(t, encoding="utf-8")

# store helper
store = Path(r"c:/Users/User/Desktop/shape-monorepo/shape/features/preview/store.ts")
st = store.read_text(encoding="utf-8")
if "export function showPreviewUrl" not in st:
    idx = st.find("export async function navigatePreview")
    if idx < 0:
        raise SystemExit("navigatePreview missing")
    helper = '''
/** Set iframe src directly when Rust already confirmed the server is up. */
export function showPreviewUrl(raw: string) {
    let url: string;
    try {
        url = normalizePreviewUrl(raw);
    } catch {
        return;
    }
    if (!isLocalPreviewUrl(url)) return;
    setLastDevUrl(url);
    commitNavigation(url, { replace: true, reload: true });
}

'''
    store.write_text(st[:idx] + helper + st[idx:], encoding="utf-8")
    print("showPreviewUrl exported")
else:
    print("showPreviewUrl ok")

print("done")

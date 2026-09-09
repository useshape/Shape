from pathlib import Path

p = Path(r"c:/Users/User/Desktop/shape-monorepo/shape/features/preview/ui/design-studio.tsx")
t = p.read_text(encoding="utf-8")

old = """                            <iframe
                                ref={iframeRef}
                                key={`${frameSrc}-${reloadKey}`}
                                title={`Design preview ${pagePath}`}
                                src={frameSrc ?? undefined}
                                className=\"absolute inset-0 h-full w-full border-0 bg-white\"
                                onLoad={() => enableInspect()}
                            />"""

new = """                            <iframe
                                ref={iframeRef}
                                key={`${frameSrc}-${reloadKey}`}
                                title={`Design preview ${pagePath}`}
                                src={frameSrc ?? undefined}
                                className=\"absolute inset-0 h-full w-full border-0 bg-white\"
                                sandbox=\"allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads\"
                                referrerPolicy=\"no-referrer\"
                                onLoad={() => enableInspect()}
                            />"""

if old not in t:
    # fuzzy: find iframe and inject sandbox after className line
    needle = 'className="absolute inset-0 h-full w-full border-0 bg-white"\n                                onLoad={() => enableInspect()}'
    repl = 'className="absolute inset-0 h-full w-full border-0 bg-white"\n                                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"\n                                referrerPolicy="no-referrer"\n                                onLoad={() => enableInspect()}'
    if needle not in t:
        raise SystemExit("iframe attrs not found")
    t = t.replace(needle, repl, 1)
    print("patched via fuzzy")
else:
    t = t.replace(old, new, 1)
    print("patched via exact")

# Parent wrapper: give explicit 100% height like browser-view
old_wrap = 'className="relative min-h-0 w-full max-w-[1400px] flex-1 overflow-hidden rounded-xl border border-white/8 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]"'
new_wrap = 'className="relative h-full w-full max-w-[1400px] overflow-hidden rounded-xl border border-white/8 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]" style={{ width: "100%", height: "100%" }}'
if old_wrap in t:
    t = t.replace(old_wrap, new_wrap, 1)
    print("wrapper sized")
else:
    print("wrapper pattern miss")

p.write_text(t, encoding="utf-8")

# Export showPreviewUrl (no re-probe) from store — Design Mode already knows Ready.
store = Path(r"c:/Users/User/Desktop/shape-monorepo/shape/features/preview/store.ts")
st = store.read_text(encoding="utf-8")
if "export function showPreviewUrl" not in st:
    insert_after = "export async function navigatePreview"
    idx = st.find(insert_after)
    if idx < 0:
        raise SystemExit("navigatePreview not found")
    # insert before navigatePreview
    helper = '''
/** Set iframe src directly — use when Rust already confirmed the server is up. */
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
    st = st[:idx] + helper + st[idx:]
    store.write_text(st, encoding="utf-8")
    print("showPreviewUrl added")
else:
    print("showPreviewUrl exists")

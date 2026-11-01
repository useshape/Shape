from pathlib import Path

root = Path(__file__).parent
browse = (root / "browse.rs").read_text(encoding="utf-8")
insert = (root / "_browse_insert.rs").read_text(encoding="utf-8")

start = browse.find("async fn wait_ready")
end = browse.find("fn page_error")
if start < 0 or end < 0 or start > end:
    raise SystemExit(f"block1 {start} {end}")
browse = browse[:start] + browse[end:]

start = browse.find("async fn wait_for_page")
end = browse.find("fn percent_to_px")
if start < 0 or end < 0 or start > end:
    raise SystemExit(f"block2 {start} {end}")
browse = browse[:start] + insert.rstrip() + "\n\n" + browse[end:]
(root / "browse.rs").write_text(browse, encoding="utf-8", newline="\n")
print("ok", browse.count("async fn wait_for_page"), browse.count("async fn drive("))

from pathlib import Path

p = Path(__file__).with_name("browse.rs")
text = p.read_text(encoding="utf-8")
start = text.find('\n    if action == "stop" {')
end = text.find("pub(crate) const SNAPSHOT_JS")
if start < 0 or end < 0 or start > end:
    raise SystemExit(f"markers missing {start} {end}")
text = text[: start + 1] + text[end:]
p.write_text(text, encoding="utf-8", newline="\n")
print(len(text.splitlines()))

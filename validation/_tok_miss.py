"""Show chunks that are not one token. Diagnostic only."""
import regex
import tiktoken
from pathlib import Path
from tiktoken_ext.openai_public import o200k_base

enc = tiktoken.get_encoding("o200k_base")
pat = regex.compile(o200k_base()["pat_str"])

root = Path("validation/prompts")
names = [
    "33-lru.txt",
    "07-gitignore.txt",
    "35-merge-intervals.txt",
    "29-timezone.txt",
    "45-hn-lite.txt",
    "56-log-redact.txt",
    "12-regex.txt",
    "09-csv-sum.txt",
]
texts = [(name, (root / name).read_text(encoding="utf-8")) for name in names]
texts.append((
    "de",
    "Die Schaltfläche soll auf derselben Zeile bleiben, auch wenn die Seitenleiste geschlossen ist und der Text daneben nicht springen darf.",
))
texts.append((
    "fr",
    "Le bouton doit rester sur la même ligne que les feux de la fenêtre, même quand la barre latérale est fermée.",
))
texts.append((
    "snippet",
    "The handler in features/chat/ui/composer/input.tsx reads the draft on every keystroke and calls estimateSendCredits.",
))
texts.append((
    "url",
    "The docs at https://example.com/docs/chat/send?lang=en#credits still say the estimate includes the whole tool loop.",
))
for prefix in [",", ";", ":", "!", "#", "?", "&", "@", ".", "/", "_", "-", "(", "["]:
    for word in ["a", "id", "name", "amount", "lang", "credits", "users", "profile", "composer"]:
        texts.append((f"p {prefix}{word}", prefix + word))

for name, text in texts:
    chunks = pat.findall(text)
    multi = []
    for c in chunks:
        n = len(enc.encode(c))
        if n != 1:
            multi.append((n, c, [enc.decode([i]) for i in enc.encode(c)]))
    print(f"\n== {name} chunks {len(chunks)} tokens {len(enc.encode(text))} extra {sum(n-1 for n,_,_ in multi)}")
    for n, c, pieces in multi:
        print(f"  x{n} {c!r} {pieces}")

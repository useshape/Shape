"""See how often one o200k regex chunk is one token."""
import regex
import tiktoken
from tiktoken_ext.openai_public import o200k_base

enc = tiktoken.get_encoding("o200k_base")
pat = regex.compile(o200k_base()["pat_str"])

samples = [
    "The send button stays on the arrow while the draft is still in the box. After forty words it should shimmer.",
    "i dont need the timeline or the reviewers. just one line at the top, and the description can fade out.",
    "SELECT id, email FROM users WHERE deleted_at IS NULL AND created_at > '2024-01-01' ORDER BY created_at DESC LIMIT 50;",
    ".panel { margin: 8px 12px; border-radius: 16px; background: #141416; }",
    "Open C:\\Users\\User\\Desktop\\shape-monorepo\\shape\\features\\chat\\ui\\composer\\input.tsx and leave the file tree out.",
    "https://example.com/users/profile?x=1&y=2",
    "const value = items[i];\nif (x == null) return;\n\nfunction getUserById(userId) {\n  return db.query(userId);\n}",
    "XMLHttpRequest HTTPRequest parseJSON iOSApp macOS APP_NAME created_at",
    "don't can't it's that's there's they're I'm I'd I'll user's file's let's",
    "Le bouton doit rester aligné avec les feux, et la description peut s'estomper.",
    "Die Schaltfläche soll auf derselben Zeile bleiben, auch wenn die Seitenleiste zu ist.",
    "Привет, как дела? Мне нужно исправить отступ у боковой панели.",
    "请把按钮放在同一行，不要突然换行。",
    "ボタンを同じ行に置いてください。",
    "Looks good 👍 but the gap is still uneven. 🎉",
    "supercalifragilisticexpialidocious_repository_configuration_override",
    "Write schema.sql with users(id, email unique, created_at) and posts(id, user_id fk, title, body).",
    "First line.\n\nSecond line after a blank line.\nThird.",
    "    return 0;\n\n    return 1;",
    "See fig. 2 for details. Wait...\n\nNext paragraph is longer and talks about authentication and configuration placeholders.",
    "version 10.2.0-beta.1 costs $20.00 (about 3,000 rows) at a@b.co",
    "```js\nconst x = 1;\n```",
    "Ship",
    "👍",
    "a\n\n\nb",
    "foo(); fn(a, b) items[index] call(name) call(abc)",
]

print("chunks vs tokens, and chunks that are not 1 token")
for text in samples:
    chunks = pat.findall(text)
    ids = enc.encode(text)
    joined = "".join(chunks)
    ok = "OK" if joined == text else "MISMATCH"
    multi = [(c, len(enc.encode(c))) for c in chunks if len(enc.encode(c)) != 1]
    print(f"\n{ok} chunks {len(chunks):3} tokens {len(ids):3}  {text[:70]!r}")
    for c, n in multi:
        print(f"    x{n} {c!r} { [enc.decode([i]) for i in enc.encode(c)] }")

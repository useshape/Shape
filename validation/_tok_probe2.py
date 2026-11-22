"""More structural dumps. Not used as a score target."""
import tiktoken

enc = tiktoken.get_encoding("o200k_base")

def show(text):
    ids = enc.encode(text)
    pieces = [enc.decode([i]) for i in ids]
    print(f"{len(ids):3}  {text!r}")
    print(f"     {pieces}")

print("--- newlines ---")
for n in range(1, 7):
    show("a" + ("\n" * n) + "b")
    show("a." + ("\n" * n) + "b")

print("--- spaces before word ---")
for n in range(1, 9):
    show((" " * n) + "word")
    show("a" + (" " * n) + "b")

print("--- tabs ---")
for n in range(1, 4):
    show(("\t" * n) + "word")

print("--- punct plus newline ---")
for p in ["{", "}", "[", "]", "(", ")", ",", ";", ":", ".", "!", "?", "#", "-", "*", ">", "/", "\\", "'", '"', "`"]:
    show(p + "\n")
    show(p + "\n\n")

print("--- paren glue ---")
for w in ["a", "b", "ab", "abc", "id", "x", "foo", "1", "20"]:
    show("(" + w)
    show("(" + w + ")")

print("--- slash glue ---")
for w in ["a", "b", "ab", "api", "users", "v1", "Desktop", "User", "src", "lib"]:
    show("/" + w)
    show("\\" + w)

print("--- contractions ---")
for w in ["I'm", "don't", "can't", "it's", "that's", "there's", "they're", "we're", "you're", "isn't", "won't", "I'd", "I've", "I'll", "user's", "file's", "it's", "let's", "what's", "who's", "o'clock", "rock'n'roll"]:
    show(w)

print("--- emoji ---")
for w in ["👍", "🎉", "🚀", "😀", "✅", "❤️", "😂", "🔥", "👍👍", "ok 👍", "👍 ok"]:
    show(w)

print("--- cjk sentence ---")
show("请把按钮放在同一行，不要突然换行。")
show("ボタンを同じ行に置いてください。")
show("버튼은 같은 줄에 두세요.")

print("--- russian german french ---")
show("Привет, как дела? Мне нужно исправить отступ у боковой панели.")
show("Die Schaltfläche soll auf derselben Zeile bleiben, auch wenn die Seitenleiste zu ist.")
show("Le bouton doit rester aligné avec les feux, et la description peut s'estomper.")

print("--- camel and ids ---")
for w in ["XMLHttpRequest", "HTTPRequest", "getUserById", "iOSApp", "parseJSON", "SHA256", "ALongCamelCaseIdentifier", "simple", "placeholders", "internationalization", "authentication", "configuration", "antidisestablishmentarianism", "supercalifragilistic"]:
    show(w)

print("--- code bits ---")
show("foo();")
show("fn(a, b)")
show("fn(id, name)")
show("schema.sql")
show("users(id, email unique, created_at)")
show("created_at")
show("user_id")
show(".sql")
show("file.tsx")
show("index.tsx")
show("a@b.co")
show("https://example.com/users/profile")
show("const value = items[i];")
show("if (x == null) return;")
show("    return 0;")

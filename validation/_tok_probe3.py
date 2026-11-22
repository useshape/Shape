"""Check the rules that are still ambiguous. Not a score target."""
import tiktoken

enc = tiktoken.get_encoding("o200k_base")

def pieces(text):
    ids = enc.encode(text)
    return [enc.decode([i]) for i in ids]

def show(text):
    p = pieces(text)
    print(f"{len(p):3}  {text!r}  {p}")

print("--- punct cluster plus newline ---")
for s in [");\n", "...\n", "*/\n", "===\n", "->\n", "();\n", "\"\n", ".\n\n\n", ")\n\n\n"]:
    show(s)

print("--- space before dot digit punct ---")
for s in ["foo .bar", "foo . bar", "fig. 2", "end.", "end. ", "  1", "a  1", "a   12", "hello  ", "hello   ", "x .5", "wait ...", "see (below)", "call(foo)", "call(abc)", "call(name)", "items[i]", "items[index]", "items[0]", "a/b", "a/ab", "a/api", "path/to/file", "C:\\Users\\User\\Desktop"]:
    show(s)

print("--- slash letters ---")
for w in ["a", "b", "ab", "id", "to", "of", "in", "js", "ts", "go", "my", "ok", "me", "an", "api", "src", "lib", "users", "profile", "component", "v1", "v2", "x1", "2d"]:
    show("/" + w)

print("--- paren words ---")
common = ["a", "b", "x", "i", "e", "s", "n", "id", "fn", "cb", "ok", "ab", "foo", "bar", "baz", "err", "ctx", "req", "res", "msg", "str", "num", "obj", "val", "key", "idx", "len", "name", "user", "item", "data", "type", "path", "file", "self", "this", "args", "opts", "body", "text", "node", "list", "map", "set", "buf"]
rare = ["abc", "xyz", "qq", "zz", "blob", "quux", "wibble", "narp", "zote", "plugh", "abcde", "fnord"]
for w in common + rare:
    p = pieces("(" + w)
    flag = "GLUE" if p[0].startswith("(") and len(p) == 1 else "SPLIT"
    print(f"  {flag} ({w} -> {p}")

print("--- bracket ---")
for w in ["i", "0", "id", "key", "index", "name", "a", "foo"]:
    show("[" + w)
    show("[" + w + "]")

print("--- word lengths ---")
words = """
a I to of in on at be is it we he or an do if so no my me up by as
the and for you are not but can all had her was one our out day get has him his how its let may new now old see two way who did
that this with have from they been said each which their time will about would there could other after first
people because something anything another without between through should before around thought
authentication configuration internationalization placeholders implementation responsibility
characteristics misunderstanding telecommunications extraordinarily
supercalifragilistic antidisestablishmentarianism
hello world please button sidebar composer message estimate token credit
""".split()
for w in words:
    p = pieces(w)
    if len(p) != 1:
        print(f"  SPLIT {len(w):2} {w} {p}")
print(f"words {len(words)} split {sum(1 for w in words if len(pieces(w)) != 1)}")

print("--- random strings ---")
import random
random.seed(1)
alphabet = "abcdefghijklmnopqrstuvwxyz"
for n in [8, 12, 16, 20, 24, 28, 32, 40]:
    errs = []
    for _ in range(8):
        s = "".join(random.choice(alphabet) for _ in range(n))
        p = pieces(s)
        errs.append(len(p))
    print(f"  len {n} token counts {errs} avg {sum(errs)/len(errs):.1f}")

"""Scratch comparison. Not the app estimator."""
import tiktoken

enc = tiktoken.get_encoding("o200k_base")

def is_cjk(c: str) -> bool:
    o = ord(c)
    return (
        0x3040 <= o <= 0x30FF
        or 0x3400 <= o <= 0x9FFF
        or 0xAC00 <= o <= 0xD7AF
        or 0xF900 <= o <= 0xFAFF
    )


def is_word(c: str) -> bool:
    return c.isalpha() and not is_cjk(c)


def estimate(text: str) -> int:
    if not text:
        return 0
    i = 0
    n = 0
    L = len(text)

    def space_run():
        nonlocal i
        j = i
        while j < L and text[j].isspace():
            j += 1
        return j

    while i < L:
        if text[i] in "\n\r":
            n += 1
            i += 1
            if i < L and text[i - 1] == "\r" and text[i] == "\n":
                i += 1
            continue
        if text[i].isspace():
            j = space_run()
            if j - i >= 2:
                n += 1
                i = j
                continue
            i = j
            if i >= L:
                n += 1
                break
            # A space before a number or a dot is its own token. A space before a word is part of that word.
            if text[i].isdigit() or text[i] == ".":
                n += 1
        c = text[i]
        nxt = text[i + 1] if i + 1 < L else ""
        if is_cjk(c):
            i += 1
            n += 1
            continue
        if is_word(c) or c == "_" or (c in ".-" and nxt and is_word(nxt)):
            if c in "._-" and not is_word(c):
                i += 1
            start = i
            if i < L and is_word(text[i]):
                i += 1
                while i < L and is_word(text[i]) and not (text[i].isupper() and text[i - 1].islower()):
                    i += 1
            piece = i - start
            extra = 0 if piece <= 16 else (piece - 16) // 6
            n += 1 + extra
            continue
        if c.isdigit():
            i += 1
            taken = 1
            while i < L and text[i].isdigit() and taken < 3:
                i += 1
                taken += 1
            n += 1
            continue
        i += 1
        merged = 1
        while i < L and not text[i].isalnum() and not text[i].isspace() and merged < 3:
            i += 1
            merged += 1
        n += 1
    return max(1, n)


samples = {
    "prose": "The sidebar should ease closed instead of snapping. When it is shut, the button and the breadcrumb stay on the same line as the window controls.",
    "ask": "Why does the composer clear the draft before the tighten pass finishes, and can the original wording stay on screen?",
    "code": "const total = items.reduce((sum, item) => sum + item.price, 0);",
    "json": '{"name":"shape","version":"1.0.3","private":true}',
    "ident": "APP_NAME DATABASE_URL user_id helloWorld .env.example",
    "short": "Fix the button.",
    "tiny": "Hello",
    "long": (
        "I want the right panel to stop covering the chat when I drag it past a comfortable width. "
        "It should resist for a bit, then spring over the transcript instead of pushing the messages back to the center. "
        "The drag handle only needs to show up when the pointer is close, and it should feel heavier while it is moving. "
        "Please leave the file tree out of the code view."
    ),
    "list": "1. Open settings\n2. Turn on tighten\n3. Send a paragraph\n4. Check the send button",
    "cjk": "把侧边栏关掉的时候不要突然消失，按钮和面包屑留在同一行。",
    "mix": "Rename SidebarToggle in chrome.tsx, then check the 320px close animation.",
    "para": "When the folder is empty, show a short note and a button that opens the picker. Do not mention the path. If they already have a folder, skip the note.",
    "px": "Pad the closed sidebar by 78px and keep the breadcrumb at 16px.",
    "user": (
        "ok so the terminal one line still snaps. when I drag it down and let go it should ease into a single row, "
        "tab name on the left and the latest output on the right. do not pop the height. "
        "also the code view should not show the file tree beside the editor."
    ),
    "small": "Ship it.",
    "med": "Can you check why the avatar still prefers the GitHub image after I set a photo in Clerk?",
}
for s in (
    "authentication",
    "configuration",
    "placeholders",
    "internationalization",
    "supercalifragilisticexpialidocious",
    "supercalifragilisticexpialidocious_repository_configuration_override",
    "First line.\n\nSecond line after a blank line.\nThird.",
):
    print(len(enc.encode(s)), [enc.decode([t]) for t in enc.encode(s)])
for name, text in samples.items():
    actual = len(enc.encode(text))
    est = estimate(text)
    err = abs(est - actual) / actual
    print(f"{name:6} est {est:4} actual {actual:4} {err*100:5.1f}%")

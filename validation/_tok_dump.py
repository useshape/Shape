import json
import tiktoken

enc = tiktoken.get_encoding("o200k_base")
samples = [
    "Create .env.example with APP_NAME, PORT, and DATABASE_URL placeholders. No real secrets.",
    "Create hello.ps1 that writes Hello from PowerShell to the console.",
    "Fix the off-by-one in the pager and run the tests.",
    "Please rewrite the billing page so failed invoices retry without charging twice, and keep the existing layout.",
    "const total = items.reduce((sum, item) => sum + item.price, 0);",
    '{"name":"shape","version":"1.0.3","private":true}',
    "The sidebar should ease closed instead of snapping. When it is shut, the button and the breadcrumb stay on the same line as the window controls.",
    "a",
    "Hello",
    "APP_NAME",
    "DATABASE_URL",
    ".env.example",
    "user_id",
    "helloWorld",
    "   indented",
]
for s in samples:
    toks = enc.encode(s)
    pieces = [enc.decode([t]) for t in toks]
    print(len(toks), json.dumps(pieces, ensure_ascii=False))

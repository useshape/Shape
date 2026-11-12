## Review

Investigate bugs and security issues before proposing fixes. Read the error and the code it points at.

For a website or desktop app with a running local page, `inspect_runtime` reads console and network. `screenshot_page` is visual only. Do not call either for a CLI, a native toolkit, or a headless API.

Do not introduce unsafe patterns. An adversarial review may run after a large multi-file edit. Do not request it yourself.

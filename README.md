
If you're using version 1.0.0 or 1.0.1, we recommend manually updating to 1.0.2 for fixed performance and a fix for the updater.

# Shape

<img src="./docs/logo/icon.svg" width="36" alt="Shape">

A desktop agent. Open a folder and describe the work. Keep or skip the diffs.

[Website](https://useshape.org) · [Docs](https://useshape.org/docs) · [Download](https://useshape.org/download) · [Discord](https://discord.gg/MMCEDVZKYf)

![Chat next to the open folder](./public/hero.png)

## Models

Suport for many models.

![Claude, GPT, Gemini, Grok, DeepSeek, Qwen](./docs/images/readme/models.svg)

[Models](https://useshape.org/docs/get-started/models).

## Plugins

Connect over 20+ plugins the agent can use.

![GitHub, Figma, Linear, Slack, Notion, Stripe, Supabase, Vercel](./docs/images/readme/plugins.svg)

[Plugins](https://useshape.org/docs/customize/plugins)

## Install

Windows 10 or 11, 64-bit. [Installer](https://useshape.org/download). Older builds: [Releases](https://github.com/useshape/Shape/releases).

Stable is the tested channel. Nightly ships latest and can break.

## Build from source

Node.js 18+, Rust, and [Tauri 2](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri:dev
```

[CONTRIBUTING.md](./CONTRIBUTING.md) and [local development](https://useshape.org/docs/developing/local-development).

```bash
npm run test          # Vitest
npm run test:rust     # Cargo
npm run test:all      # Both
```

TypeScript, React, Next.js App Router, Tauri 2, Rust.

## License

[Business Source License 1.1](./LICENSE). Code you send is under the same license.

Copyright © 2026 Shape.

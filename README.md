If you're using version 1.0.0, we recommend manually updating to 1.0.1 for fixed performance and a fix for the updater.

![Shape](./public/readme.png)

<h2>The desktop agent for anything</h2>

<p>
  <img src="https://api.iconify.design/lucide:globe.svg?color=%233B82F6" width="16">
  <a href="https://useshape.org">Website</a>
  ·
  <img src="https://api.iconify.design/lucide:book-open.svg?color=%233B82F6" width="16">
  <a href="https://useshape.org/docs/introduction/quick-start">Documentation</a>
  ·
  <img src="https://api.iconify.design/lucide:download.svg?color=%233B82F6" width="16">
  <a href="https://useshape.org/download">Download</a>
  ·
  <img src="https://api.iconify.design/simple-icons:discord.svg?color=%233B82F6" width="16">
  <a href="https://discord.gg/MMCEDVZKYf">Discord</a>
</p>

</div>

Shape brings your workspace, terminal, commits, and agents together in one desktop app. With agents that can work directly in your project, understanding your code, making changes, running commands, testing and spawning subagents.



# Installation

### Download

The easiest way to get started is the [Installer](https://useshape.org/download).

For specific versions and previous releases, see:
[Releases](https://github.com/useshape/Shape/releases)

Stable and Nightly are the available update channels. Stable provides tested releases, while Nightly includes the latest changes and may contain breaking changes.

---

### Build from source 

Install Node.js 18+, Rust, and [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/), then:

```bash
cd shape
npm install
npm run tauri:dev
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) and the [local development guide](https://useshape.org/docs/developing/local-development).

# In the box

Shape brings your coding environment into one workspace and gives the agent access to the tools it needs to work on your project.

* **Agent**: Work with your code, files, terminal, Git, and more through chat.
* **Workbench**: Editor, files, Git, terminal, and other tools in one workspace.

And more coming soon!

For more, see the [user docs](https://useshape.org/docs/introduction/quick-start) or [developer reference](https://useshape.org/docs/developing/overview).

# Stack

* <img src="https://cdn.simpleicons.org/typescript/3178C6" width="16" height="16" /> [TypeScript](https://www.typescriptlang.org/)
* <img src="https://cdn.simpleicons.org/react/61DAFB" width="16" height="16" /> [React](https://react.dev/)
* <img src="https://cdn.simpleicons.org/nextdotjs/000000" width="16" height="16" /> [Next.js](https://nextjs.org/) (App Router)
* <img src="https://cdn.simpleicons.org/tauri/FFC131" width="16" height="16" /> [Tauri 2](https://v2.tauri.app/) + <img src="https://cdn.simpleicons.org/rust/DEA584" width="16" height="16" /> [Rust](https://www.rust-lang.org/)



# Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Code you submit is licensed under [BUSL-1.1](./LICENSE).

```bash
npm run test          # Vitest
npm run test:rust     # Cargo
npm run test:all      # Both
```



# License

Shape is licensed under the [Business Source License 1.1](./LICENSE) (BUSL-1.1).

Copyright © 2026 Shape.

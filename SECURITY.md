# Security Policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch. Older releases
may not receive backports unless noted in release notes.

| Version | Supported |
| ------- | --------- |
| Latest on `main` | Yes |
| Previous tagged releases | Best effort |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report security issues privately using one of the following:

1. **GitHub Security Advisories (preferred)**  
   [Open a private advisory](https://github.com/useshape/Shape/security/advisories/new) on this repository.

2. **Email**  
   Send details to [hello@useshape.org](mailto:hello@useshape.org) with the subject line `Shape Security Report`.

Include as much detail as possible:

- Description of the issue and potential impact
- Steps to reproduce, or proof-of-concept if available
- Affected version or commit
- Your environment (OS, Shape build type) if relevant

## What to expect

- **Acknowledgment** within 72 hours
- **Initial assessment** within 7 days
- **Fix or mitigation plan** shared when confirmed, before public disclosure when possible

We may ask for additional information to reproduce or validate the report.

## Scope

In scope:

- Shape desktop application (Tauri) and bundled web UI
- Rust backend commands, agent tooling, and IPC boundaries
- Supply-chain or dependency issues that affect Shape installs built from this repo

Out of scope:

- Vulnerabilities in third-party services you connect to (API keys, MCP servers, model providers)
- Issues requiring physical access to an unlocked machine
- Social engineering or phishing against users
- General hardening suggestions without a demonstrable vulnerability

## Safe harbor

We support good-faith security research. Do not access data that is not yours, disrupt
services, or violate applicable law. Follow responsible disclosure.

## Recognition

We are grateful to researchers who report issues responsibly. With your permission,
we may credit you in release notes or security advisories after a fix is published.

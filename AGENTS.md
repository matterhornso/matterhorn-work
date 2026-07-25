# AGENTS.md

Matterhorn Desks is a Web3-native agentic workspace — Cowork for Web3.

## What Matterhorn Desks Is

Matterhorn Desks is a practical control surface for agentic work, with crypto-native capabilities:

* Run local and remote agent workflows from one place.
* Use the Matterhorn Desks engine and approved tools directly.
* Compose desktop app, server, and messaging connectors without lock-in.
* Treat the Matterhorn Desks app as a client of the server API surface.
* Connect to hosted workers through a simple user flow: `Add a worker` → `Connect remote`.
* Every session carries wallet + chain context for on-chain actions.

## Core Philosophy

* **Local-first, cloud-ready**: Matterhorn Desks runs on your machine in one click and can connect to cloud workflows when needed.
* **Server-consumption first**: the app should consume server surfaces (self-hosted or hosted), not invent parallel behavior.
* **Composable**: use the desktop app, messaging connectors, or server mode based on the task.
* **Ejectable**: workflows stay portable, inspectable, and available through the engine even before a dedicated UI exists.
* **Crypto-native**: wallet is a first-class citizen, not a plugin. Agents propose on-chain actions; user approves in-workspace.


## Pull Request Expectations (Fast Merge)

If you open a PR, you must run tests and report what you ran (commands + result).

To maximize merge speed, include evidence of the end-to-end flow:

* Ideally: attach a short video/screen recording showing the flow running successfully.
* Otherwise: screenshots are acceptable, but video is preferred.

If you cannot run tests or capture the video, say so explicitly and explain why, and include the exact commands/steps for the reviewer to reproduce.

## Coding Guidelines

### TypeScript

- Never use `any`, typecasts, or `as`, unless 100% necessary or specifically instructed.

### Package Managers

- Use pnpm.
- Never use npm or yarn.

### UI and UX

- Use components from @/components when possible.
- When creating new components, we prefer using shadcn/ui with (Base UI).
- Assume most end users of Matterhorn Desks are non-technical.
- Use Matterhorn brand colors: background `#0a0a0f`, accent violet-500 (`#7c3aed`).

### Tech Stack Preferences

When uncertain, prefer: Tailwind, TypeScript, React, shadcn/ui (Base UI), TanStack Query, Zustand, Zod, Drizzle, Better-Auth, wagmi, viem.

### Code Style

- Always strive for concise, simple solutions.
- If a problem can be solved in a simpler way, propose it.
- Use the smallest possible diff to make a change. Then think of how to make it smaller and do that again.
- Avoid fallback expressions when types or control flow already guarantee a value.

### Workflow

- If asked to do too much work at once, stop and state that clearly.

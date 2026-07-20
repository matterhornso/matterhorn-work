# Matterhorn Desks Engine Naming

Matterhorn Desks presents its local agent runtime as the **Matterhorn Desks engine** in user-facing copy.

OpenCode remains the underlying runtime and should still be named when the surface is technical, diagnostic, or compatibility-sensitive.

## Use Matterhorn Desks Engine

Use **Matterhorn Desks engine** in:

- app settings labels and recovery actions
- startup errors and permission prompts
- feedback/support metadata shown to operators
- CLI help and status text meant for users
- product docs that describe what users interact with

## Keep OpenCode

Keep **OpenCode** or `opencode` in:

- package imports from `@opencode-ai/*`
- filesystem paths such as `.opencode/`
- config files such as `opencode.json` and `opencode.jsonc`
- protocol and API routes such as `/opencode/*`
- env vars and flags such as `OPENWORK_OPENCODE_*` or `--opencode-bin`
- implementation names, SDK client variables, and compatibility docs
- diagnostics that explicitly identify the underlying runtime

The goal is product clarity without hiding the runtime contract developers need for debugging and compatibility.

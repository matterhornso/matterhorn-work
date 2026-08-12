# Hosted MCP and tools polish

## Outcome

PASS for the exact local Public Beta build based on `5e8f2e04ad8dfc5f3ad264d10e965108364f4949` plus this branch.

Hosted workspaces now expose a read-only managed-tools inventory. Marketplace, custom MCP, OAuth, command-copy, engine-plugin, and local configuration controls are absent. Desktop and local deployments retain the existing MCP management surface.

## Browser verification

- Viewports: 320×568 and 1440×1000.
- Document width equals viewport width at both sizes.
- Visible heading order: one `h1`, followed by `h2` sections and `h3` items.
- Zero unnamed visible buttons.
- Zero clipped elements in the Settings main region.
- Session rail uses `Tools`, explains that no MCP setup is required, and links to `View managed tools`.
- Full Settings uses `Tools`, removes Marketplace, Add Custom MCP, Manage MCPs, and Engine plugins.

Evidence:

- `desktop-tools-final.png`
- `mobile-tools-fixed.png`
- `desktop-tools-rail-final.png`

## Automated verification

- App tests: 894 passed, 0 failed.
- Hosted MCP focused tests: 12 passed, 0 failed.
- Responsive, accessibility, and shared UI contracts: 64 passed, 0 failed.
- App typecheck: passed.
- Public Beta production build: passed.
- Task-first bundle budget: passed.
- Matterhorn design-system gate: passed.
- MCP catalog contract: passed.
- Public Beta web readiness contract: passed.
- Desk-agent contract and workspace agent regeneration tests: passed.

## Remaining external gate

Provider privacy configuration remains intentionally fail-closed pending endpoint-specific retention and training-use confirmation. This audit does not certify live prompt execution.

# Matterhorn Work Full UI/UX And E2E QA - 2026-06-24

## Scope

- Repo: `matterhornso/matterhorn-work`
- Base SHA tested before fixes: `f5c167ab548b7fe925fe2442617df44178fc6304`
- Branch: `codex/e2e-ui-auth-trigger-fix-20260624`
- Local web stack:
  - First pass: `http://127.0.0.1:63272`
  - Final rebuilt pass: `http://127.0.0.1:64870`
- Final server after rebuild: `http://127.0.0.1:64869`
- Screenshot folder: `qa-reports/ui-sweep-2026-06-24/`

## Screenshots Captured

| File | Screen |
| --- | --- |
| `qa-reports/ui-sweep-2026-06-24/01-home-desktop.png` | Customer launch hub, desktop |
| `qa-reports/ui-sweep-2026-06-24/02-bittensor-desktop.png` | Bittensor desk, desktop |
| `qa-reports/ui-sweep-2026-06-24/03-hyperliquid-desktop.png` | Hyperliquid desk, desktop |
| `qa-reports/ui-sweep-2026-06-24/04-polymarket-desktop.png` | Polymarket desk, desktop |
| `qa-reports/ui-sweep-2026-06-24/05-wellness-desktop.png` | Wellness desk, desktop |
| `qa-reports/ui-sweep-2026-06-24/06-memory-panel-desktop.png` | Memory panel, desktop |
| `qa-reports/ui-sweep-2026-06-24/07-tools-extensions-desktop.png` | Extensions/tools panel, desktop |
| `qa-reports/ui-sweep-2026-06-24/08-home-tablet.png` | Customer launch hub, tablet |
| `qa-reports/ui-sweep-2026-06-24/09-home-mobile.png` | Customer launch hub, mobile |

Supporting evidence:

- `qa-reports/ui-sweep-2026-06-24/console-events.json`
- `qa-reports/ui-sweep-2026-06-24/network-failures.json`

## Backend And Contract Verification

Passed:

```bash
bun test apps/server/src/skills.test.ts
pnpm --filter matterhorn-work-server typecheck
pnpm --filter @matterhorn-work/app typecheck
pnpm test:market-execution-safety-gate
pnpm test:customer-ready-crypto-smoke
pnpm test:crypto-panel-ux
pnpm test:matterhorn-customer-onboarding-ui
pnpm test:customer-readiness-ui
```

Earlier same-session sweep also passed the broader Bittensor, Hyperliquid,
Polymarket, memory, workflow, MCP, CLI, and desktop packaging gates. No live
market submit/sign route was found or added.

## Bugs Found And Fixed

### Fixed: Auth dropdown nested button hydration error

The browser console showed a React hydration error caused by a `button` rendered
inside another `button` in `BetaAuthMenu`. The dropdown trigger now uses the
project's `render={<Button />}` pattern instead of wrapping a `Button` child.

Verified with:

```bash
pnpm test:beta-auth
pnpm --filter @matterhorn-work/app typecheck
```

### Fixed: `/workspace/:id/skills?includeGlobal=true` 500

The final browser sweep found a real backend robustness issue: a malformed
global `SKILL.md` frontmatter file could throw a YAML parser error and make the
skills list endpoint return 500. `listSkills` now skips malformed skill files
instead of failing the whole endpoint.

Regression added:

```bash
bun test apps/server/src/skills.test.ts
```

Final rebuilt browser trace confirms the 500 is gone.

## Remaining Browser Warnings

Final rebuilt network trace still shows these two non-customer-blocking states:

- `GET /env/keys` -> `401`: expected in web-only dev mode because this is a
  host-token-only endpoint normally called by the desktop shell.
- `GET .opencode/agents/opencode-router.md` -> `404`: expected optional state
  when the router agent file has not yet been created.

The screenshot sweep also records WebGL performance warnings from repeated
headless screenshot capture. These are capture-environment warnings, not app
logic failures.

## UI/UX Findings

### Customer-ready foundations

- Bittensor, Hyperliquid, Polymarket, Wellness, Memory, and Extensions are now
  discoverable from the launch hub and right rail.
- Market desks preserve preview-only language: `Can submit: No`, `Live
  submission: Off`, and external-signer/client copy are visible.
- Bittensor remains framed as beta-ready with SS58/coldkey/hotkey-style public
  wallet language and external-signer boundaries.
- Wellness is separated from Web3 protocol desks and stays educational/non-
  medical with no live payments/email/hosting/access claims.

### Product polish gaps

- When a protocol rail is open, the launch hub and composer can feel squeezed;
  some cards become tall and narrow instead of reflowing into a more deliberate
  two-pane state.
- The Bittensor degraded-provider message is technically accurate but not yet
  customer-friendly enough; it should explain whether reads are unavailable,
  falling back, or waiting for configuration.
- Tablet/mobile launch screens exist, but the product needs a purpose-built
  mobile IA: protocol desks should become full-screen sheets instead of trying
  to preserve desktop split panes.
- Memory and Extensions are present, but they need stronger customer hierarchy:
  "what this remembers", "what I can forget", "which MCPs are available", and
  "use outside Matterhorn" should be clearer.

## Path To UI Product Polish

1. **Responsive shell hardening**
   - Desktop: keep a stable left workspace rail, center chat/workflow area, and
     right protocol panel with fixed min/max widths.
   - Tablet: collapse protocol rail into a drawer with clear back/close.
   - Mobile: use a bottom nav plus full-screen desk sheets; do not show split
     panes.
   - Add overflow tests for launch cards, prompt composer, protocol cards, and
     bottom status bar.

2. **Dedicated desk design pass**
   - Bittensor: Overview, Wallet, Subnets, Validators, Actions, Watches,
     Receipts.
   - Hyperliquid: Overview, Account, Orderbook, Positions, Preview, Watches,
     Receipts.
   - Polymarket: Overview, Markets, Outcomes, Compliance, Preview, Watches,
     Receipts.
   - Wellness: Templates, Client intake, Offer builder, Weekly plan, Check-in,
     Export.

3. **Degraded-state copy and recovery**
   - Replace raw provider failures with a compact status card: source,
     freshness, what still works, and what the user can do next.
   - Add "fixture/demo mode" and "configure live provider" affordances where
     applicable.

4. **Memory and MCP product surfaces**
   - Memory should expose a suggestion inbox, accepted memories, sensitivity,
     why remembered, source, and forget/export actions.
   - MCP surface should clearly show Matterhorn-created MCPs for Bittensor,
     Hyperliquid, Polymarket, Memory, Workflows, and Browser/Files, plus copy-
     paste setup for Claude Code, Codex, Claude Desktop, Cursor, and other MCP
     clients.

5. **Visual system**
   - Keep Matterhorn colors for brand anchors, not every surface.
   - Add desk-specific accent colors, stronger hierarchy, larger primary text,
     light/dark parity, and consistent status tokens for beta/preview/blocked/
     ready/error states.

## Customer Beta Readiness Conclusion

After the fixes in this PR, the backend and safety gates tested here are green.
The remaining issues are product polish and environment-specific dev warnings,
not backend correctness blockers. The platform is appropriate for controlled
beta testing if the beta is positioned as:

- Bittensor beta-ready with public reads, previews, watches, receipts, and
  external signing only.
- Hyperliquid and Polymarket preview/read-only with external-signer handoff
  language and no live submission.
- Wellness workflow demo-ready, educational only, no live payments/email/
  hosting/access, and no medical advice.


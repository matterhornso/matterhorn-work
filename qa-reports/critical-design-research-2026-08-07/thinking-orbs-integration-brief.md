# Thinking orbs integration brief

Date: 2026-08-07
Reference: https://orbs.jakubantalik.com/
Source: https://github.com/Jakubantalik/thinking-orbs
Package baseline inspected: `thinking-orbs@0.2.0`
License: MIT, copyright Jakub Antalik (2026)

## Decision

Use Thinking Orbs as Matterhorn's agent-activity visual language, scoped to real agent work states. Carry forward the animated dotted orb and its verb-specific motion. Do not carry forward the demo site's pill containers, card grid, page composition, typography, or monochrome product identity.

The orb supplements precise status text; it never replaces status text, progress, evidence, error recovery, or completion feedback.

## Placement

### Inline status — 20px

Use beside compact status text in:

- assistant waiting/responding rows
- session activity status
- tool/MCP connection status when an agent turn owns the action
- compact mobile status presentation

The 20px orb has no surrounding badge, glow, or decorative background.

### Empty assistant turn — 64px

Use only while an assistant turn exists but has no visible content yet. Pair it with one specific status line and optional elapsed time. Remove or collapse it as soon as reasoning, tool, or response content becomes visible.

Do not use 64px orbs in navigation, Home, Settings, static empty states, or completed messages.

## Matterhorn state mapping

| Matterhorn activity | Orb state | Customer-facing status example |
|---|---|---|
| Request accepted; model reasoning has not produced visible output | `solving` | Planning the next step… |
| Reading local/project context | `searching` | Checking project context… |
| Web, protocol, or evidence lookup | `searching` | Searching Bittensor sources… |
| MCP/provider/session handshake | `connecting` | Connecting to Wallet MCP… |
| Tool or workflow execution | `working` | Running the selected workflow… |
| Combining multiple sources/evidence items | `weaving` | Combining evidence… |
| Drafting the customer-visible answer | `composing` | Writing the response… |
| Voice input is active | `listening` | Listening… |
| Producing or reshaping an artifact | `shaping` | Shaping the output… |
| Quiet idle affordance, if one is ever justified | `breathing` | Never shown as an active-work substitute |

Mapping must derive from authoritative activity/tool state. When the application only knows `thinking`, use `solving`; do not randomly rotate states to create visual variety.

## Interaction and motion rules

- The orb is not clickable unless a separate explicit control is provided.
- Status changes update the accessible label and visible text together.
- Completed, failed, cancelled, or approval-required states stop the animation and transition to the existing semantic state UI; they do not keep “thinking.”
- No layout movement is driven by the canvas animation.
- Do not animate surrounding text, containers, shadows, or color.
- Respect the package's static `prefers-reduced-motion` frame.
- Pause offscreen and hidden-tab animation.
- Keep device-pixel-ratio capped and verify CPU cost with multiple simultaneous sessions.

## Theme integration

- Use the package's automatic light/dark host detection.
- Default orb ink remains monochrome so it inherits Matterhorn's restrained visual system.
- Protocol colors do not tint active orbs by default; status and risk colors remain reserved for semantic state UI.
- If a future selected-desk tint is tested, it must pass contrast, remain subtle, and cannot be required to distinguish state.

## Accessibility contract

- Visible, specific status text is required next to the orb.
- The orb must not cause duplicate screen-reader announcements when the surrounding status region already owns the live label. Prefer marking the canvas presentation-only in that composition, while the status region uses `role="status"` or the established live-region behavior.
- A standalone orb, if ever used, retains a specific `aria-label`.
- Status announcements must be rate-limited so rapid tool events do not flood assistive technology.
- Reduced motion produces a representative static frame with no loss of status meaning.

## Performance and dependency gate

Before adding the package to production dependencies:

1. Inspect the published tarball and lock the exact accepted version/range.
2. Record installed and minified bundle cost.
3. Confirm there are no runtime dependencies beyond React peers.
4. Verify tree shaking and that public entry does not request the package.
5. Verify animation stops offscreen and on hidden tabs.
6. Preserve the MIT copyright and permission notice in third-party attribution.

Current implementation evidence:

- Exact production dependency pinned: `thinking-orbs@0.2.0`.
- Published ESM payload: 22,340 bytes raw / 7,312 bytes gzip (package upper bound before host tree shaking).
- No runtime dependency beyond React and ReactDOM peers.
- Production public-beta build places the orb implementation only in the lazy Session route chunk; signed-out public entry and authenticated shell entry chunks contain no Thinking Orbs state labels.
- Package-provided reduced-motion, offscreen, and hidden-tab pausing behavior remains intact.
- MIT notice preserved at `docs/third-party/thinking-orbs-LICENSE.txt`.

## Acceptance tests

- State mapping unit tests cover all authoritative Matterhorn activity categories and deterministic fallbacks.
- Waiting/responding UI tests require specific visible text and prohibit a generic spinner in the same state.
- Reduced-motion browser test confirms a static frame.
- Light/dark browser test confirms readable monochrome output.
- Multiple simultaneous agent rows do not animate while offscreen.
- No orb remains after success, error, cancellation, or approval-required transition.
- Signed-out public entry bundle contains no Thinking Orbs code.
- Desktop and mobile screenshots are compared against the saved reference captures.

## Saved reference evidence

- `orbs-reference/overview.png`
- `orbs-reference/searching-playground.png`

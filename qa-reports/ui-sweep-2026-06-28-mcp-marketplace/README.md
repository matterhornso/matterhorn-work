# MCP Marketplace Stream QA

Date: 2026-06-28
Branch: `codex/mcp-marketplace-non-boxy-v2`
Target: `http://127.0.0.1:61934`

## Scope

Verified that the MCPs & Tools desk keeps the softened Matterhorn MCP product surface and that the marketplace/connectors list below it no longer uses the old repeated boxed-card grid.

## Evidence

- `00-mcps-marketplace-desktop.png`: top of the MCPs & Tools desk after Kimi/Minimax integration.
- `01-mcps-marketplace-stream-desktop.png`: scrolled connector marketplace stream with installed connectors and actions.

## Checks

- `mcp-marketplace-stream` rendered in the live app.
- Horizontal overflow: `false` at `1440x1000`.
- Marketplace entries render as divided stream rows instead of auto-filled boxed cards.
- Empty marketplace state no longer uses the dashed boxed-card treatment.

## Console Notes

The local dev stack emitted unrelated WebGL warnings and expected unsigned/local auth noise:

- WebGL `ReadPixels` and active-context warnings.
- Local `401 Unauthorized` / `404 Not Found` resource responses.

These did not block the MCPs visual pass and were not introduced by this UI-only change.

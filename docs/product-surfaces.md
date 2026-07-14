# Matterhorn Work Product Surfaces

**Status:** Current customer-facing behavior
**Updated:** 2026-07-11

## Product Model

Matterhorn Work is a workspace with chat at the center and contextual project surfaces around it. It is not a collection of disconnected admin pages.

The primary loop is:

1. Open a project.
2. Start or continue a chat.
3. Choose a desk or workflow when domain context matters.
4. Review actions, outputs, notes, memory suggestions, and receipts in the same project.
5. Sign externally when an action requires a wallet.

## Project Home

Project Home shows:

- project name and folder context;
- new chat, new project, and Jot Note actions;
- wallet readiness;
- latest project activity and run history;
- Bittensor, Hyperliquid, Polymarket, Sui, and Longevity desk launchers.

Healthy states should stay quiet. Readiness details belong behind the information affordance unless setup or risk requires action.

## Chat

Chat is the primary work surface. It includes:

- OpenCode-backed sessions and streaming;
- model/provider routing through the Matterhorn Work engine;
- tool and MCP calls;
- permission and approval surfaces;
- generated-media entry points;
- response perspectives;
- contextual right rails.

### Response Perspective

Perspective is a label followed by a three-option segmented control:

- **Cautious:** lead with material risks, reversibility, and failure cases.
- **Balanced:** factual default with evidence and tradeoffs but no directional spin.
- **Optimistic:** lead with realistic possibilities and practical opportunities.

The choice is stored per workspace/session in local storage and injected as system context. It changes framing only. Wallet, financial, compliance, privacy, and wellness safety constraints are identical in all modes.

The current product does not generate three parallel answers or a comparison grid. Historical response-mode prototypes that show simultaneous cards are design exploration, not implemented behavior.

## Right Rail

The right rail is contextual and collapsible. Current rail destinations include:

- Profile;
- Wallet;
- Outputs;
- MCPs & Tools;
- Memory;
- Notes;
- Bittensor, Hyperliquid, Polymarket, Sui, and Longevity desks.

Rail design rules:

- use the same canvas as the main workspace;
- avoid nested cards and bright dividers;
- use open sections and spacing for hierarchy;
- keep actions and inputs visibly interactive;
- use a single-pane flow inside narrow rails;
- never use viewport breakpoints to force a two-column layout inside a narrow rail;
- never expose raw machine payloads as the default customer view.

## Notes

Notes are project-owned and workspace-local. The rail uses a list-to-editor flow with search, one compact filter control, buffered autosave, linked context, deletion confirmation, and explicit Memory suggestion. See [Notes](notes.md).

## Memory

Memory is explicit and reviewable:

- suggestions enter an inbox;
- users confirm, edit, dismiss, or let suggestions expire;
- provenance and sensitivity remain visible;
- Notes do not become Memory unless the user explicitly suggests them;
- hidden background memory writes are forbidden.

## Outputs And Generated Media

Outputs unifies files and workflow evidence:

- generated images;
- documents and spreadsheets;
- Sui previews and receipts;
- NFT mint/listing receipts;
- linked workflow outputs.

JSON receipts render as a readable field summary. Long identifiers are compacted for scanning, null/internal fields are omitted from the primary view, and complete JSON remains available under a raw-data disclosure.

Generated media is chat-adjacent but requires explicit user action. A chat draft may seed an image prompt only after the user chooses to use it.

The Generated media settings page leads with publishing readiness, then presents generated images and NFT drafts as two views of one media library. Diagnostics/readiness reports and storage/data controls use progressive disclosure. When workspace context is missing, the page renders one workspace recovery state and does not show disabled dashboards, loading placeholders, or a duplicate shell error.

## Wallet

Wallet is one connection and safety surface:

- MetaMask, Coinbase Wallet, and injected EVM connectors;
- Sui connection through Mysten Wallet Standard wallets or Phantom's native injected Sui provider;
- workspace safety policy;
- reviewed transaction approval;
- safety ledger;
- protocol-specific signer boundaries.

Sui is integrated as a wallet connection and desk workflow. Mysten-compatible wallets are discovered through dApp Kit. Phantom is detected separately through `window.phantom.sui` and connects only after `requestAccount()` approval; Matterhorn retains the approved public address, never keys or recovery material. Phantom currently supports public reads, balance display, transfer previews, and external handoff signing in this surface. The product should not present a separate redundant “Sui wallet workflow” as though connection and usage were unrelated products.

## MCPs And Tools

The MCP surface includes:

- configured OpenCode MCP runtime status;
- client selection for Codex, Claude Code, Claude Desktop, and Cursor;
- copyable configuration commands;
- progressive setup details;
- Matterhorn MCP catalog cards.

Runtime counts must use precise language such as **2 MCP servers active**, not **2 apps connected**. See [Built-in MCP catalog](mcp/README.md).

## Settings And Profile

Profile opens account and cloud readiness, not the generic Settings index. Settings owns preferences, permissions, providers, generated media, MCPs, wallet policy, appearance, updates, billing, diagnostics, and advanced controls.

## Customer Surface Inventory

The required browser audit covers these customer-visible surfaces on the live app:

- project Home and project history;
- Settings hub, overview, preferences, permissions, wallet, generated media, MCPs/extensions, AI providers, customization, appearance, updates, billing, and Cloud account;
- Profile, Wallet, Outputs, MCPs, Memory, and Notes rails;
- Bittensor, Hyperliquid, Polymarket, and Sui focused desks;
- a live desk chat with response perspective and generated-media controls;
- Home, Preferences, Profile, and desk chat at a narrow mobile viewport.

Longevity is launched as a standalone workflow desk rather than a query-backed side panel. Its launch and stage behavior are covered by the product browser smoke and workflow gates. The Electron-only Browser rail is covered by the packaged clean-profile smoke using a loopback health page. Optional Voice remains capability-gated and requires its focused runtime check when advertised in a release.

The inventory contract is `scripts/matterhorn-full-platform-browser-audit.test.mjs`; the live audit is `scripts/matterhorn-full-platform-browser-audit.mjs --strict`.

## Design Direction

- sleek and calm;
- fewer divider lines;
- no boxy control stacks;
- no cards inside cards;
- modest radii;
- healthy states silent;
- explanations behind info icons or progressive disclosure;
- clear contrast between canvas, interactive controls, selected state, and warning/error state.

See [Matterhorn design system](ui/matterhorn-design-system.md).

# Workspace feature readiness — 15 September 2026

This is a partial implementation and dependency report, not a declaration that every requested feature is live.

## Changes completed locally

UI commit: `b17ae1b244` on `codex/workspace-feature-readiness`, based on the earlier Ask/consent regression fix `f471f92c67`. A separate OpenCode upgrade branch, `codex/opencode-1-18-31`, is stacked on the UI commit. Neither has been pushed or deployed in this work block.

| Request | What changed / what remains |
| --- | --- |
| Desk navigation flash | Fixed a confirmed source-level cause: auth checking mounted the signed-out landing page. The new boundary renders a neutral loading state, not the landing page or protected content. Covered by real Chromium transitions. A signed-in hosted account was not available in the browser session, so the exact Home-to-desk flash still needs acceptance on all four desks. |
| User-owned extensions, skills and MCPs | Hosted MCP settings intentionally use a managed summary; desktop/self-hosted installation controls exist. No blanket hosted enablement was made. A new workspace-scoped service is required for hosted custom tools; see below. |
| Set up Private | Composer now opens a dedicated setup section with current server-backed availability, refresh, explicit setup instructions and expiry-aware verification. The actual Private switch already selects an exact verified Venice model. No provider key was added and no live private response is claimed. |
| Browse crypto apps | Gateway-disabled state now offers direct links to Bittensor, Hyperliquid, Polymarket and Sui. It no longer labels an unavailable gateway as preview-ready. Additional app connections remain disabled until operator configuration and certification pass. This is not activation of the third-party app gateway. |
| Matterhorn Cloud | Public-web workspace dialog no longer offers an unusable local-folder card or redirects to an external Cloud landing page. It opens the existing same-origin `/onboarding` workspace setup. It explicitly does not promise additional cloud workers. Full worker provisioning/multiple projects are not implemented here. |
| Memory in model context | Existing `Use in chat` dispatch is wired through session context and authoritative `memoryIds`. Fixed misleading labels: selecting a record is now `Select for chat`, followed by `Use in chat` to attach it. Saving does not silently send a memory to a model. No automatic cross-chat retrieval was introduced. |
| Upstream versions | OpenCode runtime/SDK candidate updated to 1.18.31. OpenWork 0.18.47 was discovered; broad intake remains pending and baseline stays 0.18.44. See the separate upgrade report. |

The Impeccable and Uncodixfy UI guidance informed the compact setup section, explicit unavailable states and simple desk links. Existing visual tokens and controls were retained.

## Checks

The UI candidate passed 1,119 app tests, six isolated Chromium regressions, 33 targeted backend tests, app typecheck, web build and the complete platform safety gate. Browser fixtures exercise production components without account/provider/network calls; they are not hosted end-to-end certification. Existing large-chunk build warnings remain.

Targeted backend command:

```sh
pnpm exec bun test apps/server/src/agent-privacy.test.ts \
  apps/server/src/memory-routes.e2e.test.ts \
  apps/server/src/crypto-app-catalog-routes.e2e.test.ts
```

Those tests cover privacy consent, exact Venice proof checks, memory persistence/policy and authenticated fail-closed crypto-app boundaries. They do not prove a live model has consumed a real account's selected memory.

A fresh read of the canonical app's `/health/ready` returned `ok: true`, with `checks.guardedRuntimeMode: off`, `guardedRuntimeReady: true`, and crypto-app gateway, coworkers, agent files and hosted MCP access modes all `off`. These flags were not changed.

## Private setup: operator dependency

Current implementation uses Venice. The browser does not accept its credential.

1. Confirm Venice is the desired provider. Add `VENICE_API_KEY` in Railway's backend service secret manager, never in Vercel `VITE_*`, a screenshot, a prompt or a tracked file.
2. Restart/deploy the managed runtime. Catalog discovery must admit online private text models with tool support. The server proof must be current and cover the exact model ID.
3. Open a chat → Set up Private → Check again. Return to the chat and turn Private on, or choose the verified Venice model.
4. Verify an authenticated `private_workspace` request and real response. Test expired/substituted proofs and cross-account denial. Keep signup and guarded-runtime settings unchanged.
5. Private inference does not erase Matterhorn's saved chat history, encrypt all workspace data, or make external tools private. Preserve those disclosures.

For a provider other than Venice, implement and review its exact privacy contract first. A provider label alone must never enable the private switch.

## Memory usage and acceptance

User flow: Memory → Add memory → Save memory → Select for chat → Use in chat. Review the attached memory chip, compose a question and send. The privacy preflight may request consent depending on the selected provider and content classification. From Home, the handoff creates a reviewable draft rather than sending immediately.

The server resolves selected IDs from the account's workspace; browser-supplied memory text is not authority. Secret-bearing records remain blocked. Saving and suggesting are distinct actions; unapproved suggestions are not automatically used.

Before calling it hosted-verified: save a harmless unique preference with account A, ask a model to use it, confirm the visible context and reply, remove it and confirm subsequent context excludes it, forget it, then attempt cross-account B access. Test preflight approval invalidation if the saved record changes. Do not use real secrets as test data.

## Hosted custom-tool release — proposed boundary, awaiting confirmation

Do not expose the desktop's raw plugin/config writer to public users. Recommended first release:

1. **Workspace-owned skills:** bounded Markdown upload/editor; validate frontmatter; immutable revisions and owner checks; delete/export; opt-in attachment; treat content as untrusted instructions below product safety policy; include exact revision in privacy admission.
2. **Reviewed remote HTTPS MCPs:** workspace-owned connection records; SSRF-safe DNS/peer pinning and redirects policy; no local-network/stdio access; encrypted tenant credentials; bounded discovery/tool results; explicit tool permission review; server-enforced allowlists, revocation and timeouts.
3. **Extension packages:** defer executable packages until a per-tenant sandbox, package validation, resource/network quotas and lifecycle isolation are available. UI availability must come from a server capability, not a build-only toggle.
4. Two-account CRUD/invocation isolation, malicious manifest/prompt-injection cases, credential redaction, quota accounting and gateway final-message binding are release blockers.

## Cloud and gateway work still required

Agree whether “Matterhorn Cloud” means (a) the existing hosted workspace per organization, (b) multiple projects inside an organization, or (c) independently provisioned worker runtimes. These have different storage, permission, quota and billing implications. Do not make organization creation a hidden substitute for project creation.

For additional crypto apps, inventory the existing registry, certifications, execution mode and required managed credentials. Populate and certify approved testnet entries; verify read and wallet-preview paths with operator approval before enabling the gateway. Do not simply change `off` to `enforce` to make the screen populate. The direct desk links remain usable independently.

## Next release sequence

1. Review the UI commit separately from the OpenCode candidate; run CI on each.
2. Obtain the provider/custom-tool/Cloud choices above. Assign the service implementation and operator configuration explicitly between Codex and CTO.
3. Finish the OpenWork selective intake from full Git history, not the truncated GitHub comparison.
4. Deploy an approved exact commit to Railway, then an immutable Vercel preview; compare frontend/backend commits before promotion.
5. Run strict release probes and the authenticated desk, Private, Memory, tenant and wallet acceptance tests. Keep public signup paused until the existing launch requirements pass.

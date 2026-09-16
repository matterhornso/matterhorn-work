# Workspace fixes: PR status and remaining work

This is the current status for `codex/opencode-1-18-31`, superseding the release-status sections of the earlier local progress reports. This branch contains tested fixes, not completion of every requested hosted feature. Submit it as a **draft into dev**. Do not merge or deploy it merely because its local checks pass.

## Included

- Ask/Enter submission regression: no React event is passed as a privacy token; explicit consent is validated separately; pending requests are single-flight and retries do not reuse consent.
- Authentication rechecks show loading rather than flashing the signed-out page.
- Returning from model settings renders the pending protocol desk on the first render, before workspace reconnection and URL restoration. Explicit panel/desk URLs and existing chats take precedence.
- Private setup uses current exact-model verification, has an expiry-aware availability state and operator instructions, and disables refresh when the workspace connection is unavailable.
- A disabled additional-app gateway links directly to the four existing crypto desks instead of presenting a dead end.
- Hosted workspace setup uses same-origin onboarding instead of an unrelated Cloud landing page. It does not provision additional workers.
- Memory selection and attachment are distinct, clearly labelled actions. Existing authoritative memory-ID resolution and privacy checks remain intact.
- OpenCode runtime/SDK pins are synchronized to 1.18.31, with verified release checksums and a boot-tested macOS binary. Global runtime installation is unchanged.

Impeccable and Uncodixfy informed the compact UI, existing-component reuse and explicit unavailable states; this is not a visual redesign.

## Not completed — release blockers

| Work | Why this PR cannot claim completion | Required next step |
| --- | --- | --- |
| Hosted custom skills, extensions and arbitrary MCPs | Existing desktop installation endpoints deliberately deny hosted sessions. Removing the checks would expose shared runtime code execution and network access. | Build workspace-owned skill revisions and a reviewed remote-MCP service with tenant credential isolation, SSRF protection, tool permissions and quotas. Executable extensions additionally need tenant sandboxes. |
| Live Private inference | UI and server verification exist; a live configured Venice response was not verified in this work. | Operator supplies the server-side credential via the secret manager; run exact-model, expiry and real-response acceptance. Never put credentials in chat or VITE variables. |
| Additional crypto-app connections | Direct built-in desks are usable independently, but the app gateway remains off. | Certify registry entries, configure managed transports and complete wallet/read acceptance before any mode change. |
| Full Matterhorn Cloud provisioning | Existing hosted onboarding is not a multi-project/worker provisioning service. | Confirm multiple projects versus isolated workers, then implement storage, quotas, lifecycle and tenant isolation against that contract. |
| Automatic cross-chat memory retrieval | Explicit selected-memory attachment is wired; saving does not automatically send records to providers. | Design opt-in retrieval and bounded relevance selection, retain visible context and authoritative privacy admission, and verify with two accounts and a real model. |
| Hosted model timeout | Fixing Ask serialization does not prove every inference timeout has the same cause. | Correlate gateway acceptance, engine dispatch, provider response and UI delivery using the metadata-only diagnostic handoff. |
| Full OpenWork update | Baseline remains 0.18.44; 0.18.47 is not integrated. | Separate selective intake and compatibility PR; preserve Matterhorn's account and crypto safety boundaries. |

## OpenWork intake findings

Official refs were fetched without switching the checkout:

- `v0.18.44`: `cac94b079906b9ef45788dfaa07444524976a6a0`
- `v0.18.47`: `65c4286a9006297b0c10b9bf1324fa7c00c422a8`

The full tree comparison, unlike GitHub's capped file listing, contains **1,255 changed files, 221,322 insertions and 20,840 deletions**. It includes MCP Apps, provider/OAuth, session history, connection and deployment changes. Inventorying this diff is not a security review. Do not bump the reviewed OpenWork baseline to 0.18.47 until the relevant changes have been ported and tested.

## Verification and reproduction

Current local results are recorded in the PR description. Earlier checks and exact commands are in `workspace-feature-readiness-2026-09-15.md` and `../releases/opencode-1.18.31-intake-2026-09-15.md`.

The isolated Chromium suite tests production Composer and auth-boundary components, with external network requests blocked. It does not replace authenticated hosted acceptance. No current authenticated browser screenshot was available; attached user screenshots describe the original faults, not the result of this branch.

Reviewer reproduction:

1. Open each built-in desk from Home and an existing chat. Repeat after a session recheck and after returning from model settings; Home/sign-in should not briefly mount as the requested desk loads.
2. Open Set up Private with the workspace disconnected, connected without Venice, and with current/expired exact-model proof. Only current verified models may be advertised as ready; offline refresh must be disabled.
3. With the crypto gateway off, use all four direct desk links. Confirm no additional-app connection is represented as enabled.
4. In public web, open workspace creation and follow workspace setup to same-origin onboarding. Do not interpret this as creating another cloud worker.
5. Save a harmless memory, select it, attach it to a draft, inspect its chip, and send with a real model. Remove/forget it and test cross-account denial. This live test remains outstanding.
6. Click Ask, submit with Enter, retry a failed request and confirm a privacy request. Inspect only sanitized status/identifiers; do not export bearer tokens or prompt contents.

No production settings, signups, gateway modes, provider credentials, wallet transactions or deployments were changed. CTO-owned and unrelated untracked handoffs/reports are excluded from this PR.

# CUDOS model selection and local five-desk chat acceptance

Date: 14 October 2026. Local only; no push, merge or deployment.

## Outcome

Fixed the unnecessary privacy-policy assertion on saving a workspace model preference. A preference save does not dispatch a prompt. Catalog/chat compatibility, collaborator authorization, audit and persistence remain enforced. All prompt dispatch privacy checks remain unchanged.

Corrected two restored-UI notices that incorrectly described an unverified provider as a universal sending ban. The authoritative guarded gateway already permits public research while applying request-bound consent, secret blocking and execution authorization. Provider policy metadata remains unverified, `allowed: false`; no no-training or retention assurance was invented.

Branch: `codex/cudos-model-selection-2026-10-14`.
Base: `4085d83cb23e9e2f4f4c639d3a990f9b93196771` (merged PR #1035).

## Local browser acceptance

Preview: `http://cudos-restored.localhost:58334`.
Workspace: `ws_web_3b2e50a56ee080fb`.
Existing disposable verified test account and Terms acceptance were preserved. No auth/verification bypass or production configuration changes. Existing unrelated previews were not restarted. The updated frontend uses its own output directory, not the shared production bundle.

- Chose ASI1, clicked **Use for new chats**, observed **Workspace default saved**.
- Reloaded, reopened model settings and verified **Cudos / ASI1** persisted as the workspace default; normal authenticated API readback agreed.
- Opened each desk through its UI and sent a public synthetic concept prompt. No attachments, memories, private wallet data, live-chain request or transaction was included.
- Every assistant receipt reports provider `cudos`, model `asi1`, `finish: stop`, completion time and the expected desk agent.

| Desk | Agent | Session | Tokens |
| --- | --- | --- | ---: |
| Private AI | `matterhorn` | `ses_ec73683e4ffeu1utAyYqtQ8ZM5` | 6,874 |
| Bittensor | `matterhorn-bittensor` | `ses_ec734348bffeAFJtNcA6ccGB4x` | 3,365 |
| Hyperliquid | `matterhorn-hyperliquid` | `ses_ec7333163ffeKW8D5JMlDCNMQ7` | 3,568 |
| Polymarket | `matterhorn-polymarket` | `ses_ec73236caffe5Kj3g9ePHdhXKy` | 3,849 |
| Sui | `matterhorn-sui` | `ses_ec7316d2bffeRs0tRbFWKcC5ym` | 2,225 |

Final account usage: **19,881 used/charged tokens, 0 reserved tokens, 0 pending requests**, exactly matching the five receipts. Hard 100,000-token local limits remain enabled. Provider monetary cost is not asserted from the usage store's zero cost field.

The initial Private AI request timed out awaiting manual host approval, showing **Write request denied** and retaining the input. Retrying after granting that specific request's normal host approval succeeded. Each later test received one scoped host approval through the supported operator endpoint. Manual mode was never disabled. **New user messages in this preview still require operator approval**; these results are not evidence of unattended chat readiness.

## Automated checks

- Backend control-plane suite: 41 passed, including strict-mode unverified CUDOS preference persistence, audit and no session dispatch.
- Provider/agent privacy suites: 31 passed.
- Authoritative public-research gateway E2E: 1 passed, preserving raw/private-path restrictions.
- Frontend suite: 1,322 passed across 190 files. First sandbox run had three localhost socket failures; the same full suite passed with required local socket permission.
- App and server TypeScript checks: passed.
- Isolated production-format web build: passed. Existing bundle-size/circular-chunk warnings remain.
- `git diff --check`: passed.
- Independent source review: no actionable findings.

## Visual verification and skills

Impeccable clarify/polish and Uncodixfy were used for a narrow copy correction, with no layout, token or branding change. Completed chat checked at the actual Codex preview width, 1280×900 desktop and 390×844 mobile. At 390px, document width equals viewport width; no page horizontal overflow. Privacy text wraps and the model/composer controls remain visible. Temporary viewport override was reset.

The one requested detector pass reported only an existing `text-[11px]` type-ramp advisory in the privacy notice. Left unchanged to preserve the restored UI and this task's narrow scope. Existing Impeccable product/surface metadata is stale; documentation migration was not included. Safari, Firefox, light theme and a full accessibility audit were not reverified in this bounded fix.

Local evidence (not committed, contains only disposable synthetic chat content; credential files are separate owner-only files):

- `/private/tmp/matterhorn-cudos-restored-4ZgYPr/local-chat-evidence.json`
- `/private/tmp/matterhorn-cudos-restored-4ZgYPr/model-saved.jpg`
- `/private/tmp/matterhorn-cudos-restored-4ZgYPr/sui-completed-desktop.jpg`
- `/private/tmp/matterhorn-cudos-restored-4ZgYPr/sui-completed-mobile.jpg`
- `/private/tmp/matterhorn-cudos-restored-4ZgYPr/frontend-tests-unrestricted.log`

## Remaining boundaries

1. CUDOS API-specific training and prompt-retention terms are still unverified. Public research acceptance is not permission to send secrets or arbitrary private context. No verified-policy declaration or opt-in was added.
2. This is **local real-provider conversation acceptance**, not hosted acceptance or all-model certification. ASI1 Mini and other models were not inference-tested in this pass.
3. Bittensor's live-chain service is not configured in this isolated runtime. Concept responses do not prove live-chain tooling, venue availability, signing or execution. No transactions were performed.
4. Jev and STM remain off. Existing default-off/privacy/approval safeguards were retained.
5. Manual host approvals remain required. Automatically approving future requests would be a separate local security-setting decision requiring the user's confirmation.
6. Review/publish this branch only if requested. Production deployment remains for the user/tech team, after their release checks and hosted acceptance.

## Policy sources checked

- [ASI:Cloud overview](https://docs.cudos.org/docs/asi-cloud/introduction/overview) distinguishes infrastructure from inference service operation.
- [ASI:Cloud FAQ](https://docs.cudos.org/docs/asi-cloud/support/faqs) does not supply the missing API training/retention commitment.
- [CUDOS privacy policy](https://www.cudos.org/legal/privacy-policy) is not sufficient evidence for an API no-training/zero-retention claim.

Unknown policy terms are not evidence that CUDOS trains on requests; they are also not evidence that it does not. The UI retains that uncertainty.

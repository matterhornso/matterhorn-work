# Matterhorn provider and privacy review

Reviewed 3 October 2026 by Codex using source and public official provider documentation. This is an engineering evidence register, not legal advice, a signed DPA, production configuration attestation or completed launch approval. Owner approval to proceed is recorded in the launch plan. Account-specific terms and operational controls remain unresolved as indicated below.

## Decisions and evidence

| Topic | Evidence reviewed | Permitted conclusion and remaining action |
| --- | --- | --- |
| ASI policy | [ASI One privacy policy](https://asi1.ai/legal/privacy), effective 24 June 2026, sections 3 and 7 | It describes opt-in foundational-model training, and conversation retention tied to account/service needs rather than zero retention. Do not treat its 30-day usage-log period as prompt retention. Confirm it governs the actual CUDOS/ASI Cloud API account and intermediary before using it as deployment evidence. |
| Actual CUDOS route | `apps/server/src/cudos-provider.ts`: `https://inference.asicloud.cudos.org/v1`; `provider-privacy.ts` and policy regressions | Source supports a verified-only gate and explicit account-opt-in/retention-policy declarations. No production configuration or signed agreement was read. Policy applicability and actual opt-in state are BLOCKED for operator evidence. Never insert a synthetic review date or zero-retention value. |
| Jev training | [TypeSafe privacy policy](https://typesafe.ai/legal/privacy-policy), updated 19 November 2025, Input provisions | The provider states it does not train or fine-tune on inputs. This is a provider commitment, not an audit of compliance or a statement that it stores nothing. |
| Jev retention | [TypeSafe DPA](https://typesafe.ai/legal/data-processing), updated 24 April 2026, Schedule I; [legal index](https://docs.typesafe.ai/legal) | The public DPA uses purpose/law-based retention criteria, not a numeric zero-retention default. The legal index separately offers enterprise ZDR. Confirm applicable contract, retention/deletion process, subprocessors and transfer terms; do not claim our account has ZDR. |
| Jev data flow | `apps/server/src/jev.ts`, `apps/app/tests/jev-chat.test.ts`, [official API](https://docs.typesafe.ai/api) | Current-message classification with two bounded questions; selected answering model unchanged. Fresh fixture tests cover consent/configuration, sensitive/private exclusions, zero egress when off, response validation and failure fallback. Live credential/account configuration and classification accuracy are NOT VERIFIED. Keep optional; no enablement performed. |
| STM | `stm-runtime.test.ts`, `stm-mcp.test.ts`, `stm-mcp-launch.e2e.test.ts` | Fresh local tests cover disabled runtime enforcement and isolated fixtures. No production flag was read or changed. Release requirement remains STM off. |
| Memory and local permissions | Full memory lifecycle stage, notes/memory/backend fixture tests | Local deletion/confinement/owner-only-permission and authorization tests pass. This does not prove encrypted disks/backups or hosted two-account behavior. Memory, chat, notes, exports and provider copies have separate lifecycles. |
| Hosted storage and backups | No operator attestation, storage configuration or restore artifact supplied this turn | BLOCKED. Require encrypted storage/backup evidence, key ownership, retention, isolated restore and deleted-data handling. No blanket end-to-end encryption, guaranteed recovery or universal deletion claim. |
| Public trust copy | `apps/app/src/react-app/domains/public/public-trust-route.tsx` | Source distinguishes local and hosted workspaces. Its immediate workspace-deletion/only-metadata language needs qualification for separate copies. The 365-day receipt claim also needs deployed retention evidence. Existing telemetry wording is not certification of every configured infrastructure log sink. |

## Proposed precise deletion disclosure

For owner review before changing the public privacy page:

“Workspace deletion applies to the active workspace stores covered by that action. It does not delete copies you downloaded, data already sent to a model or tool provider, or every backup copy. Those copies follow their separate deletion and retention processes. Contact support for the retention and deletion terms that apply to your hosted workspace. Minimal content-free security records may remain under the applicable security-retention policy.”

This is proposed wording, not an assertion that the current hosted delete path passed. Confirm the active-store deletion semantics and actual security-retention period before finalizing it. Do not describe local permission tests as encryption or backup proof.

## Required operator evidence

Supply references or redacted attestations, not API keys:

1. Contract/service identity for CUDOS/ASI Cloud and any upstream processor, applicable policy URL/version, prompt-retention terms, training opt-in state and processing/subprocessor regions.
2. If enabling Jev: applicable TypeSafe account agreement/DPA, retention/deletion and transfer/subprocessor terms, approved budget and current consent review. No enterprise-ZDR claim without an actual agreement.
3. Hosting storage/backup encryption and key-access evidence, retention schedule and isolated restore result; include how deletions are respected after restore.
4. Actual telemetry/log fields and retention, receipt retention configuration and hosted deletion evidence.

No policy flags, contracts, consent records or production secrets were changed. Once the evidence arrives, Codex can reconcile disclosures and configuration checks; newly discovered material data-processing differences require a specific owner decision.

# Matterhorn task-first redesign — exact source acceptance

Date: 2026-08-08

Branch: `codex/task-first-redesign`

Implementation commit: `4a6bfe3a1780a96fd2f1456916753818cd3d34d8`

Pull request: <https://github.com/matterhornso/matterhorn-work/pull/842>

Candidate mode: `VITE_MATTERHORN_DEPLOYMENT=web`, `VITE_MATTERHORN_PUBLIC_BETA=1`

## Decision

**Exact source candidate: PASS. Operational hosted beta: NO-GO pending external release infrastructure and acceptance.**

The approved task-first redesign and its code-owned follow-up are complete on the implementation commit. The app has an accepted public entry, authenticated shell, Home, protocol and Longevity desks, MCP compact/full surfaces, Settings hierarchy, AI progress/provenance lifecycle, universal response actions, responsive behavior, and enforced performance boundaries. Public Beta continues to fail closed before reviewed wallet actions reach the render tree.

The production alias remains a static public preview without the authenticated same-origin control plane and managed engine. No local fixture or source contract is being substituted for that missing production topology.

## Requirement matrix

| Requirement | Result | Exact evidence |
|---|---|---|
| Restrained Matterhorn system | PASS | Existing dark/ice-blue palette and desk accents preserved; cards and controls retain the 8–12px radius contract; no new gradients, glass shells, or decorative dashboard patterns. |
| Public entry and trust | PASS locally | Public trust routes boot above Query/account/workspace/wallet providers; Privacy renders one `main`, one H1, no duplicate IDs, and no overflow. Public trust static graph is 299,571B. |
| Authenticated shell and Home | PASS | Exact live Home exposes one H1/`main`, one recommended next action, secondary creation actions, Project Activity, desk launcher, and accurate current-location text. |
| Protocol desks | PASS | Exact live Bittensor, Hyperliquid, Polymarket, and Sui each render the correct desk H1, one `main`, no overflow, read/research/evidence language, zero `Wallet actions`, and zero `Prepare in chat` actions in Public Beta. |
| Longevity | PASS | Canonical `?desk=wellness` survives reload, renders the seven-stage non-medical workflow, keeps one `main`, and returns to a clean Home URL. |
| MCPs | PASS | Compact rail covers unavailable/empty/sync/error/success state contracts without nesting `main`; `Manage MCPs` opens the full catalog and connector configuration in Settings. |
| Settings | PASS | Overview exposes exactly one visible H1, subordinate Profile and Workspace health sections, one `main`, no overflow, and direct workspace safety/privacy controls. |
| AI activity and provenance | PASS | Named thinking/activity, elapsed time, partial/terminal states, correction/revert/fork, saved output provenance, and reduced-motion contracts remain covered. The approved orb primitive remains decorative inside Matterhorn-owned live status. |
| Universal response actions | PASS | Exact live response exposes Retry, Copy, Save to Outputs, response-specific Helpful/Not helpful, Revert, and Fork. Save creates a Markdown output, records Project Activity, changes to `Open saved output`, and opens the artifact directly. Feedback states that it is workspace product-quality input and not model-training data. Retry replaces the latest response after an exact session revert. |
| Non-custodial safety | PASS | Reviewed actions remain agent draft → separate review → connected-wallet approval → receipt when enabled; Public Beta hides those actions centrally. No signing, custody, seed phrase, private-key, or unattended execution path was added. |
| Responsive and accessibility | PASS locally | Existing 320/375/768/1024/1440 suites remain green. Exact browser checks show one accessible `main`, accurate H1s, no horizontal overflow, direct native links, coherent response action groups, and Settings/MCP landmark integrity. Physical-device and screen-reader evidence remains external. |
| Semantic overlays | PASS | Dropdown, modal, coachmark, toast, tooltip, and diagnostic surfaces use one ordered token scale. Literal production z-index utilities were removed and the contract prevents recurrence. |
| Performance boundaries | PASS | Public entry 431,765B; Session route 150,893B; Session page 574,545B; Settings 255,973B; wallet families EVM 480,855B, Sui 411,655B, Bittensor 896,388B. Heavy wallet, Shiki, translations, editor, and spreadsheet code remains intent-loaded. |

## Exact live journeys

The generated-media loopback stack was restarted from the implementation commit before acceptance so the frontend and backend were not mixed-version.

- Home: one H1, one `main`, safe recommended action, no overflow.
- Public-Beta desks: four of four read-only; no reviewed-action headings or preparation controls.
- Longevity: route reload and Back-to-Home acceptance passed.
- MCP rail: compact state, recovery copy, current client, and `Manage MCPs` passed; full Settings catalog opened.
- Settings Overview: one visible H1 and one `main` passed.
- Response Save: `Save response to Outputs` → `Saved to Outputs` → `Open saved output`; output preview opened with saved-source provenance.
- Response feedback: response-specific Helpful state persisted in the UI with explicit no-model-training copy.
- Response Retry: exact prompt boundary reverted, generation restarted, and reload showed one replacement response. The synthetic OpenCode fixture now implements revert/branch replacement so this remains browser-testable.

## Automated certification

Strict certifier result: **`LOCAL-GREEN-OWNER-GATES-PENDING`**

- Immutable commit: `4a6bfe3a1780a96fd2f1456916753818cd3d34d8`
- Dirty paths: 0
- Source stable during run: yes
- Certification integrity digest: `a83d7bd7ca3b5ef1f9bbdbab48c3837a238c8ed21779cbd8b53e1ee7e17e32d4`
- App: 839 passed, 0 failed, 5,437 expectations.
- Server: 800 passed, 0 failed, 5,609 expectations.
- App, server, and Electron bridge typechecks: PASS.
- Production web, server, and desktop builds: PASS.
- Matterhorn platform safety gate: PASS.
- Release secret scan: 0 findings.
- Locked dependency audit: 1,406 versions, 0 low-or-higher advisories.
- Task-first bundle gate: PASS.

Checksum-backed reports and redacted logs are in [`qa-reports/public-beta/task-first-4a6bfe3a`](../public-beta/task-first-4a6bfe3a/).

## Code-owned sweep backlog closed

- One-click response Retry is universal for the latest completed assistant response; historical responses preserve Fork semantics.
- Generic Save to Outputs and response-specific feedback are universal.
- Saved receipts navigate directly to the output.
- Browser-native links are retained where open/copy/bookmark behavior is useful.
- Maximum desktop density has deterministic full-screen → sheet → docked collapse policy.
- Public trust routes no longer load authenticated-shell or Query runtime.
- Toasts and all remaining production overlays use the semantic layer scale.
- The synthetic acceptance stack supports real revert/retry behavior.

## External gates still required before GO

1. Deploy this exact source behind the authenticated same-origin proxy and managed engine; expose deployed commit identity.
2. Configure the production account service and provide two ordinary verified acceptance accounts.
3. Prove signup/verification/sign-in/sign-out/recovery, real desk completion, explicit workspace/chat routing, and cross-account workspace/session denial.
4. Prove production cookie/CSRF behavior, exact-origin CORS with `Vary: Origin`, live/ready health, monitoring and alert delivery, persistent backup/restore, and rollback.
5. Capture exact deployed authenticated Home/desks/Longevity/MCP/Settings/active-and-terminal response screenshots and rerun mobile/desktop Lighthouse on the final Cloud configuration.
6. Complete physical iOS/Android keyboard, non-zero safe-area inset, VoiceOver, and TalkBack acceptance before broad beta.

Real wallet-provider execution acceptance is not a gate while reviewed actions remain absent under the Public-Beta policy. It becomes mandatory before any release enables those actions.

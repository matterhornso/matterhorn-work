# Matterhorn Work Bittensor Customer Evidence Bundle

## Decision

- Result: READY_FOR_TEST_CUSTOMERS
- Generated at: 2026-07-14T08:22:54.096Z
- Safety posture: non-custodial, public wallet reads only, unsigned previews and external signer handoff only.
- Redaction posture: this bundle rejects secret-shaped JSON fields and displays input basenames instead of full local paths.

## Evidence Inputs

- Bittensor live QA: bittensor-live-qa.json
- Agent control live QA: agent-control-live-qa.json
- CI evidence: local-release-checks.json
- Customer readiness gate: bittensor-customer-readiness.md
- Wallet timeline: missing
- Adapter candidate: missing
- Adapter canary: missing
- Read-only adapter canary: missing
- Receipt check: missing
- Scheduled watch autopilot: missing

## Gate Summary

| Area | Status | Detail |
| --- | --- | --- |
| Bittensor live QA | pass | 21 passed, 0 failed, 0 skipped |
| Agent control live QA | pass | 15 passed, 0 failed |
| Customer readiness gate | pass | Readiness gate says ready |
| CI evidence | pass | 3 passed, 0 failed, 0 pending |
| Wallet timeline | warn | No wallet timeline evidence provided |
| Adapter candidate | warn | No adapter candidate evidence provided |
| Adapter canary | warn | No adapter canary evidence provided |
| Read-only adapter canary | warn | No read-only adapter canary evidence provided |
| Receipt check | warn | No post-signer receipt check evidence provided |
| Scheduled watch autopilot | warn | No scheduled watch autopilot evidence provided |

## Covered Bittensor Paths

- Read Bittensor readiness
- List subnet capability manifests
- Read selected subnet capability manifest
- Answer beginner Bittensor explanation
- Clarify wallet reads without SS58
- Read watch-only TAO wallet snapshot
- Read stake positions from public wallet context
- Analyze watch-only wallet risk and exposure
- Compare wallet exposure against the last public baseline
- Discover image-generation subnets
- Analyze subnet risk and live-data quality
- Compare validators on a subnet

## Open Bittensor Failures

None.

## CI Checks Included

- Matterhorn platform safety gate: passed
- App and server typechecks plus focused activation and persistence regressions: passed
- Wednesday responsive full-platform browser audit: passed

## Before Customer Demo

- Attach this bundle to the release notes or customer-readiness handoff.
- Keep real SS58 wallet evidence public-only and redact customer-identifying notes.
- Re-run the full readiness gate with `--require-wallet --require-ci` for any customer session involving wallet/stake preview.
- Do not enable real subnet service adapters until the adapter candidate gate and adapter canary have an allowlisted endpoint, timeout, hash confirmation, and rollback note.
- After any external signer return, attach a receipt check and run a public wallet diff follow-up before calling the customer flow complete.
- If monitoring ran while the operator was away, attach the scheduled watch autopilot summary and inspect any safe chat prompts before the demo.

# Matterhorn Work Bittensor Customer Readiness Gate

Use this gate before sharing Matterhorn Work with a Bittensor test customer. It converts the Hermes QA checklist into one evidence-backed pass/fail report.

The gate does not sign, broadcast, or invoke real subnet services. It reads reports produced by the existing live QA harnesses and checks that the release-critical evidence is present.

## Run

```bash
node scripts/bittensor-customer-readiness-gate.mjs \
  --bittensor-live-qa /tmp/bittensor-live-qa.json \
  --agent-control-live-qa /tmp/agent-control-live-qa.json \
  --ci /tmp/github-ci.json \
  --output /tmp/matterhorn-bittensor-customer-readiness.md \
  --strict
```

For a full wallet/stake preview readiness pass, add:

```bash
--require-wallet
```

For a release candidate where GitHub checks must be attached as evidence, add:

```bash
--require-ci
```

## Evidence Inputs

- `--bittensor-live-qa`: JSON output from `scripts/bittensor-live-qa.mjs`.
- `--agent-control-live-qa`: JSON output from `scripts/agent-control-live-qa.mjs`.
- `--ci`: JSON containing GitHub check, status, workflow, run, or job entries.

The CI input is intentionally simple. Any of these shapes work:

```json
{
  "workflow_runs": [
    { "name": "Matterhorn Work Tests", "conclusion": "success" },
    { "name": "i18n Audit", "conclusion": "success" },
    { "name": "Alpha Channel macOS arm64", "conclusion": "success" }
  ]
}
```

## Gate Criteria

The gate reports `READY_FOR_TEST_CUSTOMERS` only when:

- required Bittensor QA docs exist;
- Bittensor live QA reports ready and has no failed stages;
- Bittensor live QA covers readiness, wallet/clarification, validator comparison, staking preview or clarification, subnet adapter preview/fallback, and monitoring watches;
- agent-control live QA reports ready when provided;
- required CI checks pass when CI evidence is provided or `--require-ci` is used;
- no input report contains secret-shaped fields such as seed, mnemonic, private key, password, keyfile, or wallet export.

## Required Check

```bash
pnpm test:bittensor-customer-readiness-gate
```

Use this gate alongside:

- `docs/hermes-bittensor-usability-security-qa.md`
- `docs/bittensor-live-qa.md`
- `docs/bittensor-operator-playbook.md`
- `docs/agent-control-coverage-matrix.md`

## Customer Evidence Bundle

After the gate passes, create a customer-safe handoff packet that includes only redacted basenames and public-data summaries:

```bash
node scripts/bittensor-customer-evidence-bundle.mjs \
  --bittensor-live-qa /tmp/bittensor-live-qa.json \
  --agent-control-live-qa /tmp/agent-control-live-qa.json \
  --ci /tmp/github-ci.json \
  --readiness-gate /tmp/matterhorn-bittensor-customer-readiness.md \
  --wallet-timeline /tmp/wallet-timeline-status.json \
  --output /tmp/matterhorn-bittensor-customer-evidence.md \
  --strict
```

The evidence bundle refuses secret-shaped JSON fields such as seed, mnemonic, private key, API key, token, password, keyfile, SURI, or wallet export. It is intended for operator/customer-readiness handoff, not for transaction signing or real subnet service execution.

## Adapter Canary Evidence

When a customer demo includes direct subnet adapter execution, include the adapter canary gate in the evidence bundle:

```bash
node scripts/bittensor-customer-evidence-bundle.mjs \
  --bittensor-live-qa /tmp/bittensor-live-qa.json \
  --agent-control-live-qa /tmp/agent-control-live-qa.json \
  --ci /tmp/github-ci.json \
  --readiness-gate /tmp/matterhorn-bittensor-customer-readiness.md \
  --adapter-canary /tmp/bittensor-adapter-canary-gate.json \
  --require-adapter-canary \
  --output /tmp/matterhorn-bittensor-customer-evidence.md \
  --strict
```

Keep this optional for normal read-only Bittensor demos. Use `--require-adapter-canary` only when real adapter canary execution is part of the customer session.

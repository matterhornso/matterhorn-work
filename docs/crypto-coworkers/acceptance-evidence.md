# Guarded Crypto Coworkers acceptance evidence

The Crypto Coworkers release gate turns the remaining live Phase 1–5 exit criteria into one fail-closed, exact-commit decision. It does not certify an app, enable a runtime mode, publish to Walrus, promote a deployment, or grant wallet authority.

Create a non-passing, exact-commit template after the immutable candidate is deployed:

```bash
pnpm template:crypto-coworkers-acceptance -- \
  --expected-commit <full-40-character-candidate-sha> \
  --app-url https://candidate.example/workspace/example \
  --output /absolute/path/to/crypto-coworkers-acceptance.json
```

The command refuses local, credential-bearing, or non-HTTPS URLs and will not overwrite an existing file. It writes an owner-only `0600` manifest with the pinned runtime versions, exact networks, every outcome marked `pending`, and a separate relative report path for each group. It creates no report, hash, or passing claim. Replace a report placeholder only after the redacted report has been reviewed, then calculate its exact SHA-256 and change that group's status and verified outcomes.

Run it only against a deployed immutable candidate:

```bash
pnpm gate:crypto-coworkers-acceptance -- \
  --evidence /absolute/path/to/crypto-coworkers-acceptance.json \
  --expected-commit <full-40-character-candidate-sha> \
  --json-output /absolute/path/to/crypto-coworkers-readiness.json \
  --strict
```

The input must use `matterhorn.crypto-coworkers-acceptance-evidence.v1`. Evidence is valid for 12 hours and must identify the same exact commit under test. The deployed runtime evidence must match the OpenWork, OpenCode, and OpenCode SDK versions and upstream commits pinned in `constants.json` and `upstream-compatibility.json`.

The manifest and every referenced report must be regular non-symlink files. Intermediate directory symlinks are rejected, canonical paths must remain inside the acceptance packet, and the gate verifies that the opened file still matches the checked path while it is hashed. Each evidence group and the SDK provenance check must use a distinct canonical report path and distinct content hash; one generic report cannot satisfy multiple independent outcomes. JSON readiness output is written owner-only and refuses to overwrite an existing path.

## Required evidence groups

The gate requires 21 independent checks:

1. exact commit, fresh capture, and deployed HTTPS origin;
2. exact OpenWork/OpenCode runtime and deny-by-default permission proof;
3. sealed and promoted live Sui, Hyperliquid, Bittensor, and public-read-only Polymarket certifications;
4. Market Analyst, Risk Monitor, Transaction Coordinator, and Treasury Coworker journeys, including explicit resource grants, receipts, budgets, pause/revoke, and cross-tenant denial;
5. Sui, Hyperliquid, and Bittensor wallet-airlock journeys plus Polymarket's explicit safe read-only boundary;
6. opt-in encrypted Agent Files and run-evidence publication, exact Walrus readback, Sui certification, connected-wallet-only immutable anchor creation, exact anchor binding, mutation/replay rejection, renewal, expiry, deletion, key destruction, public-object scan, and restore drill;
7. developer quickstart, conformance, certification outcomes, one-use invite, guarded Codex/Claude Code/MCP setup, tenant-safe metering, and published SDK provenance;
8. three to five invite-only design-partner apps;
9. an uninterrupted 48-hour shadow window with every bypass reviewed, no unexplained denial, sequential protocol review, and rollback proof; and
10. hosted two-account, tenant export, host restore, deletion recovery, privacy, capability, accessibility, responsive, performance, and rollback acceptance.

Polymarket transaction preparation is deliberately not represented as available. The release evidence must instead prove discovery, order-book access, region disclosure, absence of transaction authority, and a visible safe deferral. Preparation stays blocked until Matterhorn can bind venue eligibility to the user rather than the server egress location and prove a wallet-only simulation contract.

## Evidence references

Every live outcome group carries an exact content-addressed reference:

```json
{
  "evidence": {
    "path": "reports/sui-certification.md",
    "sha256": "<64 lowercase hexadecimal characters>"
  }
}
```

Paths must be relative to the input manifest, remain inside that directory, name a non-empty regular file no larger than 5 MiB, and match the declared SHA-256. Absolute paths, path traversal, missing files, changed bytes, extra evidence-reference fields, and malformed hashes fail closed.

The manifest is outcomes-only. It rejects fields that could contain credentials, authorization tokens, API keys, passwords, private keys, seed phrases, mnemonics, raw signatures, signed payloads, wallet exports, or session keys. Referenced reports are also scanned for common provider tokens, bearer credentials, cloud access keys, credential-bearing JSON, seed phrases, private keys, and wallet exports. Reports must remain redacted: record hashes, versions, boolean outcomes, bounded timings, and public transaction metadata—not raw prompts, credentials, private wallet data, signatures, or private attachments.

## Current release interpretation

A locally green branch is not a Crypto Coworkers release. `GO` requires operator-controlled live identities and wallets, promoted sealed certifications, real hosted isolation, a complete Walrus/Sui lifecycle, published SDK provenance, design-partner onboarding, and the full shadow window. Until then the correct decision is `NO-GO`, with gateway and coworker production modes remaining `off`.

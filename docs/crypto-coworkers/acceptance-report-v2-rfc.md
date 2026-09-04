# Crypto Coworkers exact-release acceptance reports

Status: proposed; no runtime or release-gate behavior changes are authorized by this document.

## Decision requested

Replace the unstructured report attachments accepted by
`matterhorn.crypto-coworkers-acceptance-evidence.v1` with signed, closed,
exact-release report envelopes. Keep v1 readable for historical diagnosis, but
never allow a v1 packet to produce a strict `GO` after the migration date.

This change is intentionally held behind operator approval because it changes
the release-evidence contract. It does not enable a gateway, coworker, wallet,
Walrus, Sui, signup, or deployment mode.

## Problem

The current gate binds the top-level acceptance manifest to one commit and
hashes every referenced report. Except for the separately structured SDK
provenance report, an individual report is otherwise opaque. The evaluator
does not prove that the report was produced:

- for the manifest's exact commit;
- against the manifest's exact deployed HTTPS origin;
- for the named acceptance group rather than another group;
- during the declared capture window; or
- by an approved first-party acceptance runner.

Consequently, an old, unrelated, or manually substituted report can remain a
valid content-addressed file and be attached to a newer all-true manifest. A
unique path and hash prevent literal reuse inside one packet, but they do not
bind the report's meaning to the release it is claimed to prove.

## Security properties

The replacement contract must provide all of the following:

1. **Exact release** — every report is bound to the full 40-character source
   commit and the normalized deployed application origin.
2. **Exact purpose** — every report is bound to one known acceptance group and
   a closed group-specific outcome schema.
3. **Fresh execution** — every report has a bounded start/end window and is
   evaluated against the manifest capture time. The 48-hour shadow report must
   prove one uninterrupted interval rather than accepting a numeric claim.
4. **Trusted producer** — the report is signed by an explicitly trusted
   acceptance key or carries an independently verifiable CI provenance
   attestation. A self-declared producer name is insufficient.
5. **No bearer authority** — reports contain no tokens, credentials, private
   keys, signatures from user wallets, prompts, private attachments, raw tool
   output, wallet exports, or unrestricted logs.
6. **Independent evidence** — report files, report hashes, run identifiers, and
   producer attestations cannot be shared across groups.
7. **Fail-closed migration** — missing, stale, unsigned, malformed, unknown,
   cross-release, cross-origin, cross-group, or replayed reports produce
   `NO-GO`.

## Proposed contracts

### Acceptance packet

Introduce `matterhorn.crypto-coworkers-acceptance-evidence.v2`. Its top-level
release fields stay compatible with v1, while every evidence reference adds
the expected report group and report version:

```json
{
  "version": "matterhorn.crypto-coworkers-acceptance-evidence.v2",
  "capturedAt": "2026-09-04T12:00:00.000Z",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "environment": "deployed",
  "appUrl": "https://candidate.example/",
  "runtime": {
    "status": "pass",
    "evidence": {
      "version": "matterhorn.crypto-coworkers-acceptance-report.v1",
      "group": "runtime",
      "path": "reports/runtime.json",
      "sha256": "<64 lowercase hexadecimal characters>"
    }
  }
}
```

The packet continues to carry the closed boolean summary used by the operator
dashboard. The evaluator derives `GO` only when the corresponding signed report
contains the same exact outcomes; disagreement fails closed.

### Report envelope

Introduce `matterhorn.crypto-coworkers-acceptance-report.v1`:

```json
{
  "version": "matterhorn.crypto-coworkers-acceptance-report.v1",
  "group": "runtime",
  "release": {
    "commit": "0123456789abcdef0123456789abcdef01234567",
    "appOrigin": "https://candidate.example",
    "environment": "deployed"
  },
  "window": {
    "startedAt": "2026-09-04T11:50:00.000Z",
    "completedAt": "2026-09-04T11:55:00.000Z"
  },
  "producer": {
    "kind": "matterhorn_acceptance_runner",
    "runnerVersion": "<exact repository version>",
    "runId": "<random non-secret identifier>"
  },
  "outcomes": {
    "permissionDenyByDefault": true
  },
  "artifacts": [
    {
      "kind": "redacted_result",
      "sha256": "<64 lowercase hexadecimal characters>"
    }
  ],
  "attestation": {
    "algorithm": "ed25519",
    "keyId": "<configured acceptance key id>",
    "signature": "<base64url signature over canonical unsigned envelope>"
  }
}
```

All objects are closed. Strings, arrays, timestamps, outcome counts, artifact
counts, and byte sizes are bounded. Outcome keys are selected from the existing
group-specific acceptance schema; a report cannot invent a new success field.

The canonical signature payload includes every field except `attestation`,
using the same deterministic canonical-JSON rules as the Crypto App Gateway.
The verifier accepts only Ed25519 keys in an operator-managed acceptance
keyring. Signing keys remain outside source, environment snapshots, browser
configuration, provider context, logs, and report files.

CI-produced reports may later use a separately versioned Sigstore/GitHub OIDC
attestation. They must not be treated as equivalent until issuer, repository,
workflow, ref, commit, reusable-workflow identity, and transparency proof are
all verified by code.

## Time and replay rules

- `startedAt` must not be after `completedAt`.
- `completedAt` must not be in the future beyond the existing one-minute clock
  tolerance.
- A report must be no older than the group-specific maximum at evaluation.
- Its interval must end no later than the packet's `capturedAt` plus clock
  tolerance.
- Non-shadow reports retain the current 12-hour maximum age.
- The shadow report must contain `startedAt`, `completedAt`, and an
  uninterrupted-duration proof of at least 48 hours. Its completion must still
  fall inside the release packet's freshness window.
- `runId`, report hash, and attestation signature must be unique across the
  packet. Reuse fails closed even if paths differ.

## URL and commit binding

- Store and compare `appOrigin`, not a path-bearing workspace URL.
- Normalize with the existing public-HTTPS checks.
- Reject credentials, query, fragment, non-default ports, literal IPs, local
  names, HTTP, redirects used as identity, and origin aliases.
- Require the report commit, packet commit, CLI `--expected-commit`, deployed
  backend build header, and deployed frontend build identifier to be identical.
- The report producer records only the normalized origin. Account, workspace,
  session, wallet, and user identifiers stay out of acceptance reports.

## Migration and rollback

1. Add v2 parsing, canonical signing, verification, fixtures, and tests without
   changing the v1 evaluator.
2. Add `template --version v2`; make new templates v2 only after QA passes.
3. Run v1 and v2 against the same non-production candidate and compare every
   outcome.
4. Change `--strict` so v1 always returns `NO-GO` with
   `legacy_evidence_unbound`; retain a non-strict v1 diagnostic mode.
5. Update the release workflow and operator runbook to create reports only
   through the first-party runner.
6. Roll back by disabling v2 release promotion, not by accepting v1 as `GO`.
   Runtime modes remain `off` and the last approved candidate remains active.

No existing runtime database or user content needs migration. Existing v1
packets remain readable historical artifacts and are never rewritten.

## Required tests

### Contract and unit

- exact commit, origin, environment, group, version, outcome, and time binding;
- canonical signature verification and trusted-key selection;
- malformed signature, wrong key, unknown key, changed byte, changed outcome,
  changed group, changed URL, and changed commit rejection;
- report/path/hash/run/signature reuse rejection;
- closed objects and traversal/size/string/count limits;
- credential, private-key, seed, wallet-signature, prompt, attachment, and raw
  tool-output rejection;
- v1 strict `NO-GO` and non-strict diagnostic behavior.

### Integration

- first-party runner produces a passing report only after its group command
  succeeds;
- a report from another candidate, environment, origin, group, or clock window
  cannot be substituted;
- a failed or partial group cannot be represented as passing;
- frontend/backend build mismatch cannot produce an exact-release report;
- two-account reports contain no tenant identifiers or private content;
- shadow evidence proves one uninterrupted 48-hour interval;
- SDK provenance remains separately verified and cannot be replaced by a
  generic signed report.

### Full gate

- acceptance contract tests;
- secret scan and dependency audit;
- app/server type checks and full test suites;
- complete ten-stage Matterhorn platform safety gate;
- generation and evaluation of one all-pending v2 packet;
- adversarial corpus showing every substitution returns `NO-GO`.

## Acceptance criteria for implementation

- No opaque report can contribute to strict `GO`.
- Every contributing report is exact-commit, exact-origin, exact-group,
  time-bound, independently hashed, and cryptographically authenticated.
- The evaluator never prints report contents or signing material.
- The v2 template is owner-only, no-overwrite, and pending by default.
- The migration cannot accidentally enable any production runtime mode.
- All focused and full safety tests pass before a review-only PR is opened.


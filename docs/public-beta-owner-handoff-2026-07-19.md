# Matterhorn Desks Public Beta Owner Handoff - 2026-07-19

## Current Decision

**Local engineering: green. Public Beta: NO-GO pending immutable-candidate and
external-owner evidence.**

The current branch is `codex/product-hunt-hardening-2026-07-21` at tracked base
`05bde6c446e75edb330f5add04e02d0428689790`. The release-hardening source is
still an intentionally dirty multi-agent working tree and must not be described
as an immutable release candidate.

No preserve-only runtime, note, scratch, or QA-report path may be staged,
deleted, renamed, or copied into the release.

## Work Completed During The July 19 Hardening Pass

- Added a resumable public-beta candidate certifier with redacted logs,
  per-stage timeouts, source-stability detection, evidence digests, and strict
  dirty-tree behavior.
- Added automatic partial public-beta launch evidence and an exact
  machine-readable 30-gate readiness report.
- Corrected the certifier's Electron typecheck to use the app workspace's
  pinned TypeScript installation.
- Fixed repeat desktop builds on macOS by clearing extended attributes from the
  rebuilt Automation Helper before ad-hoc signing.
- Added failure, timeout, unsafe URL, redaction, source-fingerprint,
  resume-integrity, and evidence-generation tests.
- Added a deterministic candidate manifest that hashes every reviewable path,
  assigns it to one of seven launch buckets, and fails on protected staging,
  unexpected HEAD, or unclassified source.
- The current consolidation snapshot contains 399 candidate-review paths, zero
  staged candidate paths, zero staged protected paths, and zero unclassified
  paths. Preserve-only filenames remain omitted.
- Added the certifier contract to the complete platform safety gate.

The final fresh local certification for this source state is written under:

```text
qa-reports/public-beta/candidate-local-2026-07-19-final-v2/
```

Generated QA evidence remains preserve-only.

## Morning Release Sequence

### 1. Consolidate One Candidate

1. Assign reviewers for every candidate-review bucket.
2. Review the generated manifest, including every file hash, across:
   tests and release documentation; release engineering; public web and
   security; wallet and market safety; runtime and recovery; UI and
   accessibility; branding and product truth.
3. Run the scope inventory and manifest guards.
4. Stage only reviewed source, tests, and current release documentation.
5. Re-run both guards and confirm staged protected and unclassified paths
   remain zero.
6. Create one reviewed commit and one stable candidate tag.
7. Revoke and rotate every credential exposed outside the production secret
   store.

Commands:

```bash
pnpm release:scope-inventory -- --strict
pnpm release:candidate-manifest -- \
  --output-dir qa-reports/public-beta/reviewed-candidate-manifest \
  --expected-head "$(git rev-parse HEAD)" \
  --strict
pnpm release:secret-scan
git diff --check
```

The candidate digest is intentionally read from the generated manifest rather
than copied into a source document: source documentation is itself part of the
hashed candidate. Reviewers must bind approval to the digest in
`release-candidate-manifest.json`.

### 2. Certify The Immutable Commit

Restart the app and run:

```bash
pnpm certify:public-beta -- \
  --no-resume \
  --output-dir qa-reports/public-beta/immutable-candidate \
  --app-url <candidate-app-url> \
  --strict \
  --json
```

Expected local decision:

```text
LOCAL-GREEN-OWNER-GATES-PENDING
```

Any other result is a stop-ship condition.

### 3. Deploy And Prove Web Production

The release owner must provide:

- exact candidate SHA and stable tag;
- production HTTPS;
- authenticated same-origin API and engine routing;
- exact-origin CORS;
- CSP and all required security headers;
- deployed commit identity;
- production health, errors, latency, and provider-failure monitoring.

Run:

```bash
pnpm smoke:product-hunt-deployment -- \
  --app-url <production-app-url> \
  --server-url <production-api-url> \
  --expected-commit <40-character-sha> \
  --strict
```

### 4. Prove Desktop Distribution

The desktop release owner must attach evidence for:

- Developer ID signature;
- notarization;
- app and DMG staples;
- checksums bound to the exact candidate;
- Gatekeeper verification;
- clean install;
- update and reinstall;
- public download resolving to the exact signed candidate.

Unsigned local artifacts are not public-release evidence.

### 5. Complete Real Integration Acceptance

Use funded testnet or minimal-risk accounts only:

- MetaMask and Coinbase connect, reject, approve, receipt, reload, and
  disconnect;
- Phantom/Sui connect, reject and approve handoff, receipt, reload, and
  disconnect;
- Hyperliquid testnet approve, reject, receipt, replay block, expiry block,
  limit block, kill-switch block, and disconnect;
- every visible OAuth connector connect, cancel, reload, safe tool invocation,
  redacted failure, and disconnect;
- new-user, returning-user, and cross-workspace authorization journeys.

Hide or label `Coming soon` for any visible connector that cannot pass.

### 6. Complete Operations And Launch Approval

Attach:

- production-shaped backup and restore evidence;
- rollback between two immutable commits;
- alert-delivery proof;
- approved privacy, terms, and support links;
- public-beta support owner and response channel;
- staffed launch room and incident escalation owner.

Then complete `launch-evidence.local.json` without adding credentials and run:

```bash
node scripts/launch-channel-readiness.mjs \
  --channel public-beta \
  --evidence <completed-evidence.json> \
  --strict \
  --json
```

Only a fresh `GO` report tied to the exact deployed and signed commit authorizes
public launch.

## Owner Boundaries

The local agent cannot truthfully complete production deployment, account-based
wallet or OAuth acceptance, Apple Developer signing/notarization, legal
approval, monitoring alert delivery, or staffing. Those are owner-controlled
release gates, not software TODOs.

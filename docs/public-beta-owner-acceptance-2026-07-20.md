# Matterhorn Desks Public Beta Owner Acceptance

## Decision Rule

Public Beta is authorized only when this command returns `GO` for the exact
deployed, signed candidate:

```bash
pnpm public-beta:owner-acceptance -- \
  --input qa-reports/public-beta/owner-input.json \
  --output-dir qa-reports/public-beta/final-owner-acceptance \
  --strict \
  --json
```

The command reads evidence and writes a consolidated decision. It does not
deploy, connect wallets, charge money, sign an application, rotate a credential,
or approve legal copy. A missing, stale, local-only, mismatched, or
credential-bearing input is a blocker.

Start from
[`docs/public-beta-owner-acceptance.example.json`](public-beta-owner-acceptance.example.json).
Keep the completed input and all generated QA evidence outside the release
commit.

Set `releaseSurface` explicitly. Use `web` for a web-only Public Beta or
`web-and-desktop` when the same release also publishes downloadable desktop
artifacts. The strict default is `web-and-desktop`. A web release still requires
the desktop build, typecheck, and trust-boundary contracts; it omits only the
signed/notarized distribution, clean-install, and public-download gates.

## What Engineering Has Automated

The release flow now verifies all of the following in one place:

- the candidate certification report is intact, immutable, stable, clean, and
  bound to a full commit SHA;
- an annotated release tag resolves to that exact commit;
- deployment HTTPS, commit identity, same-origin routing, exact-origin CORS,
  CSP, HSTS, and other security headers pass;
- monitoring, alert delivery, workspace restore, encrypted full user-data
  recovery, SQLite integrity, and rollback evidence pass;
- deployed new-user and returning-user journeys pass;
- MetaMask, Coinbase Wallet, Phantom/Sui, and Hyperliquid testnet acceptance
  pass;
- the tested OAuth connector set exactly matches the public allowlist;
- for a `web-and-desktop` release, desktop Developer ID signing, notarization,
  stapling, Gatekeeper, archive integrity, checksums, clean install, update,
  reinstall, and public download pass;
- legal, support, launch staffing, and exposed-key rotation are explicitly
  approved for every release surface;
- every report is fresh and bound to one candidate;
- evidence objects reject credential- and signing-material fields.

The platform safety gate runs the owner-acceptance contract test. This proves
the gate behavior, not the owner-operated production facts.

## Inputs Required From The Release Owner

### 1. Production Deployment

Provide:

- the production application HTTPS URL;
- the production API HTTPS URL;
- the exact allowed application origin;
- access to the deployment project or a deployment of the exact candidate;
- DNS and TLS control if the public hostname is not already live.

Run:

```bash
pnpm smoke:product-hunt-deployment -- \
  --app-url "https://<public-app-host>" \
  --server-url "https://<public-api-host>" \
  --allowed-origin "https://<public-app-host>" \
  --expected-commit "$(git rev-parse HEAD)" \
  --json-output qa-reports/public-beta/owner/deployment.json \
  --strict
```

Do not provide deployment tokens in the evidence file or chat. Put them in the
deployment platform's secret store.

### 2. Credential Rotation

Revoke the previously shared Cudos key and every other credential that has
appeared outside the approved secret store. Create replacements only in the
production secret manager or CI secret store.

Provide a short sanitized report containing:

- which systems were reviewed;
- confirmation that old credentials were revoked;
- confirmation that replacements live only in the approved secret store;
- the security owner and review time.

Do not include old or new credential values.

### 3. Monitoring And Recovery

Provide:

- an HTTPS monitoring dashboard;
- health, error-rate, latency, and provider-failure signals;
- one successful alert-delivery test and the staffed destination;
- production-shaped workspace backup and separate-target restore evidence;
- encrypted full user-data backup and restore evidence covering notes, memory,
  outputs, task/evidence state, and chat history;
- SQLite integrity and file-digest verification;
- a rollback drill between two immutable commits and a named rollback owner.

Evaluate the sanitized input:

```bash
pnpm gate:product-hunt-operations -- \
  --evidence qa-reports/public-beta/owner/operations-input.json \
  --json-output qa-reports/public-beta/owner/operations-readiness.json \
  --strict \
  --json
```

Use
[`docs/product-hunt-operations-evidence.example.json`](product-hunt-operations-evidence.example.json)
as the input shape.

### 4. Deployed Users, Wallets, And OAuth

Provide two separate test identities:

- one new user;
- one returning user.

Provide test devices/accounts:

- MetaMask on Base Sepolia or another explicitly approved non-production test
  path;
- Coinbase Wallet on the same approved test path;
- Phantom with Sui testnet enabled;
- a minimal-risk Hyperliquid testnet account.

For each wallet, record outcomes only. Never record a seed phrase, private key,
wallet export, raw signature, or signed payload.

Provide OAuth consent credentials for each connector intended to be public. If
a connector cannot pass connect, reload, safe tool call, revoked-account
handling, and disconnect, remove it from the public allowlist and keep it
hidden.

Evaluate:

```bash
pnpm gate:product-hunt-acceptance -- \
  --evidence qa-reports/public-beta/owner/external-acceptance-input.json \
  --expected-oauth "<comma-separated-public-connector-ids>" \
  --json-output qa-reports/public-beta/owner/external-acceptance-readiness.json \
  --strict \
  --json
```

Use
[`docs/product-hunt-acceptance-evidence.example.json`](product-hunt-acceptance-evidence.example.json)
as the input shape. An empty public OAuth allowlist is valid and preferable to
an untested visible connector.

### 5. macOS Signing And Distribution

Provide through local Keychain or CI secrets, never through evidence or chat:

- Apple Developer team access;
- a valid Developer ID Application identity;
- notarization credentials;
- the public download host.

Build the exact candidate, sign and notarize it, then run:

```bash
pnpm desktop:public-release-verify -- \
  --dist-dir apps/desktop/dist-electron \
  --expected-version "$(node -p "require('./apps/desktop/package.json').version")" \
  --source-commit "$(git rev-parse HEAD)" \
  --json-output qa-reports/public-beta/owner/desktop-public-release.json \
  --strict \
  --json
```

On a clean macOS user profile, verify install, first launch, update, reinstall,
and removal. Upload the DMG/ZIP and verify the downloaded SHA-256 matches the
desktop report.

### 6. Legal, Support, And Launch Staffing

Provide:

- approved public Privacy, Terms, and Support HTTPS URLs;
- the legal approver and approval time;
- a public support URL, named owner, and response target;
- a launch-room URL;
- named incident commander, rollback owner, security owner, and support owner.

Names may be internal aliases in the local QA report. Do not commit personal
contact details.

## Final Input Assembly

Copy the example input to an ignored QA location and fill only sanitized
references and outcomes:

```bash
cp docs/public-beta-owner-acceptance.example.json \
  qa-reports/public-beta/owner-input.json
```

Set:

- `commit` to `git rev-parse HEAD`;
- `tag` to the annotated candidate tag;
- `releaseSurface` to the exact declared launch surface;
- `capturedAt` to the current ISO timestamp;
- `expectedOauthConnectors` to the exact public allowlist;
- each report path to an evaluated report, not raw credentials;
- each manual section to `pass` only after its attached evidence exists.

Then run the decision command at the top of this document.

Expected launch result:

```text
Matterhorn Public Beta owner acceptance: GO
```

Any `NO-GO`, missing report, stale timestamp, checksum mismatch, commit
mismatch, tag mismatch, or secret-shaped field is a stop-ship condition.

## Release Boundary

After a final `GO`:

1. push the exact release commit and annotated tag;
2. verify the production deployment still reports that commit;
3. for `web-and-desktop`, verify the public download checksum again;
4. keep the launch room staffed;
5. retain the generated owner-acceptance and readiness reports as the launch
   record.

No feature work may be added after owner acceptance. Any code change creates a
new candidate and requires recertification.

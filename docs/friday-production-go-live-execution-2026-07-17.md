# Friday Production Go-Live Execution - 2026-07-17

Use this sequence to turn the verified Matterhorn Work code candidate into a
public production release. Do not compress stages or publish from local
unsigned artifacts.

## Wednesday - Close Operator Inputs

1. Put Stripe test, OpenAI image, Walrus, Sui package, and Apple signing values
   in the deployment/GitHub secret managers. Never paste them into chat, docs,
   commands captured by QA, or repository files.
2. Keep Stripe live charging disabled and Sui on testnet.
3. Deploy the candidate behind the intended HTTPS host with exact-origin CORS.
4. Run the strict production probe. It must move from 12/15 to 15/15.
5. Complete MetaMask, Coinbase Wallet, and Phantom/Sui real-device acceptance.
6. Decide whether Matterhorn Cloud and generated-media publishing are in the
   launch promise. Unproven capabilities stay disabled and are described as
   operator setup or not included.

Required deployment variables are defined in `.env.example`; the Apple release
secrets are defined in `.github/workflows/release-macos-aarch64.yml`.

## Thursday - Freeze And Prove The Candidate

1. Merge the release PR only after every required PR check passes.
2. Create one stable candidate commit with matching app, desktop, server,
   orchestrator, and router versions.
3. Build deterministic sidecar manifests using the candidate commit timestamp.
4. Run all app/server tests, typechecks, build, dependency audit, platform
   safety, production API readiness, release review, strict responsive audit,
   and two-user smoke.
5. Build signed and notarized macOS DMG/ZIP assets in CI. Build Linux and Windows
   assets if they are in the public promise.
6. Install on a clean Mac user profile. Verify launch, Gatekeeper, updater,
   file permissions, microphone permission, deep links, first-run recovery,
   and full uninstall/reinstall behavior.
7. Create a draft GitHub release only. Do not publish it.

## Friday - Launch Room

1. Freeze code, deployment config, pricing, package IDs, and release notes.
2. Rerun the complete gate from the exact stable tag.
3. Verify production health, HTTPS, exact CORS, logs/alerts, support export,
   data export/delete, backups, and rollback.
4. Verify the draft assets, checksums, signatures, notarization ticket, updater
   manifests, and clean-install evidence.
5. Run one new-user and one existing-user journey on the deployed URL.
6. Publish only after the readiness ledger has no open stop-ship row.
7. Monitor errors, provider latency, task completion, billing webhooks, wallet
   rejection/approval behavior, and support channels during the launch window.

## Required Commands

```bash
# Dependencies and complete platform gate
pnpm audit --prod --audit-level=low
pnpm test:matterhorn-platform-safety

# Full suites and build
bun test apps/app/tests/
pnpm --filter matterhorn-work-server test
pnpm --filter @matterhorn-work/app exec tsc -p tsconfig.json --noEmit
pnpm --filter matterhorn-work-server exec tsc -p tsconfig.json --noEmit
pnpm build

# Production backend and service readiness
node scripts/product-readiness-smoke.mjs \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --workspace-id "$MATTERHORN_WORKSPACE_ID" \
  --require-production --include-generated-media-flow --strict --json

# Deterministic sidecars and release consistency
SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)" \
  pnpm --filter matterhorn-work-orchestrator build:sidecars
SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)" \
  node scripts/release/review.mjs --strict --json

# Packaged desktop evidence
pnpm desktop:release-doctor -- --artifact-dir "$MATTERHORN_RELEASE_ARTIFACT_DIR" --strict --json
pnpm smoke:desktop-packaged-clean-profile -- --artifact-dir "$MATTERHORN_RELEASE_ARTIFACT_DIR"
```

Run the repository's strict full-platform browser audit and product smoke
against both launch users using the final deployed URL. Archive summaries and
screenshots under a new `qa-reports/friday-production-go-live-2026-07-17/`
subdirectory; do not overwrite historical evidence.

## Release Credentials

The release workflow requires these GitHub secrets for public macOS assets:

- `APPLE_NOTARY_API_KEY_P8_BASE64`;
- `APPLE_NOTARY_API_KEY_ID`;
- `APPLE_NOTARY_API_ISSUER_ID`;
- `APPLE_CODESIGN_CERT_P12_BASE64`;
- `APPLE_CODESIGN_CERT_PASSWORD`.

The production service secret manager must provide the configured Stripe,
OpenAI, Walrus, and Sui values listed in `.env.example`.

## Rollback

1. Stop publish if any gate fails before release publication.
2. If a deployed regression appears, route traffic to the last known-good
   deployment and disable affected provider, billing, wallet, or publishing
   capabilities with truthful status copy.
3. Never bypass entitlement, signing, approval, CORS, secret-redaction, or
   external-signer controls to recover service.
4. Preserve logs and redacted support reports, open a severity-ranked incident,
   and ship a new reviewed commit rather than mutating release assets in place.

## Final Sign-Off

- Engineering: exact commit, tests, build, safety, deployment, and rollback.
- Security: dependency audit, secret handling, auth/CORS, data controls, signed
  packages, and wallet boundaries.
- Product/UX: stable copy, complete journeys, disabled-state truth, responsive
  behavior, accessibility, and support paths.
- Operations: provider credentials, Stripe webhooks, monitoring, backups,
  support coverage, and launch-room owner.

The launch owner records GO only after all four sign-offs and every row in
`friday-production-go-live-readiness-2026-07-17.md` is green.

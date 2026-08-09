# Matterhorn Desks Public Beta Candidate Certification

Decision: **LOCAL-GREEN-OWNER-GATES-PENDING**

- Captured: 2026-08-08T04:59:42.222Z
- Branch: `detached`
- Commit: `4a6bfe3a1780a96fd2f1456916753818cd3d34d8`
- Dirty paths: 0
- Preserve-only paths: 0
- Staged paths: 0
- Source stable during run: YES
- Local engineering gates: PASS
- Immutable candidate: YES
- Public-beta channel gate: NO-GO
- Public-beta gates: 10 passed, 23 blocked, 0 expired
- Public launch ready: NO

## Local Gates

| Gate | Result | Duration | Evidence |
|---|---|---:|---|
| Protected-path and dirty-tree inventory | PASS | 93 ms | `logs/scope-inventory.log` |
| Hashed release-candidate manifest | PASS | 146 ms | `logs/candidate-manifest.log` |
| Source secret-pattern scan | PASS | 144 ms | `logs/secret-scan.log` |
| Locked dependency vulnerability audit | PASS | 427 ms | `logs/dependency-audit.log` |
| Complete app test suite | PASS | 1223 ms | `logs/app-tests.log` |
| Complete server test suite | PASS | 11187 ms | `logs/server-tests.log` |
| App TypeScript typecheck | PASS | 12367 ms | `logs/app-typecheck.log` |
| Server TypeScript typecheck | PASS | 2823 ms | `logs/server-typecheck.log` |
| Electron bridge TypeScript typecheck | PASS | 721 ms | `logs/electron-typecheck.log` |
| Production web, server, and desktop build | PASS | 64846 ms | `logs/production-build.log` |
| Complete Matterhorn platform safety gate | PASS | 15157 ms | `logs/platform-safety.log` |

## External Owner Gates

- **Release owner:** Production HTTPS, authenticated same-origin API and engine routing, exact-origin CORS, security headers, and deployed commit identity.
- **Desktop release owner:** Signed, notarized, and stapled macOS artifacts with clean-install, update, Gatekeeper, and rollback evidence.
- **Integration owner:** Real MetaMask, Coinbase, Phantom/Sui, Hyperliquid testnet, and every visible OAuth connector acceptance.
- **Security owner:** Deployed two-user, returning-user, and cross-workspace authorization acceptance.
- **Operations owner:** Alert delivery, backup and restore, rollback, support, legal, incident ownership, and staffed launch-room evidence.
- **Security owner:** Rotate every credential exposed outside the approved production secret store before launch.

## Exact Channel Blockers

- `scope.freeze`: Launch scope and deferred features are frozen
- `ux.local_responsive_acceptance`: Core local journeys pass desktop and mobile acceptance
- `product.deferred_features_hidden`: Deferred services are disabled and truthfully hidden
- `release.stable_tag`: The public candidate is built from one immutable stable tag
- `security.credential_rotation`: Every exposed or shared credential is revoked and replacements live only in approved secret stores
- `deployment.https`: The public web build is deployed behind production HTTPS
- `deployment.exact_origin_cors`: Production CORS allows only intended origins
- `deployment.security_headers`: CSP and production security headers pass
- `deployment.monitoring`: Health, errors, latency, and provider failures are monitored
- `operations.backup_restore`: Backup and restore are proven on production-shaped data
- `operations.rollback_drill`: A production rollback drill succeeds
- `web.authenticated_same_origin`: Public web uses the authenticated same-origin proxy with no browser bearer credentials
- `web.deployed_two_user_acceptance`: New-user and returning-user deployed web journeys pass
- `wallet.metamask_coinbase`: MetaMask and Coinbase Wallet acceptance passes
- `wallet.phantom_sui`: Phantom Sui connect and reject/approve handoff acceptance passes
- `wallet.hyperliquid_testnet`: Hyperliquid testnet reject, approve, receipt, replay, expiry, limit, and kill-switch acceptance passes
- `connectors.visible_oauth`: Every visible OAuth connector passes connect, reload, tools, and disconnect
- `desktop.signed_notarized`: Public macOS assets are signed, notarized, stapled, and checksum-verified
- `desktop.clean_install`: The signed desktop app passes clean-install, update, and reinstall acceptance
- `distribution.public_download`: The public desktop download resolves to the exact signed candidate
- `product.public_copy_and_legal`: Public copy, privacy policy, terms, and support links are approved
- `support.public_beta_channel`: A public support channel and response owner are staffed
- `support.launch_room`: Launch-room owners and incident escalation are staffed

This report certifies local engineering evidence only. It never substitutes
fixtures, localhost, unsigned artifacts, or missing human acceptance for
production evidence.

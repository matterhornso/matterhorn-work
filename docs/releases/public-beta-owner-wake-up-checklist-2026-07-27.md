# Matterhorn Desks Public Beta: Owner Wake-Up Checklist

Date: 2026-07-27

## Already Completed By Engineering

- Full app suite: 721 tests passed, 0 failed.
- Complete Matterhorn platform safety gate: 10/10 stages passed.
- Production app, backend, and desktop bridge build passed.
- Production dependency audit passed with no known vulnerabilities.
- Release diagnostics now reject HTML fallback pages and malformed health or
  readiness responses.
- Polymarket execution uses the maintained client while preserving exact
  reviewed-order and wallet-signing boundaries.
- Preserve-only workspace data, notes, outputs, and QA evidence remain excluded
  from release staging.

## Your Actions When You Wake Up

1. **Review the candidate PR**
   - Review PR #834 and approve the final release commit.
   - Do not merge a different SHA than the one named in the final handoff.

2. **Configure and deploy the production web app**
   - Provide the final HTTPS app and API domains.
   - Configure production authentication, same-origin API routing, exact-origin
     CORS, HSTS, CSP, rate limits, logging, backups, and rollback.
   - Set the documented public-beta web environment variables in the production
     secret/configuration store.

3. **Run two-user acceptance**
   - Use two genuinely separate accounts.
   - Verify sign-up, sign-in, sign-out, workspace creation, and strict workspace
     isolation in both directions.

4. **Run controlled wallet and protocol acceptance**
   - MetaMask or Coinbase: connect, cancel, wrong-chain block, approve, receipt,
     reload, and disconnect.
   - Phantom/Sui testnet: connect, reject, approve a transfer preview, receipt,
     reload, and disconnect.
   - Hyperliquid testnet: exact-order review, wallet signature, controlled
     submission, receipt, replay block, expiry block, and disconnect.
   - Polymarket: use an eligible account to verify preparation and the reviewed
     external submission flow.
   - Bittensor: verify unsigned transaction preparation with an external test
     signer.

5. **Approve the unsigned macOS distribution**
   - Install the exact DMG on a clean Mac account.
   - Verify first run, permissions, wallet handoffs, reinstall, and uninstall.
   - Publish the supplied SHA-256 checksum.
   - Publish clear Gatekeeper instructions because Developer ID signing and
     notarization are intentionally waived.

6. **Complete launch operations**
   - Confirm public Privacy, Terms, and Support URLs.
   - Name the launch incident owner and support channel.
   - Confirm production monitoring alerts and rollback access.
   - Give explicit approval to merge and deploy the exact candidate.

## Go / No-Go Rule

Launch only when every owner action above has recorded evidence tied to the
same release commit and downloadable artifact. Any authentication, tenant
isolation, wallet-signing, production security-header, or rollback failure is a
stop-ship issue.

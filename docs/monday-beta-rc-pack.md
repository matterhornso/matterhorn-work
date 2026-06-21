# Matterhorn Work Monday Beta RC Pack

Use this pack before sharing a Monday beta build with test customers. It creates
one evidence folder that ties together UI gates, crypto safety gates, app
typecheck, wellness workflow checks, Bittensor fixture evidence, customer demo
runbooks, the Mac tester artifact, and the desktop first-run doctor.

## Full RC Run

```bash
pnpm --silent beta:monday-rc -- \
  --output-dir "$HOME/Desktop/matterhorn-monday-beta-rc-$(git rev-parse --short=8 HEAD)" \
  --strict \
  --json
```

This writes:

- `matterhorn-monday-beta-rc.json`
- `matterhorn-monday-beta-rc.md`
- `matterhorn-monday-beta-rc.sha256`
- `customer-demo-evidence/`
- `bittensor-beta/`
- `mac-tester-artifact/`
- `matterhorn-desktop-beta-doctor.md`

## Existing Artifact Run

If a Mac tester artifact already exists, reuse it and skip packaging:

```bash
pnpm --silent beta:monday-rc -- \
  --output-dir /tmp/matterhorn-monday-beta-rc \
  --skip-electron-build \
  --artifact-dir "$HOME/Desktop/matterhorn-work-build-<sha>" \
  --strict \
  --json
```

## Planning / CI Dry Run

```bash
pnpm --silent beta:monday-rc -- \
  --output-dir /tmp/matterhorn-monday-beta-rc-dry-run \
  --dry-run \
  --skip-electron-build \
  --json
```

The dry run records the exact commands without executing them. It is useful for
agents and CI shape checks, not for customer handoff. Use `pnpm --silent` when
you need machine-readable JSON, because regular `pnpm` prints a script banner.

## What The Pack Proves

- The customer onboarding, protocol panel, and readiness UI gates are present.
- The React app typechecks before packaging.
- Customer-ready crypto smoke is green.
- Hyperliquid and Polymarket remain preview/external-signer/public-receipt only:
  `Can submit: No`, `Live submission: Off`.
- Bittensor remains non-custodial and external-signer based for actions.
- Wellness remains educational and does not claim diagnosis, prescription,
  treatment, live payments, live email, live hosting/storage, or gated access.
- The Mac tester artifact is hash-bound and checked by the desktop beta doctor.

## Red Lines

Do not put any of the following into command flags, evidence files, fixtures,
screenshots, logs, or customer handoff packets:

- seed phrases
- private keys
- mnemonics
- API secrets
- raw signatures
- signed payloads
- wallet exports
- real customer funds

Matterhorn Work does not sign, submit, custody, or broadcast Hyperliquid or
Polymarket orders in this beta. Any future change to that boundary requires a
separate security review and an explicit execution gate.

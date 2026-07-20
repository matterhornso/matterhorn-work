# Matterhorn Desks Launch RC Pack

Use this pack before sharing a release candidate with test customers. The
legacy command name remains `beta:monday-rc`, but `ready: true` now requires the
full platform safety gate, production backend readiness, a deployed-app browser
smoke, real Bittensor evidence, and packaged desktop checks in one evidence
folder.

For the Wednesday controlled beta, use `--release-profile controlled-beta`.
That profile still runs the strict production probe, but it may accept only the
explicitly excluded blockers `billing.stripe_test`,
`generated_media.platform_setup`, and `generated_media.entitlement`. The report
keeps `productionEvidence.complete: false`, records every accepted exclusion,
requires completed desk results in the browser smoke, and fails on any other
backend or production blocker. The default `production` profile remains fully
strict.

```bash
pnpm --silent beta:monday-rc -- \
  --release-profile controlled-beta \
  --output-dir "$HOME/Desktop/matterhorn-wednesday-beta-rc-$(git rev-parse --short=8 HEAD)" \
  --strict --json
```

Configure the candidate using [Production launch configuration](production-launch-configuration.md)
and the root `.env.example` before running this pack.

## Baseline Preflight

```bash
pnpm --silent beta:monday-rc -- \
  --output-dir "$HOME/Desktop/matterhorn-monday-beta-rc-$(git rev-parse --short=8 HEAD)" \
  --json
```

This executes all baseline stages and writes the Bittensor fixture blockers into
the report. It is intentionally `NOT READY`; use the real-evidence command below
for the customer-shareable RC.

This writes:

- `matterhorn-monday-beta-rc.json`
- `matterhorn-monday-beta-rc.md`
- `matterhorn-monday-beta-rc.sha256`
- `customer-demo-evidence/`
- `bittensor-beta/`
- `mac-tester-artifact/`
- `matterhorn-desktop-beta-doctor.md`

## Existing Artifact Run

If a Mac tester artifact already exists, reuse it and skip packaging. This
remains a strict gate and will exit nonzero until the real Bittensor evidence
arguments shown below are also supplied:

```bash
pnpm --silent beta:monday-rc -- \
  --output-dir /tmp/matterhorn-monday-beta-rc \
  --skip-electron-build \
  --artifact-dir "$HOME/Desktop/matterhorn-work-build-<sha>" \
  --strict \
  --json
```

To include authenticated packaged deep-link validation, pass a test backend and
client token. A release decision also requires the workspace and deployed app
URL. The token is redacted from commands and captured stage output:

```bash
pnpm --silent beta:monday-rc -- \
  --output-dir /tmp/matterhorn-monday-beta-rc \
  --skip-electron-build \
  --artifact-dir "$HOME/Desktop/matterhorn-work-build-<sha>" \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --workspace-id "$MATTERHORN_WORKSPACE_ID" \
  --app-url "$MATTERHORN_APP_URL" \
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

`ready` means the release candidate itself is shareable for the selected
profile. In the production profile it cannot be true when the production
backend probe, deployed browser smoke, platform safety gate, Bittensor evidence,
or packaged desktop checks are missing or fail. In the controlled-beta profile,
production services remain disabled and only the allowlisted exclusions above
may be accepted. A dry run
is never ready, and a child evidence command that exits successfully but
reports `ready: false` fails the outer pack. `automationPassed` reports only
whether invoked commands completed without process or semantic failures; it is
not a release approval.

The default Bittensor packet stage uses fixture mode to validate packet shape,
so it intentionally leaves the RC `NOT READY`. Replace it with the real evidence
flow in `docs/bittensor-beta-go-live-runbook.md` before customer release.

After producing the real evidence files, pass them into the RC pack directly:

```bash
pnpm --silent beta:monday-rc -- \
  --output-dir /tmp/matterhorn-monday-beta-rc \
  --bittensor-beta-gate /tmp/matterhorn-bittensor-beta.json \
  --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
  --bittensor-evidence-verify /tmp/matterhorn-bittensor-evidence-verify.json \
  --bittensor-live-public-qa /tmp/matterhorn-live-public-qa/matterhorn-live-public-qa.json \
  --bittensor-browser-qa /tmp/matterhorn-bittensor-browser-qa.md \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --workspace-id "$MATTERHORN_WORKSPACE_ID" \
  --app-url "$MATTERHORN_APP_URL" \
  --strict --json
```

The beta gate, customer smoke, evidence verification, and browser QA inputs are
required together. Live public-data QA is optional before limited beta and is
still reported as a warning when absent.

## What The Pack Proves

- The customer onboarding, protocol panel, and readiness UI gates are present.
- The complete Matterhorn platform safety gate passes on the candidate SHA.
- The running backend passes the production-required readiness probe, including
  Billing and the full generated-media publishing path.
- The deployed customer app passes the end-to-end product browser smoke.
- The React app typechecks before packaging.
- Customer-ready crypto smoke is green.
- Hyperliquid and Polymarket remain preview/external-signer/public-receipt only:
  `Can submit: No`, `Live submission: Off`.
- Bittensor remains non-custodial and external-signer based for actions.
- Wellness remains educational and does not claim diagnosis, prescription,
  treatment, live payments, live email, live hosting/storage, or gated access.
- The Mac tester artifact is hash-bound and checked by the desktop beta doctor.
- The packaged `.app` launches from isolated user data, protects its loopback
  control bridge, opens the welcome flow, and navigates across General, MCP,
  AI provider, Appearance, and Session surfaces without updater failure noise.
- The packaged app manifest declares the `matterhorn-work` URL scheme.
- When server credentials are supplied, Electron receives a real
  `matterhorn-work://connect-remote` link through macOS LaunchServices, creates
  the remote workspace, and opens its session without exposing the token in evidence.
- The Electron-only Browser rail opens, loads the supplied backend's loopback
  health page, reports a native tab, and closes without leaving the view attached.

The pack does not prove Developer ID signing, notarization, Gatekeeper behavior
on another Mac, a published updater channel, or default protocol association
from Finder/Safari on a clean machine.

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

Matterhorn Desks does not sign, submit, custody, or broadcast Hyperliquid or
Polymarket orders in this beta. Any future change to that boundary requires a
separate security review and an explicit execution gate.

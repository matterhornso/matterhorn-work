# Matterhorn Desks Public Beta 0.13.15 RC9

Date: 2026-07-22

Status: source candidate frozen; owner acceptance and deployment certification pending

## Baseline

- Branch: `codex/public-launch-acceptance-rc4`
- Parent commit: `263d6f15a32fee56be6aa2e3fce8e2bae7d2d45a`
- Parent tag: `v0.13.15-public-beta-rc.8`
- Source audit: `qa-reports/independent-audit-2026-07-22.md`
- Remediation closure: `qa-reports/independent-audit-remediation-closure-2026-07-22.md`

The QA reports above remain local release evidence. They are not source inputs
and are intentionally excluded from the release commit by the protected-path
guard.

## Candidate Delta

RC9 freezes the source and focused tests for the July 22 independent-audit
remediation plus the approved customer-facing brand and copy changes.

### Wallet and transaction safety

- fail closed when an ERC-20 transfer or token-input swap cannot be valued in
  USD against workspace limits;
- require a successful public-client simulation in the shared reviewed-send
  path before any wallet request;
- contain keyboard focus inside transaction approval dialogs and restore focus
  to the opener after close;
- add focused regression coverage for unknown-value transfers, simulation
  failures, approval focus, and reviewed send behavior.

### Backend integrity and bounded data access

- keep generated-image allowance consumption durable after user-visible media
  is deleted;
- count mint and listing previews against append-only audit evidence;
- read recent audit and task-event records with a bounded reverse JSONL reader;
- require writable workspaces and collaborator scope for protocol watch and
  Bittensor baseline mutations;
- cover the durable-usage, large-log, malformed-tail, and mutation-scope paths.

### MCP and product-truth hardening

- validate crypto batch shape, dependencies, addresses, calldata, selectors,
  values, and descriptions before returning a non-submittable plan;
- suppress request and payload metadata on wallet and crypto MCP stderr unless
  explicit local debug logging is enabled;
- describe Hyperliquid as research, exposure review, and order preview for the
  public candidate; real-funds execution is not advertised by this source
  candidate;
- keep experimental locales development-only and production copy English-only.

### Brand, interface, and documentation

- apply the Matterhorn ink-and-ice palette to the Settings navigation rail;
- raise identified customer-surface micro-glyph labels to a 10px floor;
- use the approved public sign-in positioning and current Matterhorn Desks
  naming;
- include the website-team Matterhorn Desks content brief;
- remove the unused Solid Router patch after confirming `patchedDependencies`
  is empty.

### Release tooling

- classify intentional patch-file changes as release-engineering inputs in the
  candidate manifest;
- retain a focused manifest regression test so obsolete patch deletion cannot
  become an unclassified release path again.

## Deliberately Excluded

The release commit must not stage, delete, or rewrite:

- `.opencode/package-lock.json`;
- `.matterhorn-work/`;
- `notes/`;
- `outputs/`;
- `qa-reports/`, including screenshots, generated manifests, browser traces,
  logs, and local acceptance evidence.

These paths are preserved as local state. The release scope inventory reports
their aggregate counts without publishing their contents.

## Required Verification Before Commit

```bash
node scripts/release-candidate-manifest.test.mjs

bun test \
  apps/server/src/jsonl-tail.test.ts \
  apps/server/src/generated-media-routes.e2e.test.ts \
  apps/server/src/backend-security.e2e.test.ts \
  apps/app/src/react-app/domains/wallet/state/wallet-store-security.test.ts \
  apps/app/tests/wallet-approval-security-contract.test.ts \
  apps/app/tests/wallet-send-behavior.test.ts \
  apps/app/tests/customer-workflow-templates.test.ts \
  apps/app/tests/launch-language-policy.test.ts \
  apps/app/tests/shared-primitives-ui-contract.test.ts

node packages/matterhorn-work-wallet-mcp/test-security.mjs
node packages/matterhorn-work-crypto-mcp/test-security.mjs
bun run --cwd apps/server typecheck
bun run --cwd apps/app typecheck
pnpm release:secret-scan
pnpm test:matterhorn-platform-safety
```

The strict scope inventory and candidate manifest must pass again after staging
and report zero protected staged paths and zero unclassified candidate paths.

## Promotion Boundary

This commit freezes source; it does not by itself authorize public promotion.
Do not tag or deploy RC9 until owner acceptance covers real MetaMask and Sui
wallet behavior, wrong-chain and cancellation paths, the chosen Hyperliquid
release posture, advertised OAuth connectors, production perimeter and tenant
isolation, and the signed/notarized macOS artifact built from this exact commit.

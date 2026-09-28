# Local preview and QA

Branch: `codex/retro-ui-2026-09-28`. Nothing is deployed. The release flag is
`VITE_MATTERHORN_RETRO_UI=1`; unset/0 retains the incumbent UI and persisted data.

## Public web — read-only visual preview

From the repository root, use the installed pinned pnpm and Bun paths with the
isolated runner (do not forward operator env files or credentials):

```sh
RETRO_QA_PNPM=/Users/abhinavramesh/.cache/node/corepack/v1/pnpm/10.27.0/bin/pnpm.cjs RETRO_QA_BUN=/Users/abhinavramesh/.bun/bin/bun node qa-reports/retro-ui/2026-09-28/run-check.mjs build-web 1
pnpm exec bun apps/app/scripts/retro-public-preview.ts
```

Open the printed loopback URL. `/privacy`, `/terms`, `/security`, `/support` and
`/status` use the production frontend. This preview deliberately has **no
backend**: signup, sign-in, password reset, health checks and authenticated desks
are unavailable. CSP blocks remote connections and the server does not proxy API
calls. Do not treat it as a logged-in testing account or live readiness proof.

The random port avoids replacing existing user previews. Stop with Ctrl+C.

## Real-component browser regressions

```sh
pnpm exec bun test apps/app/scripts/retro-controls.browser.test.ts
RETRO_QA_BROWSER=firefox pnpm exec bun test apps/app/scripts/retro-controls.browser.test.ts
RETRO_QA_BROWSER=webkit pnpm exec bun test apps/app/scripts/retro-controls.browser.test.ts
RETRO_QA_FLAG=1 pnpm exec bun test apps/app/scripts/stm-settings.browser.test.ts
```

This bundles production controls, models, auth/public trust pages, Notes, Memory,
transaction batch review, appearance/privacy settings and hosted integration status,
using an isolated in-memory loopback fixture with fake catalog/note responses.
It does not contact providers, chains, vaults or real accounts. Test model changes
and memory failures are synthetic. It is separate from release acceptance.
STM tests use only disposable sentinel values and an in-memory server: no daemon,
real vault, credentials or migration. Capture files are opt-in under
`RETRO_QA_CAPTURES`; existing STM screenshots are never overwritten by default.
The reflow assertion enlarges root text to200%; it does not emulate browser zoom.
Playwright WebKit is not a claim of full Safari application coverage.

Optional batched screenshots (temporary path, no credentials):

```sh
RETRO_QA_CAPTURES=/private/tmp/matterhorn-retro-captures-2026-09-28 pnpm exec bun test apps/app/scripts/retro-controls.browser.test.ts
```

This captures light/dark at 390/768/1280/1440px and checks overflow. Capturing files
does not mean their visual review or whole-product acceptance is complete.

Composer, desk launcher and actual sidebar fixtures (no signed-in account):

```sh
RETRO_QA_FLAG=1 pnpm exec bun test apps/app/scripts/composer-submit.browser.test.ts
RETRO_QA_FLAG=0 pnpm exec bun test apps/app/scripts/composer-submit.browser.test.ts
```

Set `RETRO_QA_CAPTURES` for the optional24-image matrix. The composer suite
retains the incumbent flag-off assertions and stubs only desktop host policy.
Desk selection records callbacks without starting an agent or sending a prompt.

Run `tests`, `typecheck`, `build`, `build-web`, and `safety-ui` runner stages **sequentially**;
prebuilds share generated package output. The `0|1` argument tests the rollout
flag. Capture/inspection coverage and remaining gaps are in `COVERAGE.md`.
`safety-ui` selects wallet approval, error boundaries/observability and design
contracts; it is not the full platform safety gate. Local HTTP tests need
loopback listener permission; sandbox bind failures are not product failures.

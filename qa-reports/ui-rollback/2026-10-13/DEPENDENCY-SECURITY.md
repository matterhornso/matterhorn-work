# Dependency security remediation — 13 October 2026

Base: `origin/dev` at `ff0fee42b375e3dc58cbc73918d0093fa2eded40`.

## Result

The complete JavaScript lockfile audit initially reported **16 blocking advisories** (2 critical, 7 high, 6 moderate, 1 low). The final audit reports **0 advisories** across **1,201 packages / 1,335 versions**, including development and optional dependencies. No advisories are suppressed, and the low-severity release gate remains unchanged. These are dependency results, **not deployment approval or proof that every platform feature works**.

The Rust example now resolves `quinn-proto` **0.11.19** instead of 0.11.15. The locked example compiles, the resolved-graph policy passes, and cargo-audit reports **zero vulnerability findings** using only the repository's pre-existing `RUSTSEC-2023-0071` exception. The graph policy independently verifies that RSA is unreachable; no new exceptions were added.

## Package changes

| Package | Previous | Selected version |
| --- | --- | --- |
| `@modelcontextprotocol/sdk` | 1.29.0 | 1.31.0 |
| `http-cache-semantics` | 4.2.0 | 4.3.0 |
| `next` | 16.3.6 | 16.3.8 |
| `shadcn` CLI and its `braces`, `micromatch`, `postcss-selector-parser` subtree | 4.6.0 CLI | removed; exact licensed CSS preserved |
| `proxy-addr` | 2.0.7 | 2.0.8 |
| `seroval` | 1.5.6 | 1.6.9 |
| `sharp` | 0.35.4 | 0.35.5 |
| `source-map-js` | 1.2.1 | 1.2.2 |
| `roarr`, only under `global-agent` 3.0.0 | 2.15.4 | 3.3.0 |
| Rust `quinn-proto` | 0.11.15 | 0.11.19 |

Both JavaScript override sources retain the exact pins, including the scoped `global-agent@3.0.0>roarr` override. Generated lockfile changes are these upgrades, the removed CLI subtree and their associated platform/transitive dependencies, not a general dependency refresh. Rust's targeted update also adds `rand_pcg` and updates quinn's existing random-number dependencies.

`http-cache-semantics` 4.3.0 is the maintainer's current release outside the advisory range; do not describe it as proof that a new security fix was implemented. The maintainer [disputes the advisory](https://github.com/kornelski/http-cache-semantics/issues/56). Its documented API requires discarding a response when `storable()` is false. Compatibility tests check that contract, not a new application cache feature.

## Dependencies without a patched leaf release

1. **`braces` 3.0.3**, high: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Former path: `apps/app → shadcn 4.6.0 → fast-glob 3.3.3 → micromatch 4.0.8 → braces 3.0.3`. The unused generator dependency is now removed. The app's only use was its utility stylesheet, now vendored **byte-for-byte**, with the full MIT license and provenance, at `apps/app/src/styles/vendor/shadcn-tailwind.css`. SHA-256: `146941ac3ff65496fdf1cb306e697255328e4dadc7c105d66e36bb031b00f6d6`. This preserves accordion/state variants and scrollbar utilities without installing a generator. This does not remove shadcn-inspired application components.
2. **`sprintf-js` 1.1.3**, moderate: [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). Former path: desktop `electron-builder`/`electron-builder-squirrel-windows → app-builder-lib 26.15.6 → @electron/get 3.1.0 → optional global-agent 3.0.0 → roarr 2.15.4 → sprintf-js 1.1.3`. Upgrade **only** global-agent's logger to `roarr` 3.3.0: its [published release replaces the printf implementation](https://github.com/gajus/roarr/releases/tag/v3.3.0), and it retains the default export, child logger and trace/warn/error contracts used by global-agent. The [v3 breaking change drops Node 8](https://github.com/gajus/roarr/releases/tag/v3.0.0); Matterhorn's Node 24 test environment is unaffected. `sprintf-js` is absent from the final lockfile.

The downloader remains `@electron/get` 3.1.0 and the proxy remains `global-agent` 3.0.0. Rejected alternatives: get v5 changes Got-style download options to Fetch options, potentially dropping builder proxy-agent/timeout behavior; global-agent v4 has unresolved [HTTPS CONNECT/SNI](https://github.com/gajus/global-agent/issues/83) and [URL construction](https://github.com/gajus/global-agent/issues/82) regressions. No proxy or TLS verification behavior was weakened to pass the audit.

## Verification

Executed in the isolated production-PR checkout; no deployment, real model call, external account access, or wallet transaction was involved.

- pnpm 10.27.0 install with frozen lockfile, offline, `--ignore-scripts`: PASS.
- Node **24.20.0**: `node --test scripts/release-dependency-patches.test.mjs scripts/rust-dependency-policy.test.mjs`: **17/17 PASS**.
- `pnpm verify:elliptic-security-patch`: PASS; unchanged upstream commit `04cb6f54ce552b3ebde6be06d6050419e1c7333e`.
- `node scripts/security-workflow-contract.test.mjs`: PASS.
- `node scripts/dependency-bulk-audit.test.mjs`: PASS.
- `node packages/matterhorn-work-ui-mcp/test-browser-actions.mjs`: PASS against SDK 1.31.0; disposable local bridge, tool enumeration and action/confirmation contracts.
- `node scripts/dependency-bulk-audit.mjs --lockfile pnpm-lock.yaml --json`: PASS, **0** advisories; complete lockfile, low threshold.
- `node scripts/rust-dependency-policy.mjs`: PASS (entire locked, all-target resolved graph).
- `cargo check --locked --manifest-path examples/microsandbox-openwork-rust/Cargo.toml --all-targets`: PASS.
- cargo-audit **0.22.2**, installed only in a temporary tool directory: `cargo audit --file examples/microsandbox-openwork-rust/Cargo.lock --ignore RUSTSEC-2023-0071 --json`: PASS, 0 vulnerabilities. RustSec database commit `d5f46becf4d442d460e1fce5e12f2c0f00924868`, 1,308 advisories; 601 locked dependencies.

Rust audit informational warnings remain for `proc-macro-error2` 2.0.1 and `rustls-pemfile` 2.2.0 (unmaintained), plus `chacha20` 0.10.1 and `spin` 0.9.8 (yanked). These were not introduced by the targeted quinn update and do not fail the existing audit policy; do not describe them as resolved.

The package smoke coverage includes URI normalization, brace expansion, Axios redirect/cancellation, Engine.IO supported/unsupported protocols, proxy trust, cacheability, source-map parsing, Seroval round-trip, Sharp image encoding, and the vendored stylesheet's hash/license/import. A child-process loopback fixture verifies Electron proxy bootstrap with logging enabled, proxied downloads, `NO_PROXY` bypass, accepted/rejected checksums, and request timeout. It uses only disposable files and local servers; no real artifact download, signing, or live provider is involved. The Rust graph regression explicitly rejects quinn-proto 0.11.0–0.11.18, including duplicate graph entries.

## Release condition

Re-run the full dependency audit and new-head CI on the published candidate, including frontend build/regression and security jobs. No dependency advisory remains at this observation, but full packaged desktop acceptance and hosted acceptance are separate checks. Do not merge/deploy by bypassing the audit, disabling optional dependency scanning, ignoring an advisory, or changing the severity threshold. Hosted deployment remains the tech team's action.

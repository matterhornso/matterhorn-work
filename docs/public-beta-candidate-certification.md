# Public Beta Candidate Certification

`scripts/public-beta-candidate-certifier.mjs` is the local engineering
certifier for a Matterhorn Desks public-beta candidate. It binds tests, builds,
security checks, and browser acceptance to one source fingerprint and emits
redacted, checksum-backed evidence.

It does not deploy, sign, submit transactions, accept credentials, or replace
human acceptance. A locally green candidate remains `NO-GO` until the
machine-readable public-beta channel gate passes.

## Run It

Against a running local application:

```bash
pnpm certify:public-beta -- \
  --output-dir qa-reports/public-beta/current-candidate \
  --app-url http://127.0.0.1:5207/workspace/<workspace-id>/session \
  --json
```

Without browser acceptance:

```bash
pnpm certify:public-beta -- \
  --output-dir qa-reports/public-beta/current-candidate \
  --skip-browser \
  --json
```

Use `--strict` only for an immutable release candidate. Strict mode exits
nonzero when source is dirty, any local gate fails, source changes during the
run, or the candidate is otherwise not locally certifiable. A successful
strict run ends at `LOCAL-GREEN-OWNER-GATES-PENDING`; the final channel gate
below separately enforces deployment and owner evidence.

## Local Gates

The certifier runs these stages sequentially:

1. protected-path and dirty-tree inventory;
2. hashed release-candidate manifest with seven review buckets;
3. source secret-pattern scan;
4. locked dependency vulnerability audit;
5. complete app suite;
6. complete server suite;
7. app typecheck;
8. server typecheck;
9. Electron bridge typecheck;
10. production web, server, and desktop build;
11. the complete Matterhorn platform safety gate;
12. live customer-flow browser acceptance when `--app-url` is supplied.

Every stage has a bounded timeout. Output is redacted before it is written.
Each log receives a SHA-256 digest in the certification report.

The manifest classifies every candidate path into tests and release
documentation, release engineering, public web and security, wallet and market
safety, runtime and recovery, UI and accessibility, or branding and product
truth. Strict mode blocks protected staged content, unexpected HEAD, and any
unclassified candidate path. Preserve-only filenames are never written to the
manifest.

## Resume Safety

Resume is enabled by default. A passed stage is reused only when:

- its command is unchanged;
- the candidate commit is unchanged;
- the candidate-source content fingerprint is unchanged;
- its evidence log still exists.

Generated files under preserve-only roots such as `qa-reports/` do not
invalidate the candidate fingerprint. A change to tracked or source-like
untracked candidate content does invalidate every affected stage.

Use `--no-resume` for a completely fresh run.

## Decisions

| Decision | Meaning |
|---|---|
| `DRY-RUN` | The execution plan was emitted without running gates. |
| `NO-GO-LOCAL-GATE-FAILED` | At least one local engineering gate failed. |
| `NO-GO-SOURCE-CHANGED-DURING-RUN` | Candidate source changed while evidence was being collected. |
| `LOCAL-GREEN-NOT-IMMUTABLE` | Local gates passed, but the working tree is not an immutable candidate. |
| `LOCAL-GREEN-OWNER-GATES-PENDING` | Local gates passed on an immutable commit; deployment and human evidence are still required. |

The certifier never emits `GO`.

## Evidence

The output directory contains:

- `candidate-certification.json`;
- `candidate-certification.md`;
- `candidate-certification-state.json`;
- `launch-evidence.local.json`;
- `launch-readiness.json`;
- `launch-readiness.md`;
- one redacted log per local stage;
- scope and secret-scan reports;
- `release-candidate-manifest/release-candidate-manifest.json`;
- `release-candidate-manifest/release-candidate-manifest.md`;
- browser evidence when browser acceptance runs.

`launch-evidence.local.json` pre-fills only gates proven by the certifier.
Deployment, signing, wallets, OAuth, two-user authorization, legal, support,
monitoring, and rollback remain blocked until their owners attach fresh
evidence.

## Final Public-Beta Gate

After the source has been consolidated, tagged, deployed, signed, and accepted:

```bash
node scripts/launch-channel-readiness.mjs \
  --channel public-beta \
  --evidence <completed-evidence.json> \
  --strict \
  --json
```

A missing, stale, fixture-backed, or empty evidence item is a blocking
`NO-GO`.

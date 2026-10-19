import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/security.yml", "utf8");

for (const required of [
  "github/codeql-action/init@v4",
  "github/codeql-action/analyze@v4",
  "languages: javascript-typescript",
  "queries: security-extended",
  "actions/dependency-review-action@v4",
  "fail-on-severity: low",
  "rustsec/audit-check@v2.0.0",
  "node --test scripts/rust-dependency-policy.test.mjs",
  "node scripts/rust-dependency-policy.mjs",
  "ignore: RUSTSEC-2023-0071",
  "working-directory: examples/microsandbox-openwork-rust",
  "cargo check --locked --manifest-path examples/microsandbox-openwork-rust/Cargo.toml --all-targets",
  "pnpm release:secret-scan",
  "pnpm --filter @matterhorn-work/crypto-app-sdk build",
  "pnpm test:dependency-bulk-audit",
  "pnpm verify:elliptic-security-patch",
  "pnpm audit:dependencies",
  "pnpm test:release-dependency-patches",
  "request-rate-limit-store.test.ts",
  "pnpm --dir apps/orchestrator test:sidecars",
  "apps/orchestrator/test/runtime-upgrade-state.test.ts",
  "apps/orchestrator/test/router-workspace-request.test.ts",
  "apps/orchestrator/test/router-daemon-error.test.ts",
  "apps/orchestrator/test/package-install.test.mjs",
  "apps/desktop/scripts/verified-opencode.test.ts",
  "pnpm --dir apps/opencode-router build",
  "node --test apps/opencode-router/test/media-store-races.test.mjs",
  "apps/app/tests/message-element.test.ts",
  "apps/app/tests/tool-text.test.ts",
  "apps/app/tests/desk-task-inputs.test.ts",
  "apps/server/src/google-workspace-query.test.ts",
  "apps/server/src/google-workspace-access.test.ts",
  "apps/server/src/google-workspace-access.e2e.test.ts",
  "apps/server/src/google-workspace-launch-gate.test.ts",
  "apps/server/src/skill-hub.test.ts",
  "apps/server/src/image-generation-provider.test.ts",
  "apps/server/src/generated-image-store.test.ts",
  "apps/server/src/generated-media-routes.e2e.test.ts",
  "apps/server/src/opencode-db.test.ts",
  "apps/desktop/electron/migration-write.test.mjs",
  "apps/desktop/electron/ui-control-handler.test.mjs",
  "apps/desktop/electron/ui-control-discovery.test.mjs",
  "apps/opencode-router/test/config-path.test.js",
  "apps/opencode-router/test/messaging-agent-file.test.js",
  "apps/opencode-router/test/media-store.test.js",
  "apps/opencode-router/test/telegram.test.js",
  "apps/opencode-router/test/public-control-error.test.js",
  "apps/opencode-router/test/health-errors.test.js",
  "qa-reports/jev/2026-09-30/local-qa-network.test.mjs",
  "scripts/lib/release-file-snapshot.test.mjs",
  "scripts/release/version-command.test.mjs",
  "scripts/workspace-user-data-recovery-files.test.mjs",
  "packages/stm-credentials/test/adapter.test.mjs",
  "apps/server/src/tokens.test.ts",
  "apps/opencode-router/test/slack.test.js",
  "node scripts/desktop-beta-first-run.test.mjs",
  "node scripts/bittensor-beta-customer-packet.test.mjs",
  "node scripts/market-official-sdk-operator-loop.test.mjs",
  "node scripts/monday-beta-rc-pack.test.mjs",
  "node scripts/release-secret-scan.test.mjs",
  "node scripts/release-candidate-manifest.test.mjs",
  "node scripts/public-beta-owner-acceptance.test.mjs",
  "node scripts/workspace-user-data-recovery.test.mjs",
  "node scripts/workspace-backup-restore-drill.test.mjs",
  "node scripts/bittensor-customer-evidence-bundle.test.mjs",
  "node scripts/bittensor-receipt-check.test.mjs",
  "node scripts/generated-media-production-readiness.test.mjs",
  "node --test scripts/migration/02-validate-migration.test.mjs",
  "node scripts/billing-browser-smoke.test.mjs",
  "node --test scripts/lib/browser-smoke-privacy.test.mjs",
  "node scripts/outputs-browser-smoke.test.mjs",
  "node --test scripts/outputs-browser-smoke-safety.test.mjs",
]) {
  assert.ok(workflow.includes(required), `security workflow must include ${required}`);
}

assert.match(workflow, /schedule:\s*\n\s*- cron:/);
assert.match(workflow, /security-events:\s*write/);
assert.match(workflow, /rust-security:[\s\S]*checks:\s*write[\s\S]*issues:\s*write/);
assert.ok(workflow.indexOf("node scripts/rust-dependency-policy.mjs") < workflow.indexOf("uses: rustsec/audit-check@"));
assert.ok(!workflow.includes("--prefix none 2>/dev/null | grep"), "cargo resolution failures must not be swallowed by a conditional pipeline");

const routerPackage = JSON.parse(readFileSync("apps/opencode-router/package.json", "utf8"));
assert.equal(routerPackage.scripts["test:unit"], "pnpm build && bun test test/*.test.js && node --test test/media-store-races.test.mjs",
  "canonical router tests must retain Bun coverage and the Node-only builtin race fixtures");

console.log("security-workflow-contract tests: PASS");

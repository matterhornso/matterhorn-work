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
  "request-rate-limit-store.test.ts",
]) {
  assert.ok(workflow.includes(required), `security workflow must include ${required}`);
}

assert.match(workflow, /schedule:\s*\n\s*- cron:/);
assert.match(workflow, /security-events:\s*write/);
assert.match(workflow, /rust-security:[\s\S]*checks:\s*write[\s\S]*issues:\s*write/);
assert.ok(workflow.indexOf("node scripts/rust-dependency-policy.mjs") < workflow.indexOf("uses: rustsec/audit-check@"));
assert.ok(!workflow.includes("--prefix none 2>/dev/null | grep"), "cargo resolution failures must not be swallowed by a conditional pipeline");

console.log("security-workflow-contract tests: PASS");

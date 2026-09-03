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
  "cargo tree --locked --target all --manifest-path examples/microsandbox-openwork-rust/Cargo.toml -i rsa",
  "RUSTSEC-2023-0071 is reachable and may not be ignored",
  "ignore: RUSTSEC-2023-0071",
  "working-directory: examples/microsandbox-openwork-rust",
  "cargo check --locked --manifest-path examples/microsandbox-openwork-rust/Cargo.toml --all-targets",
  "pnpm release:secret-scan",
  "pnpm --filter @matterhorn-work/crypto-app-sdk build",
  "pnpm test:dependency-bulk-audit",
  "pnpm audit:dependencies",
  "request-rate-limit-store.test.ts",
]) {
  assert.ok(workflow.includes(required), `security workflow must include ${required}`);
}

assert.match(workflow, /schedule:\s*\n\s*- cron:/);
assert.match(workflow, /security-events:\s*write/);
assert.match(workflow, /rust-security:[\s\S]*checks:\s*write[\s\S]*issues:\s*write/);

console.log("security-workflow-contract tests: PASS");

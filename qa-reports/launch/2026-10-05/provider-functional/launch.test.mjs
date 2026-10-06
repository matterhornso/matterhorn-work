import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const launcher = fileURLToPath(new URL("launch.mjs", import.meta.url));
const fixtureKey = "synthetic-qa-key-never-print-this-value";
test("isolated browser origin does not share cookies with the preserved preview", () => {
  const child = readFileSync(new URL("launch-child.ts", import.meta.url), "utf8");
  assert.ok(child.includes('["localhost", "model-qa.localhost", "desks-qa.localhost", "approval-qa.localhost", "final-qa.localhost"].includes(browserHost)'));
  const account = readFileSync(new URL("../../../model-workspace/2026-10-06/prepare-account.mjs", import.meta.url), "utf8");
  assert.ok(account.includes('["localhost", "model-qa.localhost", "desks-qa.localhost", "approval-qa.localhost", "final-qa.localhost"].includes(origin.hostname)'));
  const inspector = readFileSync(new URL("../../../web-desks/2026-10-06/inspect-chat.mjs", import.meta.url), "utf8");
  assert.ok(inspector.includes('["desks-qa.localhost", "approval-qa.localhost", "final-qa.localhost"].includes(origin.hostname)'));
  assert.ok(child.includes('server: { host: "127.0.0.1"'));
  assert.ok(child.includes("const url = `http://${browserHost}:${address.port}`"));
  assert.ok(child.includes("MATTERHORN_APP_URL = url"));
  assert.ok(child.includes("corsOrigins: [url]"));
});
test("operator review is explicit and does not change manual approval or normal-user auth", () => {
  const child = readFileSync(new URL("launch-child.ts", import.meta.url), "utf8");
  assert.ok(child.includes('process.env.MATTERHORN_QA_OPERATOR_REVIEW === "1"'));
  assert.ok(child.includes('approvalMode: "manual"'));
  assert.ok(child.includes('mode: 0o600, flag: "wx"'));
});
function run(args, environment = {}) {
  const result = spawnSync(process.execPath, [launcher, ...args], { encoding: "utf8", env: { PATH: process.env.PATH, CUDOS_API_KEY: fixtureKey, ...environment } });
  assert.ok(!`${result.stdout}${result.stderr}`.includes(fixtureKey));
  return result;
}
test("missing explicit source rejects inherited provider key", () => {
  const result = run(["--check-only"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing --env-file/);
});
test("refuses non-loopback or preserved-preview browser hosts", () => {
  for (const host of ["0.0.0.0", "127.0.0.1", "example.com", "other.localhost", "approval-qa.localhost.example.com", "final-qa.localhost.example.com", "*.localhost"]) {
    const result = run(["--wiring-only", "--check-only", "--browser-host", host]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Browser host must be/);
  }
  assert.equal(run(["--wiring-only", "--check-only", "--browser-host", "model-qa.localhost"]).status, 0);
  assert.equal(run(["--wiring-only", "--check-only", "--browser-host", "approval-qa.localhost"]).status, 0);
  assert.equal(run(["--wiring-only", "--check-only", "--browser-host", "final-qa.localhost"]).status, 0);
});
test("provider-free check validates maintained binary without a provider", () => {
  const result = run(["--wiring-only", "--check-only"]);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).providerKeyTextPresent, false);
});
test("Bittensor sidecar requires an explicit URL and network pair", () => {
  for (const args of [["--bittensor-sidecar-url", "http://127.0.0.1:9876"], ["--bittensor-network", "finney"]]) {
    const result = run(["--wiring-only", "--check-only", ...args]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be provided together/);
  }
});
test("Bittensor sidecar accepts only exact loopback HTTP origins with valid explicit ports", () => {
  const invalidUrls = [
    "http://localhost:9876", "http://127.1:9876", "http://0.0.0.0:9876", "http://[::1]:9876",
    "https://127.0.0.1:9876", "http://example.com:9876", "http://127.0.0.1",
    "http://127.0.0.1:0", "http://127.0.0.1:65536", "http://127.0.0.1:09876",
    "http://127.0.0.1:9876/", "http://127.0.0.1:9876/health", "http://127.0.0.1:9876?test=1",
    "http://127.0.0.1:9876#fragment", "http://user:password@127.0.0.1:9876", " http://127.0.0.1:9876", "",
  ];
  for (const url of invalidUrls) {
    const result = run(["--wiring-only", "--check-only", "--bittensor-sidecar-url", url, "--bittensor-network", "finney"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be exactly http:\/\/127\.0\.0\.1:port/);
    assert.ok(!result.stderr.includes("user:password"));
  }
});
test("Bittensor network permits only finney and test without normalizing unsupported values", () => {
  for (const network of ["mainnet", "local", "FINNEY", "testnet", " test", ""]) {
    const result = run(["--wiring-only", "--check-only", "--bittensor-sidecar-url", "http://127.0.0.1:9876", "--bittensor-network", network]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /network must be finney or test/);
  }
  for (const network of ["finney", "test"]) {
    const result = run(["--wiring-only", "--check-only", "--bittensor-sidecar-url", "http://127.0.0.1:9876", "--bittensor-network", network]);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout).bittensorReadOnlySidecar, {
      BITTENSOR_SUBTENSOR_SIDECAR_URL: "http://127.0.0.1:9876", BITTENSOR_NETWORK: network,
    });
  }
});
test("Bittensor QA wiring ignores inherited configuration and adds no execution authority", () => {
  const result = run(["--wiring-only", "--check-only"], {
    BITTENSOR_SUBTENSOR_SIDECAR_URL: "http://example.com:9876", BITTENSOR_NETWORK: "local",
    BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS: "1", MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED: "1",
  });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout).bittensorReadOnlySidecar, {});
  const source = readFileSync(launcher, "utf8");
  assert.ok(source.includes("...bittensorSidecarEnv"));
  assert.ok(!source.includes("...process.env"));
  assert.ok(!source.includes("BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS"));
  assert.ok(!source.includes("MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED"));
});
test("private env source is required, bounded, and never echoed", () => {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-launcher-test-"));
  const file = join(root, "provider.env");
  try {
    writeFileSync(file, "OTHER_KEY=synthetic\n", { mode: 0o600 });
    assert.equal(run(["--env-file", file, "--check-only"]).status, 1);
    writeFileSync(file, `CUDOS_API_KEY=${fixtureKey}\n`);
    assert.equal(run(["--env-file", file, "--check-only"]).status, 0);
    chmodSync(file, 0o644);
    assert.equal(run(["--env-file", file, "--check-only"]).status, 1);
    chmodSync(file, 0o600);
    const link = join(root, "linked.env");
    symlinkSync(file, link);
    assert.equal(run(["--env-file", link, "--check-only"]).status, 1);
    assert.equal(run(["--env-file", file, "--wiring-only", "--check-only"]).status, 1);
    writeFileSync(file, `CUDOS_API_KEY=${fixtureKey}\n#${"x".repeat(65536)}`);
    assert.equal(run(["--env-file", file, "--check-only"]).status, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

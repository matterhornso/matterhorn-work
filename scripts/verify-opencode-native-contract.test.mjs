import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assertNativeReport, findRuntimeBinary, isolatedRuntimeEnvironment, verifyNativeRuntime } from "./verify-opencode-native-contract.mjs";

const report = (count = 30, extra = "") => `<testsuites><testsuite>${"<testcase name=\"fixture\"></testcase>".repeat(count)}${extra}</testsuite></testsuites>`;

test("release verification is required after dependency and Bun setup in CI", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci-tests.yml", import.meta.url), "utf8").split("\n  customer-crypto-gates:")[0];
  assert.ok(workflow.indexOf("Install dependencies") < workflow.indexOf("Validate OpenWork and OpenCode runtime compatibility"));
  assert.ok(workflow.indexOf("Setup Bun for local secret-launch boundary") < workflow.indexOf("Validate OpenWork and OpenCode runtime compatibility"));
  const gate = readFileSync(new URL("./opencode-runtime-compatibility.test.mjs", import.meta.url), "utf8");
  assert.match(gate, /await verifyNativeRuntime\(/);
  assert.doesNotMatch(gate, /\.\.\.process\.env/);
  assert.match(gate, /native execution NOT verified/);
});

test("probe environment excludes credentials, launch config and runner overrides", () => {
  const env = isolatedRuntimeEnvironment("/isolated", { PATH: "/tools", SystemRoot: "C:\\Windows",
    HOME: "/real-user", OPENAI_API_KEY: "synthetic-secret", NODE_OPTIONS: "--require=untrusted",
    BUN_OPTIONS: "untrusted", OPENCODE_CONFIG_CONTENT: "private", OPENWORK_DATA_DIR: "/real-data" });
  assert.equal(env.HOME, "/isolated");
  assert.equal(env.PATH, "/tools");
  assert.equal(env.SystemRoot, "C:\\Windows");
  for (const key of ["OPENAI_API_KEY", "NODE_OPTIONS", "BUN_OPTIONS", "OPENCODE_CONFIG_CONTENT", "OPENWORK_DATA_DIR"]) assert.equal(key in env, false);
});

for (const [name, xml] of [["missing", ""], ["too few", report(29)], ["truncated", report().slice(0, -13)],
  ["skipped", report(30, "<skipped/>")], ["failed", report(30, "<failure message=\"failed\"/>")],
  ["error", report(30, "<error/>")]]) {
  test(`rejects ${name} native evidence`, () => assert.throws(() => assertNativeReport(xml), /Native runtime contract/));
}
test("accepts complete native report", () => assert.equal(assertNativeReport(report()), 30));

test("does not silently substitute another executable", () => {
  assert.equal(findRuntimeBinary("/missing/native/runtime", process.env.PATH), null);
  assert.equal(findRuntimeBinary("missing-fixture-runtime", ""), null);
});

for (const outcome of ["success", "wrong-version", "failed-suite", "skipped-suite", "changed-binary"]) {
  test(`subprocess runner handles ${outcome}`, async () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-native-verifier-test-"));
    const binary = join(root, "opencode");
    const runner = join(root, "bun");
    try {
      writeFileSync(binary, `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(outcome === "wrong-version" ? "0.0.0" : "1.18.31-fixture")});\n`, { mode: 0o700 });
      writeFileSync(runner, `#!${process.execPath}\nimport { writeFileSync } from 'node:fs';
        if (process.env.MATTERHORN_TEST_OPENCODE_BIN !== ${JSON.stringify(realpathSync(binary))}) process.exit(2);
        if (process.env.MATTERHORN_TEST_OPENCODE_VERSION !== '1.18.31-fixture') process.exit(3);
        if (!process.argv.includes('--bail=1')) process.exit(5);
        const arg = process.argv.find(value => value.startsWith('--reporter-outfile='));
        if (!arg) process.exit(4);
        writeFileSync(arg.slice('--reporter-outfile='.length), ${JSON.stringify(report(30, outcome === "skipped-suite" ? "<skipped/>" : ""))});
        ${outcome === "changed-binary" ? `writeFileSync(${JSON.stringify(realpathSync(binary))}, 'replacement fixture');` : ""}
        process.exit(${outcome === "failed-suite" ? 1 : 0});\n`, { mode: 0o700 });
      const result = verifyNativeRuntime({ binary, runner, expectedVersion: "1.18.31-fixture" });
      if (outcome === "success") {
        const evidence = await result;
        assert.equal(evidence.tests, 30);
        assert.equal(evidence.hostedAcceptance, false);
        assert.match(evidence.binarySha256, /^[a-f0-9]{64}$/);
      } else await assert.rejects(result, outcome === "wrong-version" ? /exact expected version/ : outcome === "changed-binary" ? /binary changed/ : /[Nn]ative runtime/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

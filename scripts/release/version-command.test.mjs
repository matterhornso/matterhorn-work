import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertReleaseVersion, runVersionCommand } from "./version-command.mjs";

test("release versions become separate git arguments without a shell", () => {
  const calls = [];
  const execute = (...args) => { calls.push(args); return "done\n"; };
  assert.equal(runVersionCommand("commit", "1.2.3-rc.1+build.9", { cwd: "/fixture", execute }), "done");
  runVersionCommand("tag", "1.2.3", { cwd: "/fixture", execute });
  assert.deepEqual(calls, [
    ["git", ["commit", "-m", "chore: bump version to 1.2.3-rc.1+build.9"], { cwd: "/fixture", encoding: "utf8", stdio: "pipe" }],
    ["git", ["tag", "v1.2.3"], { cwd: "/fixture", encoding: "utf8", stdio: "pipe" }],
  ]);
});

test("malformed package versions never invoke a command", () => {
  let calls = 0;
  for (const version of [null, {}, "", "1.2.3\n", '1.2.3"; echo injected', "1.2.3$(id)", "1.2.3`id`", "1.2.3 & echo injected", "--help", "1.2.3/other", "1.2.3-" + "a".repeat(100)]) {
    assert.throws(() => runVersionCommand("tag", version, { execute: () => { calls++; return ""; } }), /release version/);
  }
  assert.equal(calls, 0);
});

test("dry run logs but does not execute; unknown steps fail closed", () => {
  const logs = [];
  const execute = () => { throw new Error("must not execute"); };
  assert.equal(runVersionCommand("tag", "1.2.3", { dryRun: true, execute, log: text => logs.push(text) }), "");
  assert.deepEqual(logs, ['[dry-run] git "tag" "v1.2.3"']);
  assert.throws(() => runVersionCommand("push", "1.2.3", { execute }), /Unsupported/);
  assert.equal(assertReleaseVersion("0.0.1"), "0.0.1");
});

test("release preparation routes both version-bearing commands through the helper", () => {
  const source = readFileSync(new URL("prepare.mjs", import.meta.url), "utf8");
  assert.ok(source.includes('runVersionStep("commit", version)'));
  assert.ok(source.includes('runVersionStep("tag", version)'));
  assert.ok(source.includes("assertReleaseVersion(appPkg.version)"));
  assert.doesNotMatch(source, /run\(`git (?:commit|tag)/);
});

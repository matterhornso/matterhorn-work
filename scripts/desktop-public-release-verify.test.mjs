#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "matterhorn-public-desktop-"));
const sourceCommit = "c".repeat(40);
mkdirSync(join(dir, "mac-arm64", "Matterhorn Desks.app"), { recursive: true });
const dmg = join(dir, "matterhorn-work-0.13.13-mac-arm64.dmg");
const zip = join(dir, "matterhorn-work-0.13.13-mac-arm64.zip");
writeFileSync(dmg, "fixture-dmg");
writeFileSync(zip, "fixture-zip");
writeFileSync(join(dir, "latest-mac.yml"), "version: 0.13.13\nfiles:\n  - url: matterhorn-work-0.13.13-mac-arm64.zip\n    sha512: fixture-sha512\n");
const fixturePath = join(dir, "commands.json");
writeFileSync(fixturePath, `${JSON.stringify({
  codesignVerify: { status: 0, stderr: "valid on disk\nsatisfies its Designated Requirement" },
  codesignIdentity: { status: 0, stderr: "Authority=Developer ID Application: Matterhorn (ABC123)\nTeamIdentifier=ABC123" },
  gatekeeper: { status: 0, stderr: "accepted\nsource=Notarized Developer ID" },
  appStaple: { status: 0, stdout: "The validate action worked!" },
  dmgStaple: { status: 0, stdout: "The validate action worked!" },
  dmgVerify: { status: 0, stdout: "Checksums verified" },
  zipVerify: { status: 0, stdout: "No errors detected in compressed data" },
}, null, 2)}\n`);

function run(args) {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/desktop-public-release-verify.mjs", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

try {
  const pass = await run(["--", "--dist-dir", dir, "--expected-version", "0.13.13", "--source-commit", sourceCommit, "--command-fixture", fixturePath, "--json"]);
  assert.equal(pass.code, 0, pass.stderr || pass.stdout);
  const report = JSON.parse(pass.stdout);
  assert.equal(report.version, "matterhorn.desktop-public-release-verification.v1");
  assert.equal(report.ok, true);
  assert.equal(report.ready, false);
  assert.equal(report.status, "local_contract");
  assert.equal(report.localContract, true);
  assert.equal(report.sourceCommit, sourceCommit);
  assert.match(report.artifacts[0].sha256, /^[a-f0-9]{64}$/);

  const strictFixture = await run(["--dist-dir", dir, "--command-fixture", fixturePath, "--strict", "--json"]);
  assert.equal(strictFixture.code, 1);
  assert.match(strictFixture.stderr, /cannot be used with --strict/);

  writeFileSync(join(dir, "latest-mac.yml"), "version: 9.9.9\nfiles:\n  - url: wrong.zip\n    sha512: x\n");
  const mismatch = await run(["--dist-dir", dir, "--expected-version", "0.13.13", "--source-commit", sourceCommit, "--command-fixture", fixturePath, "--json"]);
  assert.equal(mismatch.code, 1);
  assert.ok(JSON.parse(mismatch.stdout).failures.some((item) => item.id === "updater_manifest"));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("Desktop public release verifier contract passed.");

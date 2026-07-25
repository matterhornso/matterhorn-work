#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  MANIFEST_VERSION,
  classifyCandidatePath,
} from "./release-candidate-manifest.mjs";

assert.equal(
  classifyCandidatePath("apps/app/tests/wallet-runtime.test.ts"),
  "tests-and-release-documentation",
);
assert.equal(
  classifyCandidatePath("evals/README.md"),
  "tests-and-release-documentation",
);
assert.equal(
  classifyCandidatePath("scripts/public-beta-candidate-certifier.mjs"),
  "release-engineering",
);
assert.equal(
  classifyCandidatePath("pnpm-lock.yaml"),
  "release-engineering",
);
assert.equal(
  classifyCandidatePath("pnpm-workspace.yaml"),
  "release-engineering",
);
assert.equal(
  classifyCandidatePath("patches/@solidjs__router@0.15.4.patch"),
  "release-engineering",
);
assert.equal(
  classifyCandidatePath("apps/app/src/react-app/domains/cloud/public-web-signin.tsx"),
  "public-web-security",
);
assert.equal(
  classifyCandidatePath("apps/server/src/tools/hyperliquid-execution.ts"),
  "wallet-and-market-safety",
);
assert.equal(
  classifyCandidatePath("apps/desktop/electron/runtime.mjs"),
  "runtime-and-recovery",
);
assert.equal(
  classifyCandidatePath("apps/app/src/react-app/domains/notes/notes-panel.tsx"),
  "runtime-and-recovery",
);
assert.equal(
  classifyCandidatePath("apps/app/src/react-app/design-system/button.tsx"),
  "ui-and-accessibility",
);
assert.equal(classifyCandidatePath("README.md"), "branding-and-product-truth");
assert.equal(classifyCandidatePath("vendor/mystery.bin"), "unclassified");

const repoRoot = mkdtempSync(join(tmpdir(), "matterhorn-release-manifest-"));
const script = resolve("scripts/release-candidate-manifest.mjs");
const runGit = (args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: "pipe" });

runGit(["init"]);
runGit(["config", "user.email", "release-manifest@example.test"]);
runGit(["config", "user.name", "Release Manifest Test"]);
writeFileSync(join(repoRoot, "README.md"), "Matterhorn Desks\n");
runGit(["add", "README.md"]);
runGit(["commit", "-m", "base"]);

mkdirSync(join(repoRoot, "apps/app/src/react-app/design-system"), { recursive: true });
mkdirSync(join(repoRoot, "scripts"), { recursive: true });
mkdirSync(join(repoRoot, "qa-reports"), { recursive: true });
mkdirSync(join(repoRoot, "vendor"), { recursive: true });
writeFileSync(join(repoRoot, "README.md"), "Matterhorn Desks public beta\n");
writeFileSync(
  join(repoRoot, "apps/app/src/react-app/design-system/button.tsx"),
  "export const Button = true;\n",
);
writeFileSync(join(repoRoot, "scripts/release-demo.mjs"), "export const ready = true;\n");
writeFileSync(join(repoRoot, "qa-reports/private.json"), "{\"secret\":\"redacted\"}\n");
writeFileSync(join(repoRoot, "vendor/mystery.bin"), "unclassified\n");

const blockedDir = join(repoRoot, "qa-reports/blocked-output");
const blocked = spawnSync(
  process.execPath,
  [script, "--", "--repo-root", repoRoot, "--output-dir", blockedDir, "--strict", "--json"],
  { encoding: "utf8" },
);
assert.equal(blocked.status, 1);
const blockedReport = JSON.parse(blocked.stdout);
assert.equal(blockedReport.version, MANIFEST_VERSION);
assert.equal(blockedReport.decision, "BLOCKED");
assert.deepEqual(blockedReport.blockers, [
  { id: "unclassified_candidate_path", detail: "vendor/mystery.bin" },
]);
assert.equal(blockedReport.totals.unclassified, 1);
assert.equal(JSON.stringify(blockedReport).includes("private.json"), false);

rmSync(join(repoRoot, "vendor/mystery.bin"));
const firstDir = join(repoRoot, "qa-reports/first-output");
const first = spawnSync(
  process.execPath,
  [script, "--repo-root", repoRoot, "--output-dir", firstDir, "--strict", "--json"],
  { encoding: "utf8" },
);
assert.equal(first.status, 0, first.stderr);
const firstReport = JSON.parse(first.stdout);
assert.equal(firstReport.decision, "REVIEWABLE");
assert.equal(firstReport.totals.unclassified, 0);
assert.equal(firstReport.totals.stagedProtected, 0);
assert.equal(firstReport.preserveOnly["qa-reports/"] >= 1, true);
assert.match(firstReport.candidateSourceDigest, /^[a-f0-9]{64}$/);
assert.doesNotMatch(
  readFileSync(join(firstDir, "release-candidate-manifest.md"), "utf8"),
  /private\.json/,
);

writeFileSync(
  join(repoRoot, "apps/app/src/react-app/design-system/button.tsx"),
  "export const Button = false;\n",
);
const secondDir = join(repoRoot, "qa-reports/second-output");
const second = spawnSync(
  process.execPath,
  [script, "--repo-root", repoRoot, "--output-dir", secondDir, "--strict", "--json"],
  { encoding: "utf8" },
);
assert.equal(second.status, 0, second.stderr);
const secondReport = JSON.parse(second.stdout);
assert.notEqual(secondReport.candidateSourceDigest, firstReport.candidateSourceDigest);

runGit(["add", "qa-reports/private.json"]);
const protectedDir = join(repoRoot, "qa-reports/protected-output");
const protectedRun = spawnSync(
  process.execPath,
  [script, "--repo-root", repoRoot, "--output-dir", protectedDir, "--strict", "--json"],
  { encoding: "utf8" },
);
assert.equal(protectedRun.status, 1);
const protectedReport = JSON.parse(protectedRun.stdout);
assert.equal(protectedReport.totals.stagedProtected, 1);
assert.equal(
  protectedReport.blockers.some((blocker) => blocker.id === "protected_path_staged"),
  true,
);
assert.equal(JSON.stringify(protectedReport).includes("private.json"), false);

console.log("release candidate manifest tests passed");

#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const workflow = readFileSync(".github/workflows/alpha-macos-aarch64.yml", "utf8");

assert.equal(
  rootPackage.scripts["test:alpha-macos-tester-artifact"],
  "node scripts/alpha-macos-tester-artifact.test.mjs",
  "package.json should expose the alpha macOS tester artifact gate",
);

for (const phrase of [
  "Package Electron alpha tester artifact (macOS, unsigned)",
  "Upload unsigned Electron alpha tester artifact",
  "matterhorn-alpha-macos-arm64-unsigned",
  "CSC_IDENTITY_AUTO_DISCOVERY: false",
  "actions/upload-artifact@v4",
  "apps/desktop/dist-electron/*.dmg",
  "apps/desktop/dist-electron/*.zip",
  "if-no-files-found: error",
]) {
  assert.ok(workflow.includes(phrase), `alpha workflow missing tester artifact phrase: ${phrase}`);
}

const unsignedPackageIndex = workflow.indexOf("Package Electron alpha tester artifact (macOS, unsigned)");
assert.ok(unsignedPackageIndex >= 0, "alpha workflow should include the unsigned package step");
const unsignedPackageBlockEnd = workflow.indexOf(
  "Upload unsigned Electron alpha tester artifact",
  unsignedPackageIndex,
);
const unsignedPackageBlock = workflow.slice(
  unsignedPackageIndex,
  unsignedPackageBlockEnd >= 0 ? unsignedPackageBlockEnd : unsignedPackageIndex + 700,
);
assert.ok(
  unsignedPackageBlock.includes("--mac dmg zip"),
  "unsigned tester artifact packaging should request the same macOS DMG/ZIP targets used by release packaging",
);
assert.ok(
  unsignedPackageBlock.includes("--publish never"),
  "unsigned tester artifact packaging must not publish release assets",
);
assert.ok(
  unsignedPackageBlock.includes("CSC_IDENTITY_AUTO_DISCOVERY: false"),
  "unsigned tester artifact packaging must not auto-discover a signing identity",
);
assert.ok(
  unsignedPackageBlock.includes("MACOS_NOTARIZE: false"),
  "unsigned tester artifact packaging must explicitly disable notarization so the afterSign hook does not require a Developer ID signature",
);
assert.ok(
  unsignedPackageBlock.includes("if: steps.alpha-signing.outputs.configured != 'true'"),
  "unsigned tester packaging should run whenever signing secrets are unavailable",
);
assert.ok(
  !unsignedPackageBlock.includes("if: env.MACOS_NOTARIZE == 'true'"),
  "unsigned tester packaging must not gate on the step-level MACOS_NOTARIZE=false override",
);
assert.ok(
  !unsignedPackageBlock.includes("MACOS_NOTARIZE: true"),
  "unsigned tester artifact packaging must not pass MACOS_NOTARIZE=true",
);

for (const phrase of [
  "Package Electron alpha (macOS, signed + notarized)",
  "Create immutable alpha prerelease",
  "Upload Electron alpha updater assets",
  "Update alpha updater pointer",
]) {
  const index = workflow.indexOf(phrase);
  assert.ok(index >= 0, `alpha workflow missing signed release step: ${phrase}`);
  const stepBlock = workflow.slice(Math.max(0, index - 220), index + 500);
  assert.ok(
    stepBlock.includes("steps.alpha-signing.outputs.configured == 'true'"),
    `${phrase} must remain gated behind configured Apple signing secrets`,
  );
}

const signedPackageIndex = workflow.indexOf("Package Electron alpha (macOS, signed + notarized)");
assert.ok(signedPackageIndex >= 0, "alpha workflow should include the signed package step");
const signedPackageBlock = workflow.slice(signedPackageIndex, signedPackageIndex + 350);
assert.ok(
  signedPackageBlock.includes("MACOS_NOTARIZE: true"),
  "signed/notarized alpha packaging must explicitly enable notarization",
);

for (const forbidden of [
  "gh release upload \"$ALPHA_RELEASE_TAG\"",
  "gh release upload \"$ALPHA_RUN_RELEASE_TAG\" \"${assets[@]}\"",
]) {
  const unsignedStepIndex = workflow.indexOf("Upload unsigned Electron alpha tester artifact");
  const signedUploadIndex = workflow.indexOf(forbidden);
  assert.ok(
    signedUploadIndex === -1 || signedUploadIndex > unsignedStepIndex,
    `unsigned tester artifact must not publish through release upload path: ${forbidden}`,
  );
}

console.log("Alpha macOS tester artifact workflow check passed.");

#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/generated-media-flow-smoke.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

for (const endpoint of [
  "/api/backend/capabilities",
  "/images/generate",
  "/nft-draft",
  "/storage/upload",
  "/mint/preview",
  "/mint/receipt",
  "/listing/preview",
  "/listing/receipt",
  "/evidence?source=task_events",
  "/data-ledger?kind=nft",
]) {
  assert.ok(script.includes(endpoint), `generated-media flow smoke should call ${endpoint}`);
}

for (const stageId of [
  "workspace",
  "capabilities",
  "image.generate",
  "nft.draft",
  "walrus.upload",
  "sui.mint_preview",
  "sui.mint_receipt",
  "sui.listing_preview",
  "sui.listing_receipt",
  "nft.preview_outputs",
]) {
  assert.ok(script.includes(stageId), `generated-media flow smoke should report stage ${stageId}`);
}

assert.ok(
  script.includes("nonCustodial: true") &&
    script.includes("liveSubmissionEnabled: false") &&
    script.includes("asksForSecrets: false"),
  "generated-media flow smoke should report the no-custody safety boundary",
);
assert.ok(
  script.includes("matterhorn-media-smoke-client-token") &&
    script.includes("http://127.0.0.1:4125"),
  "generated-media flow smoke should default to dev:generated-media-smoke",
);
assert.ok(
  script.includes("--json-output") && script.includes("--strict"),
  "generated-media flow smoke should support JSON artifacts and strict exit behavior",
);
assert.ok(
  script.includes("nft-previews") &&
    script.includes("mint-preview.json") &&
    script.includes("listing-preview.json") &&
    script.includes("nftOutputKind") &&
    script.includes("containsSignatureMaterial"),
  "generated-media flow smoke should verify public NFT preview handoffs in evidence and ledger",
);
assert.ok(
  script.includes("DEFAULT_MINT_TRANSACTION_DIGEST") &&
    script.includes("DEFAULT_LISTING_TRANSACTION_DIGEST") &&
    !script.includes("0xsmokemintdigest") &&
    !script.includes("0xsmokelistingdigest"),
  "generated-media flow smoke should use public-shaped Sui transaction digests accepted by receipt validation",
);

assert.equal(
  packageJson.scripts?.["smoke:generated-media-flow"],
  "node scripts/generated-media-flow-smoke.mjs --strict",
  "package.json should expose the generated-media flow smoke",
);
assert.equal(
  packageJson.scripts?.["test:generated-media-flow-smoke"],
  "node scripts/generated-media-flow-smoke.test.mjs",
  "package.json should expose the generated-media flow smoke contract gate",
);

console.log("Generated-media flow smoke contract passed.");

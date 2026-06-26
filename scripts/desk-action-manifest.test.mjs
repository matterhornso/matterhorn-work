#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync("packages/types/src/desk-actions.ts", "utf8");
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));

// Runtime imports from built types package.
const {
  DESK_ACTION_REGISTRY,
  BITTENSOR_DESK_ACTION_REGISTRY,
  HYPERLIQUID_DESK_ACTION_REGISTRY,
  POLYMARKET_DESK_ACTION_REGISTRY,
  WELLNESS_DESK_ACTION_REGISTRY,
  MEMORY_DESK_ACTION_REGISTRY,
  MCPS_DESK_ACTION_REGISTRY,
  getDeskActionManifest,
  listDeskActions,
  listAllDeskActionIds,
} = await import("../packages/types/dist/index.js");

// 1. Root package exposes the test script.
assert.equal(
  rootPackage.scripts["test:desk-action-manifest"],
  "node scripts/desk-action-manifest.test.mjs",
  "package.json should expose the desk action manifest test script",
);

// 2. Required types and constants exist in source.
for (const token of [
  "DeskActionManifest",
  "DeskActionExecutionState",
  "DeskActionCardKind",
  "DeskActionSafetyBoundary",
  "DEFAULT_DESK_ACTION_SAFETY_BOUNDARY",
  "DESK_ACTION_REGISTRY",
  "BITTENSOR_DESK_ACTION_REGISTRY",
  "HYPERLIQUID_DESK_ACTION_REGISTRY",
  "POLYMARKET_DESK_ACTION_REGISTRY",
  "WELLNESS_DESK_ACTION_REGISTRY",
  "MEMORY_DESK_ACTION_REGISTRY",
  "MCPS_DESK_ACTION_REGISTRY",
  "getDeskActionManifest",
  "listDeskActions",
  "listAllDeskActionIds",
]) {
  assert.ok(types.includes(token), `types missing desk action token: ${token}`);
}

const expectedDesks = ["bittensor", "hyperliquid", "polymarket", "wellness", "memory", "mcps"];
const minActionsPerDesk = 4;
const registries = {
  bittensor: BITTENSOR_DESK_ACTION_REGISTRY,
  hyperliquid: HYPERLIQUID_DESK_ACTION_REGISTRY,
  polymarket: POLYMARKET_DESK_ACTION_REGISTRY,
  wellness: WELLNESS_DESK_ACTION_REGISTRY,
  memory: MEMORY_DESK_ACTION_REGISTRY,
  mcps: MCPS_DESK_ACTION_REGISTRY,
};

// 3. Every customer desk has at least 4 actions.
for (const deskId of expectedDesks) {
  const registry = registries[deskId];
  assert.ok(registry, `${deskId} desk action registry must exist`);
  const actions = Object.values(registry);
  assert.ok(
    actions.length >= minActionsPerDesk,
    `${deskId} must have at least ${minActionsPerDesk} actions (found ${actions.length})`,
  );
}

// 4. Helper functions work at runtime.
assert.ok(getDeskActionManifest("bittensor", "bittensor_show_tao"), "getDeskActionManifest must return an action");
assert.equal(
  listDeskActions("bittensor").length,
  Object.keys(BITTENSOR_DESK_ACTION_REGISTRY).length,
  "listDeskActions must return all Bittensor actions",
);
assert.ok(listAllDeskActionIds().length >= 24, "listAllDeskActionIds must return at least 24 actions");

// 5. Every action includes required fields and all safety boundaries reject secrets.
const allActions = Object.values(DESK_ACTION_REGISTRY).flatMap((registry) => Object.values(registry));
assert.ok(allActions.length >= 24, `expected at least 24 desk actions, found ${allActions.length}`);

for (const action of allActions) {
  assert.ok(action.id, "action must have id");
  assert.ok(action.deskId, "action must have deskId");
  assert.ok(action.title, "action must have title");
  assert.ok(action.description, "action must have description");
  assert.ok(Array.isArray(action.requiredContextFields), "action must have requiredContextFields array");
  assert.ok(Array.isArray(action.optionalContextFields), "action must have optionalContextFields array");
  assert.ok(action.safetyBoundary, "action must have safetyBoundary");
  assert.ok(action.executionState, "action must have executionState");
  assert.ok(action.promptTemplate, "action must have promptTemplate");
  assert.ok(Array.isArray(action.resultCardKinds), "action must have resultCardKinds array");

  assert.equal(action.safetyBoundary.liveSubmissionEnabled, false, `${action.id} must disable live submission`);
  assert.equal(action.safetyBoundary.canRequestSecrets, false, `${action.id} must not request secrets`);
  assert.equal(action.safetyBoundary.acceptsPrivateKeys, false, `${action.id} must not accept private keys`);
  assert.equal(action.safetyBoundary.acceptsSeedPhrases, false, `${action.id} must not accept seed phrases`);
  assert.equal(action.safetyBoundary.acceptsApiSecrets, false, `${action.id} must not accept API secrets`);
  assert.equal(action.safetyBoundary.acceptsRawSignatures, false, `${action.id} must not accept raw signatures`);
  assert.equal(action.safetyBoundary.acceptsSignedPayloads, false, `${action.id} must not accept signed payloads`);
  assert.equal(action.safetyBoundary.acceptsWalletExports, false, `${action.id} must not accept wallet exports`);
  assert.equal(action.safetyBoundary.allowsRealFunds, false, `${action.id} must not allow real funds`);
}

// 6. Bittensor actions never ask for seed/private key/mnemonic/raw signature/wallet export.
const bittensorActions = Object.values(BITTENSOR_DESK_ACTION_REGISTRY);
for (const action of bittensorActions) {
  const text = `${action.title} ${action.description} ${action.promptTemplate}`.toLowerCase();
  for (const forbidden of ["seed phrase", "private key", "mnemonic", "raw signature", "wallet export"]) {
    assert.equal(
      text.includes(forbidden),
      false,
      `Bittensor action ${action.id} must not mention "${forbidden}"`,
    );
  }
}

// 7. Hyperliquid and Polymarket actions always have canSubmit:false and liveSubmissionEnabled:false.
for (const deskId of ["hyperliquid", "polymarket"]) {
  const actions = Object.values(registries[deskId]);
  for (const action of actions) {
    assert.equal(action.safetyBoundary.canSubmit, false, `${action.id} must set canSubmit false`);
    assert.equal(action.safetyBoundary.liveSubmissionEnabled, false, `${action.id} must disable live submission`);
  }
}

// 8. Wellness actions are educational/non-medical and planned-not-live for live services.
const wellnessActions = Object.values(WELLNESS_DESK_ACTION_REGISTRY);
const wellnessText = wellnessActions.map((a) => `${a.title} ${a.description}`).join(" ").toLowerCase();
assert.ok(
  wellnessText.includes("non-medical") || wellnessText.includes("educational"),
  "Wellness actions must be non-medical/educational",
);
const plannedWellnessActions = wellnessActions.filter((a) => a.executionState === "planned_not_live");
assert.ok(
  plannedWellnessActions.length >= 1,
  "Wellness must have at least one planned_not_live action for live services",
);

// 9. MCPs desk actions expose install/use guidance only, no secrets.
const mcpsActions = Object.values(MCPS_DESK_ACTION_REGISTRY);
const mcpsText = mcpsActions.map((a) => `${a.title} ${a.description}`).join(" ").toLowerCase();
for (const forbidden of ["private key", "seed phrase", "api secret", "raw signature", "signed payload", "wallet export", "custody"]) {
  assert.equal(
    mcpsText.includes(forbidden),
    false,
    `MCPs actions must not mention "${forbidden}"`,
  );
}

console.log("Desk action manifest check passed.");

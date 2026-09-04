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
  SUI_DESK_ACTION_REGISTRY,
  WELLNESS_DESK_ACTION_REGISTRY,
  MEMORY_DESK_ACTION_REGISTRY,
  MCPS_DESK_ACTION_REGISTRY,
  DESK_TRANSACTION_LIFECYCLE_STAGES,
  DESK_TRANSACTION_SUBMISSION_AUTHORITIES,
  defineDeskTransactionContract,
  getDeskActionManifest,
  listDeskActions,
  listAllDeskActionIds,
} = await import("../packages/types/dist/index.js");

// 1. Root package exposes the test script.
assert.match(
  rootPackage.scripts["test:desk-action-manifest"],
  /(?:^|&&\s*)node scripts\/desk-action-manifest\.test\.mjs$/,
  "package.json should expose the desk action manifest test script",
);

// 2. Required types and constants exist in source.
for (const token of [
  "DeskActionManifest",
  "DeskActionExecutionState",
  "DeskActionCardKind",
  "DeskActionSafetyBoundary",
  "DeskActionUserCompletion",
  "DeskActionUserCompletionSurface",
  "DeskActionUserCompletionResult",
  "DESK_ACTION_USER_COMPLETION_SURFACES",
  "DESK_ACTION_USER_COMPLETION_RESULTS",
  "DeskActionTransactionContract",
  "defineDeskTransactionContract",
  "user_authorized_submit",
  "DEFAULT_DESK_ACTION_SAFETY_BOUNDARY",
  "DESK_ACTION_REGISTRY",
  "BITTENSOR_DESK_ACTION_REGISTRY",
  "HYPERLIQUID_DESK_ACTION_REGISTRY",
  "POLYMARKET_DESK_ACTION_REGISTRY",
  "SUI_DESK_ACTION_REGISTRY",
  "WELLNESS_DESK_ACTION_REGISTRY",
  "MEMORY_DESK_ACTION_REGISTRY",
  "MCPS_DESK_ACTION_REGISTRY",
  "getDeskActionManifest",
  "listDeskActions",
  "listAllDeskActionIds",
]) {
  assert.ok(types.includes(token), `types missing desk action token: ${token}`);
}

const expectedDesks = ["bittensor", "hyperliquid", "polymarket", "sui", "wellness", "memory", "mcps"];
const minActionsPerDesk = {
  bittensor: 4,
  hyperliquid: 4,
  polymarket: 4,
  sui: 3,
  wellness: 4,
  memory: 4,
  mcps: 4,
};
const registries = {
  bittensor: BITTENSOR_DESK_ACTION_REGISTRY,
  hyperliquid: HYPERLIQUID_DESK_ACTION_REGISTRY,
  polymarket: POLYMARKET_DESK_ACTION_REGISTRY,
  sui: SUI_DESK_ACTION_REGISTRY,
  wellness: WELLNESS_DESK_ACTION_REGISTRY,
  memory: MEMORY_DESK_ACTION_REGISTRY,
  mcps: MCPS_DESK_ACTION_REGISTRY,
};

// 3. Every customer desk has at least 4 actions.
for (const deskId of expectedDesks) {
  const registry = registries[deskId];
  assert.ok(registry, `${deskId} desk action registry must exist`);
  const actions = Object.values(registry);
  const requiredActionCount = minActionsPerDesk[deskId];
  assert.ok(
    actions.length >= requiredActionCount,
    `${deskId} must have at least ${requiredActionCount} actions (found ${actions.length})`,
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
assert.equal(
  DESK_TRANSACTION_SUBMISSION_AUTHORITIES.includes("matterhorn_after_signature"),
  false,
  "Matterhorn must never be a post-signature submission authority",
);

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

// 7. Hyperliquid, Polymarket, and Sui actions never submit or enable live execution.
for (const deskId of ["hyperliquid", "polymarket", "sui"]) {
  const actions = Object.values(registries[deskId]);
  for (const action of actions) {
    assert.equal(action.safetyBoundary.canSubmit, false, `${action.id} must set canSubmit false`);
    assert.equal(action.safetyBoundary.liveSubmissionEnabled, false, `${action.id} must disable live submission`);
  }
}

// 8. Financial actions expose a truthful, separate user-authorized completion path.
const expectedFinancialCompletions = {
  bittensor_prepare_stake: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
  bittensor_prepare_unstake: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
  bittensor_prepare_transfer: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
  hyperliquid_preview_order: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
  hyperliquid_cancel_order: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
  hyperliquid_modify_order: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
  hyperliquid_close_position: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
  polymarket_preview_trade: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
  polymarket_sell: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
  polymarket_cancel_order: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
  sui_transfer_preview: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
  sui_coin_transfer: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
  sui_object_transfer: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
  sui_batch_transfer: ["connected_wallet", "submitted_transaction", "user_authorized_submit"],
};

for (const [actionId, [surface, result, executionState]] of Object.entries(expectedFinancialCompletions)) {
  const action = allActions.find((candidate) => candidate.id === actionId);
  assert.ok(action, `${actionId} must exist`);
  assert.deepEqual(
    [action.userCompletion?.surface, action.userCompletion?.result],
    [surface, result],
    `${actionId} must declare its user-authorized completion`,
  );
  assert.equal(action.executionState, executionState, `${actionId} must expose its truthful execution state`);
  assert.ok(action.userCompletion?.actionLabel, `${actionId} must label the completion action`);
  assert.equal(action.safetyBoundary.canSubmit, false, `${actionId} agent must not submit`);
  assert.equal(action.safetyBoundary.liveSubmissionEnabled, false, `${actionId} agent must not enable submission`);

  const transaction = action.transaction;
  assert.ok(transaction, `${actionId} must declare a transaction contract`);
  assert.equal(transaction.version, "matterhorn.desk.transaction.contract.v1", `${actionId} must use the current transaction contract`);
  assert.equal(transaction.agentCanSignOrSubmit, false, `${actionId} agent must never sign or submit`);
  assert.equal(
    transaction.submissionAuthority,
    "connected_wallet",
    `${actionId} must leave signing and submission in the connected wallet`,
  );
  assert.equal(transaction.reviewRequired, true, `${actionId} must require review`);
  assert.equal(transaction.approvalRequiredEveryTime, true, `${actionId} must require approval every time`);
  assert.equal(transaction.receiptRequired, true, `${actionId} must require a public receipt`);
  assert.equal(transaction.userCanCommitRealFunds, transaction.userCanComplete, `${actionId} completion and funds flags must agree`);
  assert.ok(transaction.walletKinds.length > 0, `${actionId} must name at least one wallet kind`);
  assert.ok(transaction.networks.length > 0, `${actionId} must name at least one network`);
  assert.deepEqual(
    transaction.lifecycle,
    DESK_TRANSACTION_LIFECYCLE_STAGES,
    `${actionId} must expose the complete transaction lifecycle`,
  );
  assert.equal(
    transaction.availableInsideMatterhorn,
    transaction.supportLevel === "connected_wallet",
    `${actionId} must truthfully declare in-app completion`,
  );
}

assert.throws(
  () => defineDeskTransactionContract({
    protocol: "sui",
    family: "sui_transfer",
    supportLevel: "connected_wallet",
    submissionAuthority: "external_client",
    simulationPolicy: "required",
    walletKinds: ["sui_wallet"],
    networks: ["sui-testnet"],
    limitations: [],
  }),
  /desk_transaction_submission_authority_invalid/,
  "transaction contracts must reject a support/authority mismatch",
);

// 9. Workspace actions create a durable, non-financial result.
for (const actionId of [
  "wellness_build_program",
  "wellness_generate_artifacts",
  "wellness_package_service",
  "memory_forget_record",
  "memory_export",
]) {
  const action = allActions.find((candidate) => candidate.id === actionId);
  assert.ok(action, `${actionId} must exist`);
  assert.deepEqual(
    [action.userCompletion?.surface, action.userCompletion?.result],
    ["workspace", "workspace_output"],
    `${actionId} must complete in the workspace`,
  );
}

// 10. Wellness actions are educational/non-medical and planned-not-live for live services.
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

// 11. MCPs desk actions expose install/use guidance only, no secrets.
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

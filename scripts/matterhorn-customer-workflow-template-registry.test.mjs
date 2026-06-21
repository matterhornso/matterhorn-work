#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const types = readFileSync("packages/types/src/matterhorn-workflows.ts", "utf8");

const expectedIds = [
  "bittensor_operator",
  "hyperliquid_trader",
  "polymarket_researcher",
  "wellness_creator_workflow",
  "decentralized_services_operator",
  "blank_chat_workflow",
];

// 1. Package exposes the customer template registry gate.
assert.equal(
  pkg.scripts["test:matterhorn-customer-workflow-template-registry"],
  "node scripts/matterhorn-customer-workflow-template-registry.test.mjs",
  "package.json should expose the customer workflow template registry gate",
);

// 2. Required customer template types and constants exist.
for (const token of [
  "MatterhornCustomerWorkflowTemplate",
  "MatterhornCustomerWorkflowStatus",
  "MatterhornCustomerWorkflowLaunchMetadata",
  "MatterhornCustomerWorkflowUiMetadata",
  "MatterhornCustomerWorkflowRoutingMetadata",
  "MatterhornProtocolWorkspaceManifest",
  "MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY",
  "MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE",
  "MATTERHORN_CUSTOMER_WORKFLOW_TEMPLATE_REGISTRY",
]) {
  assert.ok(types.includes(token), `types missing customer workflow template token: ${token}`);
}

// 3. Customer registry covers every expected template id.
const registryBlock = types.slice(types.indexOf("MATTERHORN_CUSTOMER_WORKFLOW_TEMPLATE_REGISTRY"));
for (const id of expectedIds) {
  assert.ok(registryBlock.includes(id), `customer template registry missing: ${id}`);
}

// 3b. Every non-blank customer template maps to exactly one protocol workspace manifest.
const workspaceRegistryBlock = types.slice(types.indexOf("MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY"));

function extractBlock(text, marker) {
  const start = text.indexOf(marker);
  if (start < 0) return "";
  const braceStart = text.indexOf("{", start);
  if (braceStart < 0) return "";
  let depth = 0;
  let inString = false;
  let stringChar = "";
  for (let i = braceStart; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) return text.slice(braceStart, i + 1);
  }
  return "";
}

const mappingBlock = extractBlock(types, "MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE");
assert.ok(mappingBlock, "MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE block must be extractable");
const mappedTemplateIds = [
  "bittensor_operator",
  "hyperliquid_trader",
  "polymarket_researcher",
  "wellness_creator_workflow",
  "decentralized_services_operator",
];
for (const id of mappedTemplateIds) {
  assert.ok(mappingBlock.includes(id), `customer-template-to-workspace mapping missing: ${id}`);
  const workspaceMatch = mappingBlock.match(new RegExp(`${id}:\\s*"([^"]+)"`));
  assert.ok(workspaceMatch, `${id} must map to a protocol workspace`);
  const workspaceId = workspaceMatch[1];
  assert.ok(workspaceRegistryBlock.includes(workspaceId), `mapped workspace ${workspaceId} must exist in registry`);
}
const mappingEntries = [...mappingBlock.matchAll(/(\w+):\s*"(\w+)"/g)];
const mappedWorkspaces = mappingEntries.map(([, , workspaceId]) => workspaceId);
assert.equal(
  new Set(mappedWorkspaces).size,
  mappedWorkspaces.length,
  "each customer template must map to exactly one protocol workspace",
);

// 4. Registry script emits a valid catalog envelope.
const run = (extraArgs = []) =>
  spawnSync(process.execPath, ["scripts/matterhorn-workflow-template-registry.mjs", ...extraArgs, "--json"], {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });

const result = run();
assert.equal(result.status, 0, `customer template registry should exit 0. stderr=${result.stderr}`);
const catalog = JSON.parse(result.stdout);
assert.equal(catalog.ok, true);
assert.equal(catalog.version, "matterhorn.customer.workflow.template.v1");
assert.equal(catalog.status, "catalog_only");
assert.equal(catalog.safety.catalogOnly, true);
assert.equal(catalog.safety.noProviderExecution, true);
assert.equal(catalog.safety.noCustody, true);
assert.equal(catalog.safety.noLiveMarketSubmit, true);
assert.equal(catalog.safety.acceptsSecrets, false);
assert.equal(catalog.safety.acceptsPrivateKeys, false);
assert.equal(catalog.safety.acceptsApiSecrets, false);
assert.equal(catalog.safety.acceptsRawSignatures, false);
assert.equal(catalog.safety.canSubmit, false);
assert.equal(catalog.safety.liveExecutionEnabled, false);
assert.equal(catalog.counts.total, expectedIds.length);

const ids = catalog.customerTemplates.map((template) => template.id);
assert.deepEqual(ids, expectedIds);

// 5. Every customer template satisfies the baseline safety contract.
for (const template of catalog.customerTemplates) {
  assert.ok(template.id, "template must have an id");
  assert.ok(template.name, "template must have a name");
  assert.ok(template.summary, "template must have a summary");
  assert.ok(template.promise, "template must have a promise");
  assert.ok(Array.isArray(template.examplePrompts) && template.examplePrompts.length > 0, `${template.id} must have example prompts`);
  assert.ok(Array.isArray(template.expectedArtifacts), `${template.id} must declare expected artifacts`);
  assert.ok(Array.isArray(template.requiredContext), `${template.id} must declare required context`);
  assert.ok(Array.isArray(template.optionalContext), `${template.id} must declare optional context`);
  assert.ok(Array.isArray(template.forbiddenInputs), `${template.id} must declare forbidden inputs`);
  assert.ok(Array.isArray(template.serviceHooks), `${template.id} must declare service hooks`);
  assert.ok(template.safetyBoundaries, `${template.id} must declare safety boundaries`);
  assert.ok(template.launch, `${template.id} must declare launch metadata`);
  assert.ok(template.ui, `${template.id} must declare ui metadata`);
  assert.ok(template.routing, `${template.id} must declare routing metadata`);

  assert.ok(template.launch.primaryCta, `${template.id} launch.primaryCta is required`);
  assert.ok(template.launch.defaultPrompt, `${template.id} launch.defaultPrompt is required`);
  assert.ok(
    ["protocol_desk", "workflow_chat", "evidence_packet", "future_service"].includes(
      template.launch.recommendedSurface,
    ),
    `${template.id} launch.recommendedSurface must be a known surface`,
  );
  assert.ok(template.ui.iconHint, `${template.id} ui.iconHint is required`);
  assert.ok(
    ["matterhorn_blue", "neutral", "caution"].includes(template.ui.accent),
    `${template.id} ui.accent must be a known accent`,
  );
  assert.ok(template.ui.shortDescription, `${template.id} ui.shortDescription is required`);
  assert.ok(
    template.ui.shortDescription.length <= 90,
    `${template.id} ui.shortDescription must be <= 90 chars (got ${template.ui.shortDescription.length})`,
  );
  assert.equal(template.routing.startsSession, true, `${template.id} routing.startsSession must be true`);
  assert.ok(
    ["bittensor", "hyperliquid", "polymarket", "wellness", "services", "general"].includes(
      template.routing.chatMode,
    ),
    `${template.id} routing.chatMode must be a known mode`,
  );

  const safety = template.safetyBoundaries;
  assert.equal(safety.liveExecutionEnabled, false, `${template.id} must not enable live execution`);
  assert.equal(safety.canSubmit, false, `${template.id} must not submit`);
  assert.equal(safety.acceptsSecrets, false, `${template.id} must not accept secrets`);
  assert.equal(safety.acceptsPrivateKeys, false, `${template.id} must not accept private keys`);
  assert.equal(safety.acceptsApiSecrets, false, `${template.id} must not accept API secrets`);
  assert.equal(safety.acceptsRawSignatures, false, `${template.id} must not accept raw signatures`);
  assert.equal(safety.allowsRealFunds, false, `${template.id} must not allow real funds`);

  // Launch prompts must never ask for secrets or signing material.
  const launchText = `${template.launch.defaultPrompt} ${template.launch.handoffContextLabel}`.toLowerCase();
  for (const forbidden of [
    "private key",
    "seed phrase",
    "mnemonic",
    "api secret",
    "raw signature",
    "signed payload",
    "signed order",
    "wallet export",
  ]) {
    assert.equal(
      launchText.includes(forbidden),
      false,
      `${template.id} launch prompt must not ask for ${forbidden}`,
    );
  }
}

// 6. Market templates include preview-only wording.
for (const id of ["hyperliquid_trader", "polymarket_researcher"]) {
  const template = catalog.customerTemplates.find((t) => t.id === id);
  const safetyText = `${template.summary} ${template.promise} ${template.ui.shortDescription} ${template.handoffReceiptSupport.description ?? ""}`.toLowerCase();
  assert.ok(
    /preview|read-only|no live submission|can submit: no/.test(safetyText),
    `${id} must include preview-only wording in prompt or safety text`,
  );
}

// 7. Wellness template includes non-medical / educational safety.
const wellness = catalog.customerTemplates.find((t) => t.id === "wellness_creator_workflow");
assert.ok(wellness, "wellness_creator_workflow must exist");
const wellnessSafetyText = `${wellness.promise} ${wellness.summary} ${wellness.ui.shortDescription}`.toLowerCase();
assert.ok(
  /medical advice|not medical|educational|without giving medical/.test(wellnessSafetyText),
  "wellness template must include non-medical/educational safety wording",
);

// 8. Crypto/market templates stay preview-only or handoff-only.
const bittensor = catalog.customerTemplates.find((t) => t.id === "bittensor_operator");
assert.ok(bittensor, "bittensor_operator template must exist");
assert.equal(bittensor.status, "beta_ready");
assert.equal(bittensor.safetyBoundaries.canExecute, true, "bittensor_operator may prepare handoffs");
assert.equal(bittensor.safetyBoundaries.requiresExternalSigner, true, "bittensor_operator requires external signer");
assert.deepEqual(
  bittensor.serviceHooks,
  [{ hook: "bittensor", status: "live_local" }],
  "bittensor_operator service hook must be live_local",
);

for (const id of ["hyperliquid_trader", "polymarket_researcher"]) {
  const template = catalog.customerTemplates.find((t) => t.id === id);
  assert.ok(template, `${id} template must exist`);
  assert.equal(template.status, "preview_only", `${id} must be preview_only`);
  assert.equal(template.safetyBoundaries.canExecute, false, `${id} must not execute`);
  assert.equal(template.safetyBoundaries.requiresExternalSigner, false, `${id} must not require external signer`);
}

// 9. Wellness and decentralized services templates are planned-not-live.
for (const id of ["wellness_creator_workflow", "decentralized_services_operator"]) {
  const template = catalog.customerTemplates.find((t) => t.id === id);
  assert.ok(template, `${id} template must exist`);
  assert.ok(
    ["workflow_ready", "planned_not_live"].includes(template.status),
    `${id} status ${template.status} should be workflow_ready or planned_not_live`,
  );
  assert.equal(template.safetyBoundaries.canExecute, false, `${id} must not execute`);
  assert.equal(template.safetyBoundaries.requiresExternalSigner, false, `${id} must not require external signer`);
  for (const hook of template.serviceHooks) {
    assert.equal(hook.status, "planned_not_live", `${id} hook ${hook.hook} must be planned_not_live`);
  }
}

// 10. Blank chat template has no hooks, artifacts, or context and stays safe.
const blank = catalog.customerTemplates.find((t) => t.id === "blank_chat_workflow");
assert.ok(blank, "blank_chat_workflow template must exist");
assert.equal(blank.status, "blank");
assert.deepEqual(blank.expectedArtifacts, []);
assert.deepEqual(blank.requiredContext, []);
assert.deepEqual(blank.optionalContext, []);
assert.deepEqual(blank.serviceHooks, []);
assert.equal(blank.safetyBoundaries.canExecute, false);
assert.equal(blank.safetyBoundaries.requiresExternalSigner, false);

// 11. Filtering works.
const categoryResult = run(["--category", "markets"]);
assert.equal(categoryResult.status, 0, `category filter should exit 0. stderr=${categoryResult.stderr}`);
const categoryCatalog = JSON.parse(categoryResult.stdout);
assert.deepEqual(
  categoryCatalog.customerTemplates.map((t) => t.id).sort(),
  ["hyperliquid_trader", "polymarket_researcher"].sort(),
);

const singleResult = run(["--customer-template", "bittensor_operator"]);
assert.equal(singleResult.status, 0, `single template filter should exit 0. stderr=${singleResult.stderr}`);
const singleCatalog = JSON.parse(singleResult.stdout);
assert.deepEqual(singleCatalog.customerTemplates.map((t) => t.id), ["bittensor_operator"]);

// 12. Credential-shaped flags are rejected.
const reject = spawnSync(
  process.execPath,
  ["scripts/matterhorn-workflow-template-registry.mjs", "--json", "--private-key", "redacted"],
  { encoding: "utf8", maxBuffer: 1024 * 1024 },
);
assert.notEqual(reject.status, 0, "customer template registry should reject credential-shaped flags");
assert.match(reject.stderr, /Forbidden credential-shaped flag --private-key/);

console.log("Matterhorn customer workflow template registry check passed.");

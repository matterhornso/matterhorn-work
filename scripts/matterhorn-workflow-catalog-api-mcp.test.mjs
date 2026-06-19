#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const serverSource = readFileSync("apps/server/src/server.ts", "utf8");
const workflowToolSource = readFileSync("apps/server/src/tools/matterhorn-workflows.ts", "utf8");
const mcpSource = readFileSync("packages/matterhorn-work-mcp/index.mjs", "utf8");
const mcpSmokeSource = readFileSync("packages/matterhorn-work-mcp/test-smoke.mjs", "utf8");
const apiDoc = readFileSync("docs/agent-control-api.md", "utf8");
const coverageMatrix = readFileSync("docs/agent-control-coverage-matrix.md", "utf8");

assert.match(serverSource, /GET", "\/api\/workflows\/catalog"/);
assert.match(serverSource, /GET", "\/api\/workflows\/prompts"/);
assert.match(serverSource, /findForbiddenMatterhornWorkflowQueryKey/);
assert.match(serverSource, /buildMatterhornWorkflowCatalog/);
assert.match(serverSource, /buildMatterhornWorkflowPromptPack/);
assert.match(workflowToolSource, /version: "matterhorn\.workflow\.catalog\.v1"/);
assert.match(workflowToolSource, /version: "matterhorn\.workflow\.prompt-pack\.v1"/);
assert.match(workflowToolSource, /status: "catalog_only"/);
assert.match(workflowToolSource, /noProviderExecution: true/);
assert.match(workflowToolSource, /promptPackOnly: true/);
assert.match(workflowToolSource, /noLiveMarketSubmit: true/);
assert.match(workflowToolSource, /acceptsSecrets: false/);
assert.match(workflowToolSource, /canSubmit: false/);
assert.match(workflowToolSource, /liveExecutionEnabled: false/);
assert.match(workflowToolSource, /wellness_creator_workflow/);
assert.match(workflowToolSource, /bittensor_operator/);
assert.match(workflowToolSource, /market_read_preview/);
assert.match(workflowToolSource, /decentralized_services_planner/);

assert.match(mcpSource, /name: "matterhorn_workflows_catalog"/);
assert.match(mcpSource, /name: "matterhorn_workflows_prompt_pack"/);
assert.match(mcpSource, /\/api\/workflows\/catalog/);
assert.match(mcpSource, /\/api\/workflows\/prompts/);
assert.match(mcpSource, /Discovery only: no provider execution/);
assert.match(mcpSource, /Prompt-pack only: no provider execution/);
assert.doesNotMatch(
  mcpSource.match(/name: "matterhorn_workflows_catalog"[\s\S]*?inputSchema: \{[\s\S]*?\n  \},/u)?.[0] ?? "",
  /seed|mnemonic|privateKey|private_key|walletExport|wallet export|apiSecret|api_secret|rawSignature|raw_signature|signedPayload|signed_payload/u,
);
assert.doesNotMatch(
  mcpSource.match(/name: "matterhorn_workflows_prompt_pack"[\s\S]*?inputSchema: \{[\s\S]*?\n  \},/u)?.[0] ?? "",
  /seed|mnemonic|privateKey|private_key|walletExport|wallet export|apiSecret|api_secret|rawSignature|raw_signature|signedPayload|signed_payload/u,
);

assert.match(mcpSmokeSource, /matterhorn_workflows_catalog/);
assert.match(mcpSmokeSource, /matterhorn_workflows_prompt_pack/);
assert.match(mcpSmokeSource, /matterhorn\.workflow\.catalog\.v1/);
assert.match(mcpSmokeSource, /matterhorn\.workflow\.prompt-pack\.v1/);
assert.match(apiDoc, /matterhorn_workflows_catalog/);
assert.match(apiDoc, /matterhorn_workflows_prompt_pack/);
assert.match(apiDoc, /GET \/api\/workflows\/catalog/);
assert.match(apiDoc, /GET \/api\/workflows\/prompts/);
assert.match(coverageMatrix, /Cross-vertical workflow catalog/);
assert.match(coverageMatrix, /matterhorn_workflows_catalog/);
assert.match(coverageMatrix, /matterhorn_workflows_prompt_pack/);

console.log("Matterhorn workflow catalog API/MCP contract passed.");

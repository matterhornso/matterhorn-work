// Read-only verification against the disposable account; never emit credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [root, workspaceId] = process.argv.slice(2);
if (!root?.includes("/matterhorn-pr1032-functional-") || !/^ws_web_[a-f0-9]+$/.test(workspaceId ?? "")) {
  throw new Error("Expected a disposable QA root and workspace ID");
}
const runtime = JSON.parse(readFileSync(join(root, "runtime.json"), "utf8"));
const account = JSON.parse(readFileSync(join(root, "private-ui-account.json"), "utf8"));
const origin = new URL(runtime.url);
assert.equal(origin.protocol, "http:");
assert.equal(origin.hostname, "model-qa.localhost");
const transport = new URL(origin);
transport.hostname = "127.0.0.1";
const response = await fetch(new URL(`/workspace/${workspaceId}/backend/model-selection`, transport), {
  headers: { host: origin.host, origin: origin.origin, cookie: account.cookie },
  signal: AbortSignal.timeout(15_000), redirect: "error",
});
assert.equal(response.status, 200);
const body = await response.json();
assert.equal(body.selection?.providerId, "cudos");
assert.equal(body.selection?.modelId, "asi1");
assert.equal(body.selection?.source, "server_workspace_preference");
console.log(JSON.stringify({ status: response.status, savedProvider: body.selection.providerId,
  savedModel: body.selection.modelId, persistedSource: body.selection.source,
  requestsSentByThisCheck: 0, providerPolicyStillUnverified: runtime.providerPolicyAllowed === false }));

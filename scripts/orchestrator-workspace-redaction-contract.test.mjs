#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const orchestrator = readFileSync("apps/orchestrator/src/cli.ts", "utf8");
const server = readFileSync("apps/server/src/server.ts", "utf8");

assert.match(
  server,
  /opencodeUsername:\s*_opencodeUsername,[\s\S]*opencodePassword:\s*_opencodePassword/,
  "workspace responses must continue to redact engine credentials",
);
assert.doesNotMatch(
  orchestrator,
  /expectedOpencode(?:Username|Password)/,
  "orchestrator verification must not expect credentials from redacted workspace responses",
);
assert.doesNotMatch(
  orchestrator,
  /server engine (?:username|password) mismatch/i,
  "fresh starts must not fail because the server correctly redacts engine credentials",
);
assert.match(
  orchestrator,
  /expectedOpencodeBaseUrl:\s*opencodeConnectUrl,[\s\S]*expectedOpencodeDirectory:\s*resolvedWorkspace/,
  "orchestrator must still verify the engine URL and workspace directory",
);
assert.match(
  orchestrator,
  /const safeReadyAttributes = \{/,
  "structured readiness logs must use an explicit safe projection",
);
assert.doesNotMatch(
  orchestrator,
  /opencode:\s*payload\.opencode|openwork:\s*payload\.openwork/,
  "structured readiness logs must not serialize credential-bearing payloads",
);

console.log("Orchestrator workspace redaction contract passed.");

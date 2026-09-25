// Build apps/server first. Run with Node and Bun separately: this intentionally
// fails if the HTTP adapter loses cancellation after consuming a POST body.
// Uses loopback-only synthetic requests: no accounts, models, or wallet actions.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { ApprovalService } from "../apps/server/dist/approvals.js";
import { serve } from "../apps/server/dist/serve-node.js";

const approvals = new ApprovalService({ mode: "manual", timeoutMs: 5_000 });
let dispatched = 0;
const server = await serve({
  hostname: "127.0.0.1", port: 0,
  fetch: async (request) => {
    await request.json();
    const result = await approvals.requestApproval({
      workspaceId: "fixture", action: "session.prompt", summary: "synthetic",
      paths: [], actor: { type: "remote" },
    }, request.signal);
    if (result.allowed) dispatched++;
    return Response.json(result);
  },
});
const child = spawn(process.execPath, ["-e", `
  fetch("http://127.0.0.1:${server.port}/", {method:"POST",body:"{}"})
    .then(response => response.text()).catch(() => {});
`], { stdio: "ignore" });
const exited = once(child, "exit");
try {
  for (let attempt = 0; attempt < 100 && approvals.list().length === 0; attempt++) await delay(20);
  const pending = approvals.list();
  assert.equal(pending.length, 1, "fixture must reach manual approval");
  child.kill();
  await exited;
  for (let attempt = 0; attempt < 50 && approvals.list().length; attempt++) await delay(10);
  assert.equal(approvals.list().length, 0, "disconnected request must leave approval queue");
  assert.equal(approvals.respond(pending[0].id, "allow"), null, "late approval must be refused");
  assert.equal(dispatched, 0, "cancelled request must not dispatch");
  console.log(JSON.stringify({ runtime: process.versions.bun ? "bun" : "node", cancelled: true, dispatched }));
} finally {
  child.kill();
  await server.stop();
}

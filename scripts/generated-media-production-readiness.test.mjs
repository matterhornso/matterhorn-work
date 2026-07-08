#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = "scripts/generated-media-production-readiness.mjs";

function run(args) {
  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function productionDiagnostics(overrides = {}) {
  const mode = overrides.mode ?? "production_candidate";
  const blocked = mode === "needs_setup";
  const localTest = mode === "local_test";
  const status = overrides.status ?? (blocked ? "warning" : "pass");
  const blockers = blocked
    ? [{
      key: "openai_api_key",
      label: "Production image provider",
      status: "missing",
      envVar: "OPENAI_API_KEY",
      description: "Set OPENAI_API_KEY before using real image generation.",
    }]
    : [];
  return {
    success: true,
    workspaceId: "ws_test",
    checkedAt: "2026-07-08T00:00:00.000Z",
    status,
    summary: overrides.summary ?? (blocked ? "Generated media needs setup." : "Generated media is ready."),
    checks: [
      { id: "image_provider", label: "Image provider", status: blocked ? "warning" : "pass", summary: "Image provider checked." },
      { id: "walrus_storage", label: "Walrus storage", status: "pass", summary: "Walrus diagnostic checked." },
      { id: "sui_nft_minting", label: "Sui NFT minting", status: "pass", summary: "Sui mint config checked." },
      { id: "sui_marketplace_listing", label: "Sui marketplace listing", status: "pass", summary: "Kiosk config checked." },
      { id: "non_custody_safety", label: "Non-custody safety", status: "pass", summary: "No custody." },
    ],
    productionSmokePlan: {
      mode,
      summary: localTest ? "Local mock provider is ready." : blocked ? "Setup is required." : "Production-candidate flow is ready.",
      canRunEndToEnd: mode === "production_candidate",
      publicWritesOnlyAfterUserAction: true,
      blockers,
      stages: [
        {
          id: "chat_image_generation",
          label: "Generate chat image",
          status: blocked ? "blocked" : "ready",
          writeScope: "workspace_output",
          summary: "Image generation writes only to the workspace output folder.",
          requiresWallet: false,
          requiresPublicWrite: false,
          setupRequirements: blockers,
        },
        {
          id: "walrus_public_upload",
          label: "Upload public media to Walrus",
          status: blocked ? "blocked" : "manual",
          writeScope: "public_storage",
          summary: "Upload happens only after user action.",
          requiresWallet: false,
          requiresPublicWrite: true,
          setupRequirements: [],
        },
        {
          id: "sui_wallet_mint",
          label: "Sign Sui mint transaction",
          status: blocked ? "blocked" : "manual",
          writeScope: "wallet_signed_transaction",
          summary: "User wallet signing is required.",
          requiresWallet: true,
          requiresPublicWrite: true,
          setupRequirements: [],
        },
      ],
    },
    safety: {
      custody: false,
      canSubmit: false,
      walletSigning: "client_wallet",
      publicWritesDuringDiagnostics: false,
      storesSecrets: false,
    },
    ...overrides,
  };
}

function startMatterhornServer({ diagnostics, diagnosticsStatus = 200 }) {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        byteLength: body.byteLength,
      });

      if (request.method === "GET" && request.url === "/workspaces") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ activeId: "ws_test", items: [{ id: "ws_test" }] }));
        return;
      }

      if (request.method === "GET" && request.url === "/workspace/ws_test/generated-media/diagnostics") {
        response.writeHead(diagnosticsStatus, { "Content-Type": "application/json" });
        response.end(JSON.stringify(diagnostics));
        return;
      }

      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        requests,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function assertNoWrites(requests) {
  assert.ok(requests.every((request) => request.method === "GET"), `expected only GET calls, got ${JSON.stringify(requests)}`);
  assert.ok(requests.every((request) => request.byteLength === 0), "readiness check should not send request bodies");
  for (const request of requests) {
    assert.ok(
      request.url === "/workspaces" || request.url === "/workspace/ws_test/generated-media/diagnostics",
      `unexpected route ${request.method} ${request.url}`,
    );
  }
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(
  packageJson.scripts["smoke:generated-media-production-readiness"],
  "node scripts/generated-media-production-readiness.mjs --require-production",
);
assert.equal(
  packageJson.scripts["test:generated-media-production-readiness"],
  "node scripts/generated-media-production-readiness.test.mjs",
);

const source = readFileSync(scriptPath, "utf8");
for (const endpoint of [
  "/images/generate",
  "/nft-draft",
  "/storage/upload",
  "/mint/preview",
  "/mint/receipt",
  "/listing/preview",
  "/listing/receipt",
]) {
  assert.ok(!source.includes(endpoint), `production readiness script must not call ${endpoint}`);
}
for (const required of [
  "matterhorn.generated-media-production-readiness.v1",
  "/generated-media/diagnostics",
  "--require-production",
  "No public writes were performed.",
  "publicWritesOnlyAfterUserAction",
]) {
  assert.ok(source.includes(required), `production readiness script missing ${required}`);
}

{
  const server = await startMatterhornServer({ diagnostics: productionDiagnostics() });
  try {
    const result = await run(["--server-url", server.url, "--token", "test-client-token", "--require-production", "--json"]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.version, "matterhorn.generated-media-production-readiness.v1");
    assert.equal(report.ok, true);
    assert.equal(report.ready, true);
    assert.equal(report.mode, "production_candidate");
    assert.equal(report.canRunEndToEnd, true);
    assert.equal(report.publicWritesOnlyAfterUserAction, true);
    assert.equal(report.safety.publicWritesDuringDiagnostics, false);
    assertNoWrites(server.requests);
    assert.ok(server.requests.every((request) => request.authorization === "Bearer test-client-token"));
  } finally {
    await server.close();
  }
}

{
  const server = await startMatterhornServer({ diagnostics: productionDiagnostics({ mode: "local_test" }) });
  try {
    const result = await run(["--server-url", server.url, "--workspace-id", "ws_test", "--require-production", "--json"]);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.ready, false);
    assert.equal(report.mode, "local_test");
    assert.deepEqual(server.requests.map((request) => request.url), ["/workspace/ws_test/generated-media/diagnostics"]);
    assertNoWrites(server.requests);
  } finally {
    await server.close();
  }
}

{
  const server = await startMatterhornServer({ diagnostics: productionDiagnostics({ mode: "needs_setup" }) });
  try {
    const result = await run(["--server-url", server.url, "--workspace-id", "ws_test"]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.ok(result.stdout.includes("Matterhorn generated-media production readiness: NEEDS SETUP"));
    assert.ok(result.stdout.includes("No public writes were performed."));
    assert.ok(result.stdout.includes("OPENAI_API_KEY"));
    assertNoWrites(server.requests);
  } finally {
    await server.close();
  }
}

{
  const server = await startMatterhornServer({ diagnostics: { error: "boom" }, diagnosticsStatus: 500 });
  try {
    const result = await run(["--server-url", server.url, "--workspace-id", "ws_test", "--json"]);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.ready, false);
    assert.match(report.error, /GET .* -> 500/);
    assertNoWrites(server.requests);
  } finally {
    await server.close();
  }
}

{
  const outputDir = mkdtempSync(join(tmpdir(), "matterhorn-generated-media-readiness-"));
  const server = await startMatterhornServer({ diagnostics: productionDiagnostics({ mode: "needs_setup" }) });
  try {
    const outputPath = join(outputDir, "readiness.json");
    const result = await run(["--server-url", server.url, "--workspace-id", "ws_test", "--json-output", outputPath]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const report = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(report.version, "matterhorn.generated-media-production-readiness.v1");
    assert.equal(report.mode, "needs_setup");
    assert.equal(report.ready, false);
    assertNoWrites(server.requests);
  } finally {
    await server.close();
    rmSync(outputDir, { recursive: true, force: true });
  }
}

{
  const help = await run(["--help"]);
  assert.equal(help.code, 0, help.stderr || help.stdout);
  for (const text of [
    "Matterhorn generated-media production readiness",
    "pnpm smoke:generated-media-production-readiness",
    "--require-production",
    "performs no public writes",
  ]) {
    assert.ok(help.stdout.includes(text), `help missing ${text}`);
  }
}

console.log("Generated-media production readiness contract passed.");

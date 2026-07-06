import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const TOKEN = "owt_project_evidence_routes_token";
const HOST_TOKEN = "owt_project_evidence_routes_host_token";
const priorEnv = {
  envStore: process.env.OPENWORK_ENV_STORE,
  openworkDataDir: process.env.OPENWORK_DATA_DIR,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
  memoryRoot: process.env.MATTERHORN_WORK_MEMORY_ROOT,
};
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];

function baseConfig(port: number, root: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: [{
      id: "ws_evidence",
      name: "Evidence test workspace",
      path: root,
      preset: "default",
      workspaceType: "local",
    }],
    authorizedRoots: [root],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
  } as ServerConfig;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-project-evidence-routes-"));
  dirs.push(dir);
  process.env.OPENWORK_DATA_DIR = join(dir, "openwork-data");
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(dir, "memory");
  const server = await startServer(baseConfig(await getFreePort(), dir)) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, dir };
}

async function jsonFetch(base: string, path: string, init?: RequestInit): Promise<{ response: Response; payload: any }> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

afterEach(async () => {
  for (const stop of stops) {
    await stop();
  }
  stops.length = 0;
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  dirs.length = 0;
  process.env.OPENWORK_ENV_STORE = priorEnv.envStore;
  process.env.OPENWORK_DATA_DIR = priorEnv.openworkDataDir;
  process.env.OPENWORK_TOKEN_STORE = priorEnv.tokenStore;
  process.env.MATTERHORN_WORK_MEMORY_ROOT = priorEnv.memoryRoot;
});

describe("project evidence routes", () => {
  test("GET /workspace/:id/evidence returns notes, memory suggestions, tasks, and outputs", async () => {
    const { base } = await boot();

    const createdNote = await jsonFetch(base, "/workspace/ws_evidence/notes", {
      method: "POST",
      body: JSON.stringify({
        title: "Longevity handout idea",
        body: "Create a mobility handout and save it with the client plan.",
        desk: "longevity",
        sessionId: "sess_longevity_evidence",
        outputPath: "outputs/longevity/sess_longevity_evidence/handout.md",
        source: "quick_jot",
      }),
    });
    expect(createdNote.response.status).toBe(201);
    const noteId = createdNote.payload.note.id;

    const memorySuggestion = await jsonFetch(base, `/workspace/ws_evidence/notes/${noteId}/memory-suggestion`, {
      method: "POST",
      body: JSON.stringify({ kind: "workflow_artifact" }),
    });
    expect(memorySuggestion.response.status).toBe(200);

    const staged = await jsonFetch(base, "/api/workflows/runs/stage", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "ws_evidence",
        sessionId: "sess_longevity_evidence",
        deskId: "longevity",
        visibleUserIntent: "Build a Longevity plan",
      }),
    });
    expect(staged.response.status).toBe(201);
    const runId = staged.payload.run.workflowRunId;

    await jsonFetch(base, `/api/workflows/runs/${runId}/start`, { method: "POST" });
    await jsonFetch(base, `/api/workflows/runs/${runId}/stage`, {
      method: "POST",
      body: JSON.stringify({ stageId: "stage_1_client_intake" }),
    });
    await jsonFetch(base, `/api/workflows/runs/${runId}/artifact`, {
      method: "POST",
      body: JSON.stringify({ path: "outputs/longevity/sess_longevity_evidence/intake.md" }),
    });
    await jsonFetch(base, `/api/workflows/runs/${runId}/complete`, { method: "POST" });

    const evidence = await jsonFetch(base, "/workspace/ws_evidence/evidence?limit=50");
    expect(evidence.response.status).toBe(200);
    expect(evidence.payload.success).toBe(true);

    const types = evidence.payload.items.map((item: { type: string }) => item.type);
    expect(types).toContain("note.created");
    expect(types).toContain("note.memory_suggested");
    expect(types).toContain("task.started");
    expect(types).toContain("task.stage_started");
    expect(types).toContain("task.output_saved");
    expect(types).toContain("task.completed");
    expect(evidence.payload.summary.outputs).toBeGreaterThanOrEqual(2);

    const filtered = await jsonFetch(base, "/workspace/ws_evidence/evidence?source=memory&limit=10");
    expect(filtered.response.status).toBe(200);
    expect(filtered.payload.items.every((item: { source: string }) => item.source === "memory")).toBe(true);
  });

  test("workspace Sui preview and receipt routes save output evidence", async () => {
    const { base, dir } = await boot();

    const preview = await jsonFetch(base, "/workspace/ws_evidence/sui/transactions/preview", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "sess_sui_evidence",
        payload: {
          network: "testnet",
          sender: "0x2",
          recipient: "0x3",
          amountMist: "1000000000",
          memo: "Grant wallet test preview",
        },
      }),
    });

    expect(preview.response.status).toBe(201);
    expect(preview.payload.success).toBe(true);
    expect(preview.payload.evidence).toMatchObject({
      workspaceId: "ws_evidence",
      sessionSlug: "sess_sui_evidence",
      source: "task_events",
    });
    expect(preview.payload.evidence.outputPath).toContain("outputs/sui/sess_sui_evidence/transfer-preview-");
    expect(existsSync(join(dir, preview.payload.evidence.outputPath))).toBe(true);

    const previewFile = JSON.parse(readFileSync(join(dir, preview.payload.evidence.outputPath), "utf8"));
    expect(previewFile).toMatchObject({
      version: "matterhorn.sui.workspace-evidence.v1",
      kind: "transaction_preview",
      workspaceId: "ws_evidence",
      safety: {
        custody: false,
        canSubmit: false,
        liveSubmissionEnabled: false,
        signingInMatterhorn: false,
      },
    });

    const receipt = await jsonFetch(base, "/workspace/ws_evidence/sui/transactions/receipt", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "sess_sui_evidence",
        payload: {
          network: "testnet",
          previewSha256: preview.payload.preview.previewSha256,
          transactionDigest: "5xY8P6TQ4qGsGLk1qUZ9vCkD8uWnz1wQp2mgSm7Jyzky",
          status: "success",
          sender: "0x2",
          recipient: "0x3",
          amountMist: "1000000000",
          explorerUrl: "https://suivision.xyz/txblock/5xY8P6TQ4qGsGLk1qUZ9vCkD8uWnz1wQp2mgSm7Jyzky",
        },
      }),
    });

    expect(receipt.response.status).toBe(201);
    expect(receipt.payload.success).toBe(true);
    expect(receipt.payload.evidence.outputPath).toContain("outputs/sui/sess_sui_evidence/transaction-receipt-");
    expect(existsSync(join(dir, receipt.payload.evidence.outputPath))).toBe(true);

    const evidence = await jsonFetch(base, "/workspace/ws_evidence/evidence?desk=sui&limit=20");
    expect(evidence.response.status).toBe(200);
    expect(evidence.payload.summary.outputs).toBeGreaterThanOrEqual(2);
    const outputPaths = evidence.payload.items
      .filter((item: { type: string }) => item.type === "task.output_saved")
      .map((item: { outputPath?: string }) => item.outputPath);
    expect(outputPaths).toContain(preview.payload.evidence.outputPath);
    expect(outputPaths).toContain(receipt.payload.evidence.outputPath);

    const ledger = await jsonFetch(base, "/workspace/ws_evidence/data-ledger?kind=output&limit=20");
    expect(ledger.response.status).toBe(200);
    expect(ledger.payload.policy.trainingUse).toBe("none_by_default");
    expect(ledger.payload.items.map((item: { outputPath?: string }) => item.outputPath)).toEqual(
      expect.arrayContaining([
        preview.payload.evidence.outputPath,
        receipt.payload.evidence.outputPath,
      ]),
    );
    expect(JSON.stringify(ledger.payload.items)).not.toMatch(/private[_\s-]?key|seed[_\s-]?phrase|mnemonic|wallet export|raw signature|signed payload/i);
  });

  test("GET /workspace/:id/evidence rejects unknown source filters", async () => {
    const { base } = await boot();
    const response = await jsonFetch(base, "/workspace/ws_evidence/evidence?source=private_keys");
    expect(response.response.status).toBe(400);
    expect(response.payload.code).toBe("invalid_project_evidence_source");
  });
});

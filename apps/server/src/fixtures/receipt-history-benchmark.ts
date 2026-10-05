// Opt-in, disposable local benchmark. No provider, credentials or user data.
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MatterhornAgentPrivacyPreflightResponse } from "@matterhorn-work/types/guarded-agent-runtime";
import { MatterhornAgentRunReceiptStore } from "../agent-run-receipts.js";
import { testDurableStateAuthority } from "../durable-state-authority.test-support.js";
import { MatterhornGuardedRuntimeStateStore } from "../guarded-runtime-state-store.js";

if (process.argv.slice(2).join(" ") !== "--run-local-benchmark") {
  throw new Error("Explicit --run-local-benchmark required");
}
const root = await mkdtemp(join(tmpdir(), "matterhorn-receipt-benchmark-"));
process.env.MATTERHORN_WORK_DATA_DIR = root;
const state = new MatterhornGuardedRuntimeStateStore(join(root, "state.db"));
const authority = testDurableStateAuthority();
const store = new MatterhornAgentRunReceiptStore(state, authority);
const preflight = (workspaceId: string): MatterhornAgentPrivacyPreflightResponse => ({
  version: "matterhorn.agent-privacy-preflight.v1", requestHash: "synthetic-benchmark",
  workspaceId, sessionId: "ses_benchmark", requestedMode: "public_research", effectiveMode: "public_research",
  decision: "allow", provider: { id: "local", name: "Synthetic benchmark", modelId: "none",
    privacyStatus: "local_processing", trainingUse: "none", retentionDays: 0, policyUrl: null, dataLeavesMatterhorn: false },
  detectedData: { labels: ["public"], categories: [], redactionCount: 0 }, reason: "Local synthetic benchmark only",
});
const round = (value: number) => Math.round(value * 100) / 100;
async function measure(workspaceId: string, runId: string, records: number) {
  const reads: number[] = [];
  const eventLoopDelays: number[] = [];
  for (let i = 0; i < 5; i++) {
    const began = performance.now();
    const timer = new Promise<number>(resolve => setTimeout(() => resolve(performance.now() - began), 0));
    if (!await store.get(workspaceId, runId)) throw new Error("Benchmark receipt missing");
    reads.push(performance.now() - began);
    eventLoopDelays.push(await timer);
  }
  const started = performance.now();
  await store.complete({ runId, status: "success", usage: { inputTokens: records } });
  const writeMs = performance.now() - started;
  const dir = join(root, "security-receipts", workspaceId);
  const segments = await Promise.all((await readdir(dir)).map(name => readFile(join(dir, name))));
  console.log(JSON.stringify({ scenario: workspaceId, generatedOperations: records,
    recordsAfterWrite: segments.reduce((sum, bytes) => sum + bytes.toString("utf8").trim().split("\n").length, 0),
    bytesAfterWrite: segments.reduce((sum, bytes) => sum + bytes.length, 0),
    readMs: reads.map(round), timerDelayMs: eventLoopDelays.map(round), writeMs: round(writeMs) }));
}
try {
  console.log(JSON.stringify({ bun: Bun.version, nodeCompatibilityVersion: process.version, platform: process.platform, architecture: process.arch,
    evidence: "local synthetic timing, five reads and one write per checkpoint; not a load test or SLA" }));
  for (const scenario of ["snapshots", "distinct_runs"]) {
    const workspaceId = `ws_benchmark_${scenario}`;
    const limit = scenario === "snapshots" ? 1000 : 500;
    for (let i = 1; i <= limit; i++) {
      const runId = scenario === "snapshots" ? "run_benchmark_snapshots" : `run_benchmark_${i}`;
      if (scenario === "distinct_runs" || i === 1) {
        await store.start({ workspaceId, runId, sessionId: "ses_benchmark", consentUsed: false,
          preflight: preflight(workspaceId) });
      } else await store.complete({ runId, status: "success", usage: { inputTokens: i } });
      if ([100, 500, 1000].includes(i)) await measure(workspaceId, runId, i);
    }
  }
} finally { state.close(); authority.close(); await rm(root, { recursive: true, force: true }); }

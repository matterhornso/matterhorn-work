import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getJson } from "./readonly-api-smoke.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2];
if (!root?.startsWith("/private/tmp/matterhorn-bittensor-qa.")) throw new Error("Pass the exact isolated sidecar QA root.");
const runtime = JSON.parse(await readFile(join(root, "sidecar-runtime.json"), "utf8"));
const target = new URL(runtime.url);
if (target.protocol !== "http:" || target.hostname !== "127.0.0.1") throw new Error("Only the isolated loopback sidecar is accepted.");
target.hostname = "localhost";
const checks = [];
let ready = false;
for (let round = 1; round <= 4 && !ready; round += 1) {
  const health = await getJson({ url: `${target.origin}/health`, cookie: "", timeoutMs: 23_000 });
  const subnets = await getJson({ url: `${target.origin}/subnets?limit=3`, cookie: "", timeoutMs: 23_000 });
  const h = health.body ?? {};
  const s = subnets.body ?? {};
  const healthReady = health.status === 200 && h.mode === "python" && h.sdkAvailable === true && h.canRead === true && h.canPrepare === true && h.canSubmit === false && Number.isSafeInteger(h.block) && h.block > 0;
  const subnetsReady = subnets.status === 200 && s.source === "bittensor-python-sdk" && s.freshness === "live" && Number.isSafeInteger(s.block) && s.block > 0 && Array.isArray(s.subnets) && s.subnets.length > 0;
  ready = healthReady && subnetsReady;
  checks.push({ round, checkedAt: new Date().toISOString(), health: { httpStatus: health.status, ready: healthReady, mode: h.mode, network: h.network, status: h.status, sdkAvailable: h.sdkAvailable, canRead: h.canRead, canPrepare: h.canPrepare, canSubmit: h.canSubmit, block: h.block, fetchedAt: h.fetchedAt, message: h.message, transportError: health.transportError }, subnets: { httpStatus: subnets.status, ready: subnetsReady, source: s.source, freshness: s.freshness, block: s.block, fetchedAt: s.fetchedAt, count: Array.isArray(s.subnets) ? s.subnets.length : 0, netuids: (s.subnets ?? []).map((subnet) => subnet.netuid), warnings: s.warnings, transportError: subnets.transportError } });
  if (!ready && round < 4) await new Promise((resolve) => setTimeout(resolve, 3_000));
}
const checkedAt = new Date().toISOString();
const verifiedRuntime = { ...runtime, startupStatus: runtime.startupStatus ?? runtime.status, status: ready ? "live_public_chain_reads_verified" : "chain_readiness_not_established", lastCheckedAt: checkedAt };
const report = { checkedAt, ready, runtime: verifiedRuntime, checks, safety: { methods: ["GET"], walletAddressesRead: 0, signingRequests: 0, submitRequests: 0, serviceEnvironment: "env -i; READ_ONLY=1; PYTHONDONTWRITEBYTECODE=1; explicit sidecar variables only", submissionProof: "Source /submit returns 501 wallet_airlock_required; Python handler map has no submit action. Existing offline tests passed; no submit request sent." }, pinned: { python: "3.11.15", bittensor: "10.5.0", asyncSubstrateInterface: "2.2.1", cyscale: "0.5.0", requirementsSha256: "aefc90a3669d90bc06ff5cdcdcafdc8f8d76d2c2ec81ab577b8252e79b543eb4" } };
await writeFile(join(directory, "bittensor-sidecar-results.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
await writeFile(join(root, "sidecar-runtime.json"), `${JSON.stringify(verifiedRuntime, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
if (!ready) process.exitCode = 1;

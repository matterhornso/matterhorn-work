import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { readFile } from "node:fs/promises";
import { JEV_CONSENT_VERSION } from "@matterhorn-work/types/jev";
import { MATTERHORN_AGENT_RUN_RECEIPT_VERSION, type MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

export async function startResponsiveChatFixture(port = 0) {
  const bundle = await build({ configFile: false, envDir: false, root: new URL("../", import.meta.url).pathname, logLevel: "error",
    resolve: { alias: { "@": new URL("../src", import.meta.url).pathname }, dedupe: ["react", "react-dom"] }, plugins: [tailwindcss()],
    define: { "process.env.NODE_ENV": '"development"', "import.meta.env.VITE_MATTERHORN_DEPLOYMENT": '"web"', "import.meta.env.VITE_MATTERHORN_PUBLIC_BETA": '"1"' },
    build: { target: "esnext", write: false, minify: false, lib: { entry: new URL("./fixtures/responsive-chat.tsx", import.meta.url).pathname, formats: ["es"] }, rollupOptions: { output: { inlineDynamicImports: true } } },
  });
  const built = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!("output" in built)) throw Error("Missing bundle");
  const script = built.output.find(item => item.type === "chunk" && item.isEntry);
  if (!script || script.type !== "chunk") throw Error("Missing script");
  const css = built.output.filter(item => item.type === "asset" && item.fileName.endsWith(".css"));
  const session = { id: "ses_responsive", slug: "responsive", projectID: "fixture", directory: "/fixture", title: "Bittensor chat", version: "1", time: { created: 1000, updated: 2000 } };
  const messages = [
    { info: { id: "user_responsive", sessionID: session.id, role: "user", time: { created: 1000 }, agent: "matterhorn-bittensor", model: { providerID: "fixture", modelID: "asi1" } }, parts: [{ id: "user_text", messageID: "user_responsive", sessionID: session.id, type: "text", text: "Explain public Bittensor subnet data. This is a synthetic layout test." }] },
    { info: { id: "assistant_responsive", parentID: "user_responsive", sessionID: session.id, role: "assistant", finish: "stop", time: { created: 2000, completed: 4000 }, modelID: "asi1", providerID: "fixture", mode: "work", agent: "matterhorn-bittensor", path: { cwd: "/fixture", root: "/fixture" }, cost: 0, tokens: { input: 3000, output: 878, reasoning: 0, cache: { read: 0, write: 0 } } }, parts: [{ id: "assistant_text", messageID: "assistant_responsive", sessionID: session.id, type: "text", text: ["Synthetic Bittensor response — no live-chain request was made.", ...Array.from({ length: 8 }, (_, index) => `Public-data section ${index + 1}: subnet and validator information is illustrative. Verify network, source, freshness and limitations before making decisions.`), "No signing, submission, or action prepared; all data is synthetic and unverified."].join("\n\n") }] },
  ];
  const receipt: MatterhornAgentRunReceipt = {
    version: MATTERHORN_AGENT_RUN_RECEIPT_VERSION, id: "receipt_responsive", runId: "run_responsive", workspaceId: "ws_responsive", sessionId: session.id,
    status: "success", startedAt: "2026-10-15T00:00:00Z", completedAt: "2026-10-15T00:00:20Z", responseDurationMs: 20000,
    provider: { id: "fixture", name: "CUDOS / ASI:Cloud", modelId: "asi1", privacyStatus: "unverified", trainingUse: "unknown", retentionDays: null, policyUrl: null },
    privacy: { mode: "public_research", dataCategories: ["public"], redactionCount: 0, consent: "not_required", dataLeavesMatterhorn: true },
    usage: { inputTokens: 4000, outputTokens: 3098, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0, toolCallBudget: { reads: 1, preparesPerFamily: 0, submits: 0 } },
    tools: [], memory: { readIds: [], writtenIds: [] }, capabilities: [], reviewedActions: [], integrity: { previousHash: null, recordHash: "synthetic-layout-only" },
  };
  let dispatched = 0;
  let aborted = 0;
  const pending: Array<() => void> = [];
  const server = Bun.serve({ hostname: "127.0.0.1", port, async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/fixture.js") return new Response(script.code, { headers: { "Content-Type": "text/javascript" } });
    if (path === "/fixture.css") return new Response(css.map(item => item.type === "asset" ? item.source : "").join("\n"), { headers: { "Content-Type": "text/css" } });
    if (path === "/__qa/evidence") return Response.json({ dispatched, aborted });
    if (path === "/__qa/dispatch") {
      dispatched++;
      await new Promise<void>(resolve => pending.push(resolve));
      return Response.json({ accepted: true });
    }
    if (path.endsWith("/abort")) {
      aborted++;
      pending.splice(0).forEach(resolve => resolve());
      return Response.json(true);
    }
    if (path.endsWith("/snapshot")) return Response.json({ item: { session, messages, todos: [], status: { type: "idle" } } });
    if (path.endsWith("/agent-run-receipts")) return Response.json({ items: [receipt], retention: { windowDays: 365, purgeSupported: true } });
    if (path.endsWith("/jev")) return Response.json({ available: false, reason: "not_configured", preferenceScope: "responsive-fixture", consentVersion: JEV_CONSENT_VERSION });
    if (path.endsWith("/readiness")) return Response.json({ features: { start_desk_task: { ready: true, blockingCheckIds: [] } }, checks: {} });
    const publicLogos = ["bittensor", "hyperliquid", "polymarket", "sui", "wellness", "memory", "mcps"]
      .flatMap(desk => [`/assets/desks/${desk}/logo-light.svg`, `/assets/desks/${desk}/logo-dark.svg`]);
    if ([...publicLogos, "/assets/desks/bittensor/logo-mono.svg", "/matterhorn-logo-square.svg"].includes(path)) {
      try { return new Response(await readFile(new URL(`../public${path}`, import.meta.url)), { headers: { "Content-Type": "image/svg+xml" } }); }
      catch { return new Response(null, { status: 404 }); }
    }
    if (path.includes("/workspace/") || path.includes("/session/")) return Response.json({ items: [], active: false });
    if (path !== "/") return new Response(null, { status: 404 });
    return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content"><title>Responsive chat QA — synthetic</title><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>', { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "connect-src \'self\'" } });
  } });
  return server;
}

if (import.meta.main) {
  const server = await startResponsiveChatFixture(Number(process.env.RESPONSIVE_QA_PORT ?? 0));
  console.log(`Responsive chat fixture: ${server.url} (synthetic data, no provider/accounts)`);
}

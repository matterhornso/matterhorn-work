// Local fixture runner. Inspect its UI with the supported browser tooling.
// Run: bun apps/app/scripts/chat-recovery-fixture.ts
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { JEV_CONSENT_VERSION } from "@matterhorn-work/types/jev";
import { MATTERHORN_CONTINUE_ANSWER_TEXT, type MatterhornAgentPrivacyPreflightResponse } from "@matterhorn-work/types/guarded-agent-runtime";

const bundle = await build({ configFile: false, envDir: false, root: new URL("../", import.meta.url).pathname, logLevel: "error",
  resolve: { alias: { "@": new URL("../src", import.meta.url).pathname }, dedupe: ["react", "react-dom"] }, plugins: [tailwindcss()],
  define: { "process.env.NODE_ENV": '"development"' },
  build: { target: "esnext", write: false, minify: false, lib: { entry: new URL("./fixtures/chat-recovery.tsx", import.meta.url).pathname, formats: ["es"] }, rollupOptions: { output: { inlineDynamicImports: true } } },
});
const built = Array.isArray(bundle) ? bundle[0] : bundle;
if (!("output" in built)) throw Error("Missing bundle");
const script = built.output.find(item => item.type === "chunk" && item.isEntry);
if (!script || script.type !== "chunk") throw Error("Missing script");
const css = built.output.filter(item => item.type === "asset" && item.fileName.endsWith(".css"));
const events: Array<{ path: string; body?: unknown }> = [];
const jevLifecycle = process.env.RECOVERY_QA_SCENARIO === "jev-lifecycle";
const pendingJev: Array<() => void> = [];
let abortedJev = 0;
const session = { id: "ses_recovery", slug: "recovery", projectID: "fixture", directory: "/fixture", title: "Recovery QA", version: "1", time: { created: 1000, updated: 2000 } };
const user = (id: string, text: string) => ({ info: { id, sessionID: session.id, role: "user", time: { created: 1000 }, agent: "fixture", model: { providerID: "fixture", modelID: "fixture" } },
  parts: [{ id: `${id}_text`, messageID: id, sessionID: session.id, type: "text", text }] });
const assistant = (id: string, parentID: string, finish: string, text: string, failed = false) => ({
  info: { id, parentID, sessionID: session.id, role: "assistant", finish, time: { created: 2000, completed: 2100 },
    modelID: "fixture", providerID: "fixture", mode: "work", agent: "fixture", path: { cwd: "/fixture", root: "/fixture" }, cost: 0,
    tokens: { input: 100, output: 20, reasoning: 0, cache: { read: 0, write: 0 } },
    ...(failed ? { error: { name: "APIError", data: { message: "Fixture provider failed", isRetryable: true } } } : {}) },
  parts: text ? [{ id: `${id}_text`, messageID: id, sessionID: session.id, type: "text", text }] : [],
});
let messages = [user("user_original", "Explain public validators."), assistant("assistant_partial", "user_original", "length", "Public validators participate in")];
if (jevLifecycle) messages = [];
let reverted = false;
const preflight: MatterhornAgentPrivacyPreflightResponse = {
  version: "matterhorn.agent-privacy-preflight.v1", workspaceId: "ws_recovery", sessionId: session.id,
  requestedMode: "public_research", effectiveMode: "private_workspace", decision: "consent_required", requestHash: "fixture-request",
  challenge: { id: "fixture-challenge", expiresAt: new Date(Date.now() + 3600000).toISOString(), singleUse: true },
  provider: { id: "fixture", name: "Fixture provider", modelId: "fixture", privacyStatus: "unverified",
    trainingUse: "unknown", retentionDays: null, policyUrl: null, dataLeavesMatterhorn: true },
  detectedData: { labels: ["workspace_private"], categories: ["session_history"], redactionCount: 0 },
  reason: "Synthetic private history requires confirmation." };
const server = Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.RECOVERY_QA_PORT ?? 0), async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/fixture.js") return new Response(script.code, { headers: { "Content-Type": "text/javascript" } });
  if (path === "/fixture.css") return new Response(css.map(item => item.type === "asset" ? item.source : "").join("\n"), { headers: { "Content-Type": "text/css" } });
  if (path === "/__qa/evidence") return Response.json({ events, reverted, pendingJev: pendingJev.length, abortedJev });
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    events.push({ path, body });
    if (path === "/__qa/release-jev") {
      pendingJev.splice(0).forEach(release => release());
      return Response.json({ released: true });
    }
    if (path === "/__qa/dispatch") {
      if (jevLifecycle) {
        const id = String(events.length);
        messages = [...messages, user(`user_${id}`, body.text), assistant(`assistant_${id}`, `user_${id}`, "stop", "Synthetic selected-model answer. No live provider was called.")];
        return Response.json({ accepted: true });
      }
      if (body.continuationOf) {
        messages = [...messages, user("user_continue", MATTERHORN_CONTINUE_ANSWER_TEXT), assistant("assistant_failed", "user_continue", "unknown", "", true)];
        return Response.json({ accepted: true });
      }
      if (!body.privacy?.consentToken) return Response.json({ privacyPreflight: preflight }, { status: 409 });
      if (body.text !== MATTERHORN_CONTINUE_ANSWER_TEXT || body.answerOnly !== true || !body.jevReceipt) return Response.json({ error: "Retry lost its binding" }, { status: 400 });
      messages = [...messages.slice(0, 2), user("user_retry", body.text), assistant("assistant_done", "user_retry", "stop", "Fixture recovery succeeded with the selected model.")];
      reverted = false;
      return Response.json({ accepted: true });
    }
    if (path.endsWith("/jev")) {
      if (jevLifecycle) {
        const aborted = () => { abortedJev++; };
        request.signal.addEventListener("abort", aborted, { once: true });
        await new Promise<void>(resolve => pendingJev.push(resolve));
        request.signal.removeEventListener("abort", aborted);
      }
      return Response.json({ status: "classified", receipt: "fixture-scoped-receipt", expiresAt: Date.now() + 300000, topic: "general", task: "explain" });
    }
    if (path.endsWith("/confirm")) return Response.json({ consentToken: "fixture-consent" });
    if (path.endsWith("/abort")) return Response.json(true);
    if (path.endsWith("/revert")) reverted = true;
    if (path.endsWith("/unrevert")) reverted = false;
    return Response.json(session);
  }
  if (path.endsWith("/snapshot")) return Response.json({ item: { session, messages, todos: [], status: { type: "idle" } } });
  if (path === "/workspace/ws_recovery/jev") return Response.json({ available: true, reason: "Fixture", preferenceScope: "recovery-fixture", consentVersion: JEV_CONSENT_VERSION });
  if (path.includes("/workspace/") || path.includes("/session/")) return Response.json({ items: [], active: false });
  return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recovery QA fixture</title><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>', { headers: { "Content-Type": "text/html", "Content-Security-Policy": "connect-src 'self'" } });
} });
console.log(`Recovery fixture: ${server.url}${jevLifecycle ? "?scenario=jev-lifecycle" : ""} (synthetic, no live providers)`);

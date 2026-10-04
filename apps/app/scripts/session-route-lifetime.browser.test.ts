import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { delayImagePreparation, delayedImage, releaseImagePreparation } from "./fixtures/attachment-preparation";
import { MATTERHORN_CONTINUE_ANSWER_TEXT } from "@matterhorn-work/types/guarded-agent-runtime";

// Production shell with synthetic account/runtime services. Attachment integration
// cases additionally use an isolated real gateway with legitimate local bearer auth;
// they do not certify hosted login, tenant isolation or real inference.

let browser: Browser;
let server: ReturnType<typeof Bun.serve>;
const requests: Array<{ path: string; method: string }> = [];
let release: (() => void) | undefined;
let signedIn = true;
let forked = false;
let action: "fork" | "revert" = "fork";
let rejectAction = false;
let promptFailure: "preflight" | "dispatch" | null = null;
let promptFixture = false;
let consentFixture = false;
let rejectConsent = false;
let delayedPromptDispatch = false;
let rejectDelayedPrompt = false;
let responseRetryFixture = false;
let historyText = true;
let terminalFailure = false;
let terminalRateLimited = false;
let terminalProviderUnavailable = false;
let terminalStopped = false;
let historyContinuation = false;
let incompleteResponse = false;
let historyFiles: Array<{ type: "file"; id: string; messageID: string; sessionID: string; url: string; filename: string; mime: string }> = [];
const promptRequests: Array<{ stage: string; body: unknown }> = [];
let realGateway: { origin: string; runtimeOrigin: string } | undefined;
const gatewayResults: Array<{ status: number; payload: unknown }> = [];

async function startAttachmentBackend() {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-browser-gateway-"));
  const child = Bun.spawn([process.execPath, new URL("./fixtures/attachment-backend.ts", import.meta.url).pathname, root], {
    // Do not inherit provider keys, production configuration or durable databases.
    env: {
      PATH: process.env.PATH,
      OPENWORK_DATA_DIR: join(root, "state"),
      MATTERHORN_WORK_DATA_DIR: join(root, "data"),
      MATTERHORN_WORK_MEMORY_ROOT: join(root, "memory"),
      MATTERHORN_AUTH_DB: join(root, "auth.db"),
      MATTERHORN_MODEL_USAGE_DB: join(root, "usage.db"),
      MATTERHORN_GUARDED_RUNTIME_MODE: "off",
      MATTERHORN_PROVIDER_PRIVACY_MODE: "off",
      MATTERHORN_CAPABILITY_SIGNING_SECRET: "disposable-browser-attachment-signing-secret",
    }, stdout: "pipe", stderr: "pipe",
  });
  const errors = new Response(child.stderr).text();
  const stop = async () => {
    realGateway = undefined;
    child.kill();
    await child.exited;
    await rm(root, { recursive: true, force: true });
  };
  const timer = setTimeout(() => child.kill(), 30_000);
  try {
    const reader = child.stdout.getReader();
    let output = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`Attachment backend failed: ${await errors}`);
      output += new TextDecoder().decode(chunk.value);
      const ready = output.match(/ATTACHMENT_BACKEND_READY (.+)\n/);
      if (!ready) continue;
      const ports: unknown = JSON.parse(ready[1]);
      if (!ports || typeof ports !== "object" || !("port" in ports) || !("runtimePort" in ports)
        || typeof ports.port !== "number" || typeof ports.runtimePort !== "number") throw new Error("Invalid fixture ports");
      realGateway = { origin: `http://127.0.0.1:${ports.port}`, runtimeOrigin: `http://127.0.0.1:${ports.runtimePort}` };
      reader.releaseLock();
      return stop;
    }
  } catch (error) { await stop(); throw error; }
  finally { clearTimeout(timer); }
}
const session = (id: string) => ({
  id,
  slug: id,
  title:
    id === "ses_fixture"
      ? "Original fixture chat"
      : id === "ses_other"
        ? "Other fixture chat"
        : "Forked fixture chat",
  directory: "/fixture",
  projectID: "fixture",
  version: "1",
  time: { created: 1000, updated: 2000 },
});
const messages = [
  {
    info: {
      id: "msg_user",
      sessionID: "ses_fixture",
      role: "user",
      time: { created: 1000 },
      agent: "matterhorn",
      model: { providerID: "fixture", modelID: "fixture" },
    },
    parts: [
      {
        id: "part_user",
        messageID: "msg_user",
        sessionID: "ses_fixture",
        type: "text",
        text: "Synthetic question.",
      },
    ],
  },
  {
    info: {
      id: "msg_answer",
      parentID: "msg_user",
      sessionID: "ses_fixture",
      role: "assistant",
      finish: "stop",
      time: { created: 2000, completed: 2100 },
      modelID: "fixture",
      providerID: "fixture",
      mode: "work",
      agent: "matterhorn",
      path: { cwd: "/fixture", root: "/fixture" },
      cost: 0,
      tokens: {
        input: 20,
        output: 10,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
    parts: [
      {
        id: "part_answer",
        messageID: "msg_answer",
        sessionID: "ses_fixture",
        type: "text",
        text: "Synthetic completed answer. No provider was called.",
      },
    ],
  },
];
const fixtureMessages = () => [
  { ...messages[0], parts: [...(historyText ? messages[0].parts.map(part => historyContinuation ? { ...part, text: MATTERHORN_CONTINUE_ANSWER_TEXT } : part) : []), ...historyFiles] },
  terminalFailure ? { ...messages[1], info: { ...messages[1].info,
    error: terminalStopped ? { name: "MessageAbortedError", data: { message: "Stopped" } }
      : terminalProviderUnavailable ? { name: "APIError", data: { message: "No provider available", statusCode: 401 } }
      : terminalRateLimited ? { name: "APIError", data: { message: "Too many requests", statusCode: 429 } }
      : { name: "UnknownError", data: { message: "Synthetic accepted request failed." } } }, parts: [] }
    : incompleteResponse ? { ...messages[1], info: { ...messages[1].info, finish: "length" } } : messages[1],
];

beforeAll(async () => {
  const bundle = await build({
    configFile: false,
    envDir: false,
    root: new URL("../", import.meta.url).pathname,
    logLevel: "error",
    resolve: {
      alias: { "@": new URL("../src", import.meta.url).pathname },
      dedupe: ["react", "react-dom"],
    },
    plugins: [
      tailwindcss(),
      {
        name: "fixture-only-negative-control",
        transform(code, id) {
          if (process.env.QA_ATTACHMENT_STALE_STATE === "1" && id.endsWith("/surface/session-surface.tsx")) {
            const read = "const current = getComposerAttachments(useComposerStateStore.getState(), props.sessionId);";
            if (code.split(read).length !== 3) throw new Error("Attachment state guards changed; review negative control");
            return code.replaceAll(read, "const current = attachments;");
          }
          if (
            process.env.QA_SESSION_LIFETIME_UNGUARDED === "1" &&
            id.endsWith("/shell/session-route.tsx")
          ) {
            // Mutation test: deliberately broken in-memory bundle, never app source.
            if (
              code.split("isCurrentAccount() && sessionActionScope.current")
                .length !== 3
            )
              throw new Error(
                "Negative-control guards changed; review the fixture",
              );
            return code.replaceAll(
              "isCurrentAccount() && sessionActionScope.current",
              "true",
            );
          }
        },
      },
    ],
    define: {
      "process.env.NODE_ENV": '"development"',
      "import.meta.env.VITE_MATTERHORN_DEPLOYMENT": '"web"',
      "import.meta.env.VITE_MATTERHORN_CLOUD_URL": "window.location.origin",
      "import.meta.env.VITE_MATTERHORN_CLOUD_API_URL": "window.location.origin",
      "import.meta.env.VITE_MATTERHORN_CLOUD_ENABLED": '"1"',
      "import.meta.env.VITE_MATTERHORN_PUBLIC_BETA": '"1"',
      "import.meta.env.VITE_MATTERHORN_REQUIRE_SIGNIN": '"1"',
    },
    build: {
      target: "esnext",
      write: false,
      minify: false,
      rollupOptions: {
        input: new URL("./fixtures/session-route-lifetime.tsx", import.meta.url)
          .pathname,
        output: {
          entryFileNames: "fixture.js",
          chunkFileNames: "[name]-[hash].js",
          assetFileNames: "[name]-[hash][extname]",
        },
      },
    },
  });
  const built = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!("output" in built)) throw new Error("Missing fixture output");
  const script = built.output.find(
    (item) => item.type === "chunk" && item.isEntry,
  );
  if (!script || script.type !== "chunk")
    throw new Error("Missing fixture script");
  const css = built.output.filter(
    (item) => item.type === "asset" && item.fileName.endsWith(".css"),
  );
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (
        /^\/(matterhorn-logo-square\.svg|assets\/desks\/[a-z]+\/logo-(light|dark)\.svg)$/.test(
          path,
        )
      ) {
        return new Response(
          Bun.file(new URL(`../public${path}`, import.meta.url)),
        );
      }
      if (path === "/fixture.js")
        return new Response(script.code, {
          headers: { "Content-Type": "text/javascript" },
        });
      const asset = built.output.find((item) => `/${item.fileName}` === path);
      if (asset)
        return new Response(
          asset.type === "chunk" ? asset.code : asset.source,
          {
            headers: {
              "Content-Type":
                asset.type === "chunk"
                  ? "text/javascript"
                  : path.endsWith(".css")
                    ? "text/css"
                    : "application/octet-stream",
            },
          },
        );
      if (path === "/fixture.css")
        return new Response(
          css
            .map((item) => (item.type === "asset" ? item.source : ""))
            .join("\n"),
          { headers: { "Content-Type": "text/css" } },
        );
      if (request.headers.get("accept")?.includes("text/html"))
        return new Response(
          '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Disposable session lifecycle fixture</title><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>',
          {
            headers: {
              "Content-Type": "text/html",
              "Cache-Control": "no-store",
            },
          },
        );
      requests.push({ path, method: request.method });
      if (consentFixture && path.endsWith("/privacy-consents/fixture_challenge/confirm")) {
        await new Promise<void>(resolve => { release = resolve; });
        return rejectConsent
          ? Response.json({ message: "Synthetic consent confirmation failed." }, { status: 500 })
          : Response.json({ consentToken: "synthetic-consent-token" });
      }
      if (responseRetryFixture && request.method === "POST" && /\/(abort|revert|unrevert)$/.test(path)) {
        return Response.json(path.endsWith("/abort") ? true : session("ses_fixture"));
      }
      if (realGateway && request.method === "POST" && (path.endsWith("/messages/preflight") || path.endsWith("/messages"))) {
        // Browser bytes reach the production gateway unchanged. Only transport
        // authentication uses this isolated local server's legitimate test token.
        const response = await fetch(`${realGateway.origin}${path}`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer disposable-browser-attachment-token" },
          body: await request.arrayBuffer(), redirect: "error",
        });
        const payload: unknown = await response.json();
        gatewayResults.push({ status: response.status, payload });
        return Response.json(payload, { status: response.status });
      }
      if (promptFixture && request.method === "POST" && (path.endsWith("/messages/preflight") || path.endsWith("/messages"))) {
        const stage = path.endsWith("/preflight") ? "preflight" : "dispatch";
        promptRequests.push({ stage, body: await request.json() });
        if (stage === "dispatch" && delayedPromptDispatch) {
          await new Promise<void>(resolve => { release = resolve; });
          if (rejectDelayedPrompt) return Response.json({ message: "Synthetic delayed dispatch failed." }, { status: 500 });
        }
        if (promptFailure === stage) return Response.json({
          code: "attachments_too_large", message: "Remove a file and try again. Synthetic attachment rejection.",
        }, { status: 413 });
        if (stage === "preflight" && consentFixture) return Response.json({
          version: "matterhorn.agent-privacy-preflight.v1", requestHash: "fixture_request_hash",
          workspaceId: "ws_fixture", sessionId: "ses_fixture", requestedMode: "public_research", effectiveMode: "private_workspace",
          decision: "consent_required", reason: "Synthetic private-context approval required.",
          provider: { id: "fixture", name: "Fixture provider", modelId: "fixture", privacyStatus: "unverified",
            trainingUse: "unknown", retentionDays: null, policyUrl: null, dataLeavesMatterhorn: true },
          detectedData: { labels: ["workspace_private"], categories: ["workspace_attachment"], redactionCount: 0 },
          challenge: { id: "fixture_challenge", expiresAt: new Date(Date.now() + 60000).toISOString(), singleUse: true },
          ...(incompleteResponse ? { continuation: { messageId: "msg_answer", tools: "disabled" } } : {}),
        });
        if (stage === "preflight") return Response.json({ decision: "allow", reason: "Synthetic fixture only",
          ...(incompleteResponse ? { continuation: { messageId: "msg_answer", tools: "disabled" } } : {}),
        });
        return Response.json({ accepted: true }, { status: 202 });
      }
      if (path === "/v1/me")
        return signedIn
          ? Response.json({
              user: {
                id: "fixture-user",
                email: "fixture@example.invalid",
                name: "Fixture user",
              },
            })
          : Response.json({ message: "Signed out" }, { status: 401 });
      if (path === "/v1/me/orgs")
        return Response.json({
          orgs: [
            {
              id: "fixture-org",
              slug: "fixture-org",
              name: "Disposable organization",
              role: "owner",
            },
          ],
          activeOrgId: "fixture-org",
          activeOrgSlug: "fixture-org",
        });
      if (path === "/api/auth/sign-out") {
        signedIn = false;
        return Response.json({ ok: true });
      }
      if (path === "/v1/me/desktop-config") return Response.json({});
      if (path === "/workspaces")
        return Response.json({
          items: [
            {
              id: "ws_fixture",
              name: "Disposable workspace",
              path: "/fixture",
              workspaceType: "local",
              preset: "starter",
            },
          ],
          activeId: "ws_fixture",
        });
      if (path.endsWith("/sessions"))
        return Response.json({
          items: [
            session("ses_fixture"),
            session("ses_other"),
            ...(forked ? [session("ses_fork")] : []),
          ],
        });
      if (path.endsWith("/snapshot")) {
        const id = path.includes("ses_other")
          ? "ses_other"
          : path.includes("ses_fork")
            ? "ses_fork"
            : "ses_fixture";
        return Response.json({
          item: {
            session: session(id),
            messages: id === "ses_fixture" ? fixtureMessages() : [],
            todos: [],
            status: { type: "idle" },
          },
        });
      }
      if (path.endsWith("/messages")) return Response.json({ items: fixtureMessages() });
      if (path.endsWith("/coworker"))
        return Response.json({ active: false, binding: null, coworker: null });
      if (/\/sessions\/ses_/.test(path))
        return Response.json({
          item: session(path.split("/").at(-1) ?? "ses_fixture"),
        });
      if (path.endsWith("/provider"))
        return Response.json({
          all: [
            {
              id: realGateway ? "local" : "fixture",
              name: "Fixture",
              source: "api",
              models: {
                ...(consentFixture ? { alternate: { id: "alternate", name: "Alternate test model", limit: { context: 10000, output: 1000 } } } : {}),
                [realGateway ? "private-local-model" : "fixture"]: {
                  id: realGateway ? "private-local-model" : "fixture",
                  name: "Fixture model",
                  limit: { context: 10000, output: 1000 },
                },
              },
            },
          ],
          connected: [realGateway ? "local" : "fixture"],
          default: realGateway ? { local: "private-local-model" } : { fixture: "fixture" },
        });
      if (path.endsWith("/agent"))
        return Response.json([
          { name: "matterhorn", mode: "primary", permission: [], options: {} },
        ]);
      if (path.endsWith("/session/status")) return Response.json({});
      if (path.endsWith("/session"))
        return Response.json([session("ses_fixture"), session("ses_other")]);
      if (path.endsWith(`/${action}`) && request.method === "POST") {
        await new Promise<void>((done) => {
          release = done;
        });
        if (rejectAction)
          return Response.json(
            { message: "Synthetic action failure" },
            { status: 500 },
          );
        if (action === "fork") forked = true;
        return Response.json(
          session(action === "fork" ? "ses_fork" : "ses_fixture"),
        );
      }
      if (path.endsWith("/abort")) return Response.json(true);
      if (path.endsWith("/config"))
        return Response.json({ model: "fixture/fixture" });
      if (
        path.endsWith("/command") ||
        path.endsWith("/permission") ||
        path.endsWith("/question")
      )
        return Response.json([]);
      if (path.endsWith("/event") || path.endsWith("/event-stream"))
        return new Response("", {
          headers: { "Content-Type": "text/event-stream" },
        });
      if (path.endsWith("/health"))
        return Response.json({
          ok: true,
          healthy: true,
          version: "fixture",
          uptimeMs: 1,
        });
      if (path.endsWith("/activate")) return Response.json({ ok: true });
      return Response.json({ items: [], ok: true });
    },
  });
  browser = await chromium.launch();
}, 120_000);
afterAll(async () => {
  release?.();
  await browser?.close();
  server?.stop(true);
});
beforeEach(() => {
  release = undefined;
  signedIn = true;
  forked = false;
  rejectAction = false;
  promptFailure = null;
  promptFixture = false;
  consentFixture = false;
  rejectConsent = false;
  delayedPromptDispatch = false;
  rejectDelayedPrompt = false;
  responseRetryFixture = false;
  historyText = true;
  terminalFailure = false;
  terminalRateLimited = false;
  terminalProviderUnavailable = false;
  terminalStopped = false;
  historyContinuation = false;
  incompleteResponse = false;
  historyFiles = [];
  promptRequests.length = 0;
  gatewayResults.length = 0;
  requests.length = 0;
});

const operations: Array<"fork" | "revert"> = ["fork", "revert"];
for (const earlier of ["retry", "continue"]) {
  for (const newerPending of [false, true]) {
    test(`same chat late ${earlier} failure preserves newer send pending=${newerPending}`, async () => {
      promptFixture = delayedPromptDispatch = responseRetryFixture = true;
      terminalFailure = earlier === "retry";
      incompleteResponse = earlier === "continue";
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      context.setDefaultTimeout(6000);
      await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
      const page = await context.newPage();
      let releaseEarlier: (() => void) | undefined;
      try {
        await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
        await page.getByRole("button", { name: "Change model", exact: true }).click();
        await page.getByRole("option", { name: /Fixture model/ }).click();
        await page.getByRole("button", { name: earlier === "retry" ? "Retry response" : "Continue answer", exact: true }).click();
        for (let attempt = 0; attempt < 100 && !release; attempt++) await page.waitForTimeout(20);
        expect(release).toBeDefined();
        releaseEarlier = release;
        terminalFailure = incompleteResponse = false;
        await page.getByRole("button", { name: "Other fixture chat", exact: true }).click();
        await page.waitForURL("**/ses_other");
        await page.getByRole("button", { name: "Original fixture chat", exact: true }).click();
        await page.waitForURL("**/ses_fixture");
        await page.waitForFunction(() => {
          const composer = window.__openwork?.slice("composer");
          return composer && typeof composer === "object" && "sessionId" in composer && composer.sessionId === "ses_fixture";
        });
        const editor = page.getByRole("textbox").first();
        await editor.fill("Newer request in the same chat");
        delayedPromptDispatch = newerPending;
        await page.getByRole("button", { name: "Ask", exact: true }).click();
        for (let attempt = 0; attempt < 100 && promptRequests.filter(request => request.stage === "dispatch").length < 2; attempt++) await page.waitForTimeout(20);
        expect(promptRequests.filter(request => request.stage === "dispatch")).toHaveLength(2);
        const releaseNewer = release;
        await editor.fill("Keep the newest draft");
        const activityCount = await page.evaluate(() => {
          const history = window.__openwork?.slice("qa-session-activity");
          return Array.isArray(history) ? history.length : -1;
        });
        expect(activityCount).toBeGreaterThanOrEqual(0);
        rejectDelayedPrompt = true;
        const oldResponse = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/messages"));
        releaseEarlier?.();
        await oldResponse;
        await page.waitForTimeout(250);
        expect((await editor.innerText()).trim()).toBe("Keep the newest draft");
        expect(await page.locator('[data-matterhorn-session-error]').filter({ hasText: "Synthetic delayed dispatch failed" }).count()).toBe(0);
        expect(await page.locator('[aria-label="Error"][title="Error"]').count()).toBe(0);
        expect(await page.evaluate(start => {
          const history = window.__openwork?.slice("qa-session-activity");
          return Array.isArray(history) ? history.slice(start).filter((item: unknown) => item && typeof item === "object"
            && "sessionId" in item && item.sessionId === "ses_fixture" && "status" in item && item.status === "error") : null;
        }, activityCount)).toEqual([]);
        if (newerPending) {
          expect(await page.evaluate(() => {
            const composer = window.__openwork?.slice("composer");
            return composer && typeof composer === "object" && "sending" in composer && composer.sending === true;
          })).toBe(true);
          rejectDelayedPrompt = false;
          releaseNewer?.();
          await page.waitForFunction(() => {
            const composer = window.__openwork?.slice("composer");
            return composer && typeof composer === "object" && "sending" in composer && composer.sending === false;
          });
        }
      } finally { releaseEarlier?.(); release?.(); await context.close(); }
    }, 30000);
  }
}
for (const rejected of [false, true]) {
  for (const otherPending of [false, true]) {
  test(`pending send does not block another chat with old rejection=${rejected} other pending=${otherPending}`, async () => {
    promptFixture = delayedPromptDispatch = true;
    rejectDelayedPrompt = rejected;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    context.setDefaultTimeout(5000);
    await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
    const page = await context.newPage();
    let releaseOriginal: (() => void) | undefined;
    try {
      await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
      await page.getByRole("button", { name: "Change model", exact: true }).click();
      await page.getByRole("option", { name: /Fixture model/ }).click();
      const editor = page.getByRole("textbox").first();
      await editor.fill("First chat request");
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      for (let attempt = 0; attempt < 100 && !release; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
      expect(release).toBeDefined();
      releaseOriginal = release;
      delayedPromptDispatch = otherPending;
      await page.getByRole("button", { name: "Other fixture chat", exact: true }).click();
      await page.waitForFunction(() => {
        const composer = window.__openwork?.slice("composer");
        return composer && typeof composer === "object" && "sessionId" in composer && composer.sessionId === "ses_other";
      });
      await page.getByRole("button", { name: "Change model", exact: true }).click();
      await page.getByRole("option", { name: /Fixture model/ }).click();
      await editor.fill("Second chat request");
      const ask = page.getByRole("button", { name: "Ask", exact: true });
      expect(await ask.isEnabled()).toBe(true);
      await ask.click();
      for (let attempt = 0; attempt < 100 && promptRequests.filter(request => request.stage === "dispatch").length < 2; attempt++) await page.waitForTimeout(20);
      expect(promptRequests.filter(request => request.stage === "dispatch")).toHaveLength(2);
      const releaseOther = release;
      await editor.fill("Preserve second chat after send");
      const oldResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/ses_fixture/messages"));
      releaseOriginal?.();
      await oldResponse;
      await page.waitForTimeout(250);
      expect((await editor.innerText()).trim()).toBe("Preserve second chat after send");
      expect(await page.locator('[data-matterhorn-session-error]').count()).toBe(0);
      if (otherPending) {
        expect(await page.evaluate(() => {
          const composer = window.__openwork?.slice("composer");
          return composer && typeof composer === "object" && "sending" in composer && composer.sending === true;
        })).toBe(true);
        expect(await ask.count()).toBe(0);
        expect(await page.getByRole("button", { name: "Stop generating", exact: true }).count()).toBe(1);
        rejectDelayedPrompt = false;
        const otherResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/ses_other/messages"));
        releaseOther?.();
        await otherResponse;
        await page.waitForFunction(() => {
          const composer = window.__openwork?.slice("composer");
          return composer && typeof composer === "object" && "sending" in composer && composer.sending === false;
        });
        expect((await editor.innerText()).trim()).toBe("Preserve second chat after send");
      }
    } finally { releaseOriginal?.(); release?.(); await context.close(); }
  }, 30000);
  }
}
for (const operation of ["send", "retry", "continue"]) {
  for (const boundary of ["unchanged", "navigate", "return"]) {
    for (const rejected of [false, true]) {
      test(`pending ${operation} completion rejected=${rejected} after ${boundary}`, async () => {
        promptFixture = delayedPromptDispatch = responseRetryFixture = true;
        rejectDelayedPrompt = rejected;
        terminalFailure = operation === "retry";
        incompleteResponse = operation === "continue";
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        context.setDefaultTimeout(8000);
        await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
        const page = await context.newPage();
        try {
          await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
          await page.getByRole("button", { name: "Change model", exact: true }).click();
          await page.getByRole("option", { name: /Fixture model/ }).click();
          const editor = page.getByRole("textbox").first();
          await editor.fill("Original in-progress draft");
          if (operation === "send") await page.getByRole("button", { name: "Ask", exact: true }).click();
          if (operation === "retry") await page.locator('[data-matterhorn-session-error]').getByRole("button", { name: "Retry response", exact: true }).click();
          if (operation === "continue") await page.getByRole("button", { name: "Continue answer", exact: true }).click();
          for (let attempt = 0; attempt < 100 && !release; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
          expect(release).toBeDefined();
          // The request has started. Navigation must not undo accepted work,
          // but its late feedback must not replace the newly viewed chat state.
          if (boundary !== "unchanged") {
            await page.getByRole("button", { name: "Other fixture chat", exact: true }).click();
            await page.waitForURL("**/ses_other");
            await page.waitForFunction(() => {
              const composer = window.__openwork?.slice("composer");
              return composer && typeof composer === "object" && "sessionId" in composer && composer.sessionId === "ses_other";
            });
            await editor.fill("Other chat draft");
            if (boundary === "return") {
              await page.getByRole("button", { name: "Original fixture chat", exact: true }).click();
              await page.waitForURL("**/ses_fixture");
              await page.waitForFunction(() => {
                const composer = window.__openwork?.slice("composer");
                return composer && typeof composer === "object" && "sessionId" in composer && composer.sessionId === "ses_fixture";
              });
            }
          }
          await editor.fill("Keep current draft");
          await page.locator('input[type="file"]').setInputFiles({ name: "current.txt", mimeType: "text/plain", buffer: Buffer.from("Keep current file") });
          await page.getByText("current.txt", { exact: true }).waitFor();
          const response = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/messages"));
          release?.();
          await response;
          await page.waitForTimeout(350);
          expect(promptRequests.filter(request => request.stage === "dispatch")).toHaveLength(1);
          expect((await editor.innerText()).trim()).toBe("Keep current draft");
          expect(await page.getByText("current.txt", { exact: true }).count()).toBe(1);
          const error = page.locator('[data-matterhorn-session-error]');
          if (boundary === "unchanged" && rejected) await error.getByText(/Synthetic delayed dispatch failed/).waitFor();
          else expect(await error.filter({ hasText: "Synthetic delayed dispatch failed" }).count()).toBe(0);
          if (boundary !== "unchanged") expect(await page.getByText("Response retry started", { exact: true }).count()).toBe(0);
        } finally { release?.(); await context.close(); }
      }, 30000);
    }
  }
}
for (const boundary of ["unchanged", "edit", "edit back", "attach", "preparing", "model", "dismiss", "navigate", "return", "cross-tab logout"]) {
  for (const rejected of [false, true]) {
    test(`delayed privacy confirmation rejected=${rejected} after ${boundary}`, async () => {
      promptFixture = true;
      consentFixture = true;
      rejectConsent = rejected;
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      context.setDefaultTimeout(8000);
      await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
      const page = await context.newPage();
      try {
        await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
        await page.getByRole("button", { name: "Change model", exact: true }).click();
        await page.getByRole("option", { name: /Fixture model/ }).click();
        const editor = page.getByRole("textbox").first();
        await editor.fill("Original private fixture draft");
        await page.getByRole("button", { name: "Ask", exact: true }).click();
        await page.getByRole("button", { name: "Share once and send", exact: true }).click();
        for (let attempt = 0; attempt < 100 && !release; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
        expect(release).toBeDefined();
        // Logout aborts pending account-bound HTTP requests. Observe that event
        // before changing accounts, rather than waiting for an impossible response.
        const confirmationFinished = Promise.race([
          page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/fixture_challenge/confirm")),
          page.waitForEvent("requestfailed", request => new URL(request.url()).pathname.endsWith("/fixture_challenge/confirm")),
        ]);
        void confirmationFinished.catch(() => { /* Awaited below; cleanup may close the page after another assertion fails. */ });
        if (boundary === "edit") await editor.fill("Keep my edited draft");
        if (boundary === "edit back") {
          await editor.fill("Temporary edit");
          await editor.fill("Original private fixture draft");
        }
        if (boundary === "attach") {
          await page.locator('input[type="file"]').setInputFiles({ name: "new.txt", mimeType: "text/plain", buffer: Buffer.from("New context") });
          await page.getByText("new.txt", { exact: true }).waitFor();
        }
        if (boundary === "preparing") {
          await delayImagePreparation(page);
          await page.locator('input[type="file"]').setInputFiles(await delayedImage(page));
          await page.waitForFunction(() => document.documentElement.dataset.imagePreparing === "true");
          expect(await page.getByRole("button", { name: "Ask", exact: true }).isDisabled()).toBe(true);
        }
        if (boundary === "model") {
          await page.getByRole("button", { name: "Change model", exact: true }).click();
          await page.getByRole("option", { name: /Alternate test model/ }).click();
        }
        if (boundary === "dismiss") await page.getByRole("button", { name: "Dismiss error", exact: true }).click();
        if (boundary === "navigate" || boundary === "return") {
          await page.getByRole("button", { name: "Other fixture chat", exact: true }).click();
          await page.waitForURL("**/ses_other");
          if (boundary === "return") {
            await page.getByRole("button", { name: "Original fixture chat", exact: true }).click();
            await page.waitForURL("**/ses_fixture");
          }
        }
        if (boundary === "cross-tab logout") {
          const other = await context.newPage();
          await other.goto(`${server.url}settings/cloud-account`);
          await other.getByRole("button", { name: "Sign out", exact: true }).click();
          await page.getByRole("heading", { name: "Welcome to Matterhorn Desks", exact: true }).waitFor();
        }
        release?.();
        await confirmationFinished;
        await page.waitForTimeout(250);
        const dispatched = promptRequests.filter(request => request.stage === "dispatch");
        expect(dispatched.length).toBe(boundary === "unchanged" && !rejected ? 1 : 0);
        if (boundary === "unchanged") {
          if (rejected) await page.getByText(/Synthetic consent confirmation failed/).waitFor();
          else expect(dispatched[0]?.body).toMatchObject({ privacyConsentToken: "synthetic-consent-token" });
        } else if (["edit", "edit back", "attach", "preparing", "model"].includes(boundary)) {
          expect((await editor.innerText()).trim()).toBe(boundary === "edit" ? "Keep my edited draft" : "Original private fixture draft");
          const error = page.locator('[data-matterhorn-session-error]');
          await error.getByText(/This request changed while approval was pending/).waitFor();
          expect(await error.getByRole("button", { name: "Share once and send", exact: true }).count()).toBe(0);
          if (boundary === "edit" && !rejected && process.env.CONSENT_LIFETIME_CAPTURES) {
            await mkdir(process.env.CONSENT_LIFETIME_CAPTURES, { recursive: true });
            await page.emulateMedia({ reducedMotion: "reduce" });
            for (const [theme, width] of [["light", 390], ["dark", 1440]] satisfies [string, number][]) {
              await page.evaluate(value => {
                document.documentElement.dataset.theme = value;
                document.documentElement.classList.toggle("dark", value === "dark");
              }, theme);
              await page.setViewportSize({ width, height: 1000 });
              await error.scrollIntoViewIfNeeded();
              await page.screenshot({ path: join(process.env.CONSENT_LIFETIME_CAPTURES, `consent-${theme}-${width}.png`), fullPage: true });
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            }
          }
          if (boundary === "preparing") await releaseImagePreparation(page);
          // Cancellation must not trap the composer or silently resend. A fresh
          // explicit action gets a new preflight before the fixture allows it.
          consentFixture = false;
          const accepted = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/messages"));
          await page.getByRole("button", { name: "Ask", exact: true }).click();
          await accepted;
          expect(promptRequests.filter(request => request.stage === "dispatch")).toHaveLength(1);
          expect(JSON.stringify(promptRequests.at(-1)?.body)).not.toContain("synthetic-consent-token");
        } else {
          expect(await page.locator('[data-matterhorn-session-error]').count()).toBe(0);
        }
      } finally { release?.(); await context.close(); }
    }, 30000);
  }
}
for (const operation of ["retry", "continue"]) {
  for (const boundary of ["unchanged", "edit", "navigate", "dismiss"]) {
    test(`delayed privacy confirmation for ${operation} after ${boundary}`, async () => {
      promptFixture = consentFixture = responseRetryFixture = true;
      terminalFailure = operation === "retry";
      incompleteResponse = operation === "continue";
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      context.setDefaultTimeout(8000);
      await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
      const page = await context.newPage();
      try {
        await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
        await page.getByRole("button", { name: "Change model", exact: true }).click();
        await page.getByRole("option", { name: /Fixture model/ }).click();
        const editor = page.getByRole("textbox").first();
        await editor.fill("Unrelated draft");
        if (operation === "retry") await page.locator('[data-matterhorn-session-error]').getByRole("button", { name: "Retry response", exact: true }).click();
        else await page.getByRole("button", { name: "Continue answer", exact: true }).click();
        await page.getByRole("button", { name: "Share once and send", exact: true }).click();
        for (let attempt = 0; attempt < 100 && !release; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
        expect(release).toBeDefined();
        if (boundary === "edit") await editor.fill("Edited unrelated draft");
        if (boundary === "navigate") {
          await page.getByRole("button", { name: "Other fixture chat", exact: true }).click();
          await page.waitForURL("**/ses_other");
        }
        if (boundary === "dismiss") await page.getByRole("button", { name: "Dismiss error", exact: true }).click();
        const before = requests.length;
        const response = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/fixture_challenge/confirm"));
        release?.();
        await response;
        const shouldDispatch = boundary === "unchanged" || boundary === "edit";
        if (shouldDispatch) {
          for (let attempt = 0; attempt < 100 && !promptRequests.some(request => request.stage === "dispatch"); attempt++) await page.waitForTimeout(20);
        } else await page.waitForTimeout(250);
        const dispatches = promptRequests.filter(request => request.stage === "dispatch");
        expect(dispatches).toHaveLength(shouldDispatch ? 1 : 0);
        if (shouldDispatch) {
          expect(JSON.stringify(dispatches)).not.toContain("Unrelated draft");
          expect(JSON.stringify(dispatches)).not.toContain("Edited unrelated draft");
          expect(dispatches[0]?.body).toMatchObject({ privacyConsentToken: "synthetic-consent-token",
            ...(operation === "continue" ? { requestToolProfiles: [{ "*": false }] } : {}) });
          expect((await editor.innerText()).trim()).toBe(boundary === "edit" ? "Edited unrelated draft" : "Unrelated draft");
        } else {
          expect(requests.slice(before).filter(request => request.method === "POST" && /\/(abort|revert|unrevert)$/.test(request.path))).toEqual([]);
        }
      } finally { release?.(); await context.close(); }
    }, 30000);
  }
}
for (const recovery of ["rate limit", "unavailable file", "continuation", "provider unavailable", "stopped"]) {
  test(`accepted failure preserves ${recovery} recovery boundaries`, async () => {
    promptFixture = true;
    responseRetryFixture = true;
    terminalFailure = true;
    terminalRateLimited = recovery === "rate limit";
    terminalProviderUnavailable = recovery === "provider unavailable";
    terminalStopped = recovery === "stopped";
    historyContinuation = recovery === "continuation";
    if (recovery === "unavailable file") historyFiles = [{ type: "file", id: "part_file", messageID: "msg_user", sessionID: "ses_fixture",
      filename: "missing.txt", mime: "text/plain", url: "file:///fixture/missing.txt" }];
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    context.setDefaultTimeout(8000);
    await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
    const page = await context.newPage();
    try {
      await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
      const error = page.locator('[data-matterhorn-session-error]');
      await error.waitFor();
      if (terminalProviderUnavailable) await error.getByRole("button", { name: "Choose another model", exact: true }).click();
      else await page.getByRole("button", { name: "Change model", exact: true }).first().click();
      if (terminalProviderUnavailable) await page.getByRole("dialog").getByRole("button", { name: /Fixture model/ }).click();
      else await page.getByRole("option", { name: /Fixture model/ }).click();
      const editor = page.getByRole("textbox").first();
      await editor.fill("New unrelated draft");
      if (terminalStopped) {
        expect(await error.getAttribute("role")).toBe("status");
        expect(promptRequests).toEqual([]);
      }
      if (terminalProviderUnavailable && process.env.TERMINAL_PROVIDER_CAPTURES) {
        await mkdir(process.env.TERMINAL_PROVIDER_CAPTURES, { recursive: true });
        await page.emulateMedia({ reducedMotion: "reduce" });
        for (const [theme, width] of [["light", 390], ["dark", 1440]] satisfies [string, number][]) {
          await page.evaluate(value => {
            document.documentElement.dataset.theme = value;
            document.documentElement.classList.toggle("dark", value === "dark");
          }, theme);
          await page.setViewportSize({ width, height: 1000 });
          await error.scrollIntoViewIfNeeded();
          await page.screenshot({ path: join(process.env.TERMINAL_PROVIDER_CAPTURES, `provider-${theme}-${width}.png`), fullPage: true });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        }
      }
      if (recovery === "rate limit") {
        expect(await error.innerText()).toContain("Wait before retrying, or choose another model.");
        expect(await error.innerText()).toContain("Retry repeats the original request");
      }
      const before = requests.length;
      if (recovery === "unavailable file") {
        await error.getByRole("button", { name: "Retry response", exact: true }).click();
        await error.getByText(/The original attachments cannot be restored/).waitFor();
        expect(await error.getByRole("button", { name: "Retry response", exact: true }).count()).toBe(0);
        expect(promptRequests).toEqual([]);
        expect(requests.slice(before).filter(request => request.method === "POST" && /\/(abort|revert|unrevert)$/.test(request.path))).toEqual([]);
      } else {
        await Promise.all([
          page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/messages")),
          error.getByRole("button", { name: "Retry response", exact: true }).click(),
        ]);
        expect(JSON.stringify(promptRequests)).not.toContain("New unrelated draft");
        if (recovery === "continuation") {
          expect(promptRequests.map(request => request.stage)).toEqual(["preflight", "dispatch"]);
          for (const request of promptRequests) expect(request.body).toMatchObject({ requestToolProfiles: [{ "*": false }] });
        }
      }
      expect((await editor.innerText()).trim()).toBe("New unrelated draft");
    } finally { await context.close(); }
  }, 30000);
}
for (const withText of [false, true]) {
  for (const newerDraft of [false, true]) {
    test(`accepted failure retry retains files with text=${withText} newerDraft=${newerDraft}`, async () => {
      promptFixture = true;
      responseRetryFixture = true;
      terminalFailure = true;
      historyText = withText;
      const originalUrl = "data:text/plain;base64,T3JpZ2luYWwgZmlsZSBieXRlcw==";
      historyFiles = [{ type: "file", id: "part_file", messageID: "msg_user", sessionID: "ses_fixture",
        filename: "original.txt", mime: "text/plain", url: originalUrl }];
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      context.setDefaultTimeout(8000);
      await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
      const page = await context.newPage();
      try {
        await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
        const error = page.locator('[data-matterhorn-session-error="error"]');
        await error.waitFor();
        await page.getByRole("button", { name: "Change model", exact: true }).click();
        await page.getByRole("option", { name: /Fixture model/ }).click();
        const editor = page.getByRole("textbox").first();
        if (newerDraft) {
          await editor.fill("Do not send my newer draft");
          await page.locator('input[type="file"]').setInputFiles({ name: "newer.txt", mimeType: "text/plain", buffer: Buffer.from("Newer file") });
          await page.getByText("newer.txt", { exact: true }).waitFor();
        }
        if (withText && newerDraft && process.env.TERMINAL_RETRY_CAPTURES) {
          await mkdir(process.env.TERMINAL_RETRY_CAPTURES, { recursive: true });
          await page.emulateMedia({ reducedMotion: "reduce" });
          for (const theme of ["light", "dark"]) for (const width of [390, 1440]) {
            await page.evaluate(value => {
              document.documentElement.dataset.theme = value;
              document.documentElement.classList.toggle("dark", value === "dark");
            }, theme);
            await page.setViewportSize({ width, height: 1000 });
            await error.scrollIntoViewIfNeeded();
            await page.screenshot({ path: join(process.env.TERMINAL_RETRY_CAPTURES, `terminal-${theme}-${width}.png`), fullPage: true });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          }
        }
        const response = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/messages"));
        await error.getByRole("button", { name: "Retry response", exact: true }).focus();
        await page.keyboard.press("Enter");
        await response;
        expect(promptRequests.map(request => request.stage)).toEqual(["preflight", "dispatch"]);
        const encoded = JSON.stringify(promptRequests);
        expect(encoded).not.toContain("newer.txt");
        expect(encoded).not.toContain("Do not send my newer draft");
        expect(promptRequests.at(-1)?.body).toMatchObject({ parts: expect.arrayContaining([
          expect.objectContaining({ type: "file", filename: "original.txt", url: originalUrl }),
          ...(withText ? [expect.objectContaining({ type: "text", text: "Synthetic question." })] : []),
        ]) });
        expect((await editor.innerText()).trim()).toBe(newerDraft ? "Do not send my newer draft" : "");
        if (newerDraft) expect(await page.getByText("newer.txt", { exact: true }).count()).toBe(1);
      } finally { await context.close(); }
    }, 30000);
  }
}
for (const newerRejection of [false, true]) {
  test(`accepted failure after dispatch and navigation with newer rejection=${newerRejection}`, async () => {
    promptFixture = true;
    responseRetryFixture = true;
    const originalUrl = "data:text/plain;base64,T3JpZ2luYWwgZmlsZSBieXRlcw==";
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    context.setDefaultTimeout(8000);
    await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
    const page = await context.newPage();
    try {
      await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
      await page.getByRole("button", { name: "Change model", exact: true }).click();
      await page.getByRole("option", { name: /Fixture model/ }).click();
      const editor = page.getByRole("textbox").first();
      await editor.fill("Synthetic question.");
      await page.locator('input[type="file"]').setInputFiles({ name: "original.txt", mimeType: "text/plain", buffer: Buffer.from("Original file bytes") });
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      await page.getByText("original.txt", { exact: true }).waitFor({ state: "hidden" });
      expect((await editor.innerText()).trim()).toBe("");
      expect(promptRequests.at(-1)?.body).toMatchObject({ parts: expect.arrayContaining([
        expect.objectContaining({ type: "file", filename: "original.txt", url: originalUrl }),
      ]) });
      promptRequests.length = 0;
      await editor.fill("New draft after acceptance");
      await page.locator('input[type="file"]').setInputFiles({ name: "newer.txt", mimeType: "text/plain", buffer: Buffer.from("Newer file") });
      await page.getByRole("button", { name: "Other fixture chat", exact: true }).click();
      await page.waitForURL("**/ses_other");
      // The fixture publishes a saved terminal failure only after acceptance;
      // returning reads it through the production session/snapshot path.
      terminalFailure = true;
      historyFiles = [{ type: "file", id: "part_file", messageID: "msg_user", sessionID: "ses_fixture",
        filename: "original.txt", mime: "text/plain", url: originalUrl }];
      await page.getByRole("button", { name: "Original fixture chat", exact: true }).click();
      await page.waitForURL("**/ses_fixture");
      const error = page.locator('[data-matterhorn-session-error="error"]');
      await error.waitFor();
      expect((await editor.innerText()).trim()).toBe("New draft after acceptance");
      expect(await page.getByText("newer.txt", { exact: true }).count()).toBe(1);
      if (newerRejection) {
        promptFailure = "preflight";
        await page.getByRole("button", { name: "Ask", exact: true }).click();
        await error.getByText("Remove a file and try again. Synthetic attachment rejection.", { exact: false }).waitFor();
        promptFailure = null;
        promptRequests.length = 0;
      }
      await Promise.all([
        page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/messages")),
        error.getByRole("button", { name: "Retry response", exact: true }).click(),
      ]);
      const encoded = JSON.stringify(promptRequests);
      expect(encoded).toContain(newerRejection ? "newer.txt" : "original.txt");
      expect(encoded).not.toContain(newerRejection ? "original.txt" : "newer.txt");
      expect((await editor.innerText()).trim()).toBe(newerRejection ? "" : "New draft after acceptance");
    } finally { await context.close(); }
  }, 30000);
}
for (const withText of [false, true]) {
  test(`historical response retry preserves original attachments with ${withText ? "text" : "files only"}`, async () => {
    promptFixture = true;
    responseRetryFixture = true;
    historyText = withText;
    const originalUrl = "data:text/plain;base64,T3JpZ2luYWwgZmlsZSBieXRlcw==";
    historyFiles = [{ type: "file", id: "part_file", messageID: "msg_user", sessionID: "ses_fixture",
      filename: "original.txt", mime: "text/plain", url: originalUrl }];
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    context.setDefaultTimeout(8000);
    await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
    const page = await context.newPage();
    try {
      await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
      await page.getByRole("button", { name: "Change model", exact: true }).click();
      await page.getByRole("option", { name: /Fixture model/ }).click();
      const editor = page.getByRole("textbox").first();
      await editor.fill("Keep my unrelated draft");
      await page.locator('input[type="file"]').setInputFiles({ name: "unrelated.txt", mimeType: "text/plain", buffer: Buffer.from("Unrelated draft bytes") });
      await Promise.all([
        page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/messages")).catch(async error => {
          throw new Error(`${error}\nFixture requests: ${JSON.stringify(requests.filter(request => request.method === "POST"))}\nError: ${await page.locator('[data-matterhorn-session-error]').allTextContents()}`);
        }),
        page.getByRole("button", { name: "Retry response", exact: true }).click(),
      ]);
      expect(promptRequests.at(-1)?.body).toMatchObject({ parts: expect.arrayContaining([
        expect.objectContaining({ type: "file", filename: "original.txt", mime: "text/plain", url: originalUrl }),
      ]) });
      expect(JSON.stringify(promptRequests)).not.toContain("unrelated.txt");
      expect(await editor.innerText()).toBe("Keep my unrelated draft");
      expect(await page.getByText("unrelated.txt", { exact: true }).count()).toBe(1);
      expect(promptRequests.map(request => request.stage)).toEqual(["preflight", "dispatch"]);
    } finally { await context.close(); }
  }, 30000);
}
for (const failure of ["unavailable", "malformed", "preflight", "dispatch"]) {
  test(`historical response retry safely recovers from ${failure}`, async () => {
    promptFixture = true;
    responseRetryFixture = true;
    promptFailure = failure === "preflight" || failure === "dispatch" ? failure : null;
    historyFiles = [{ type: "file", id: "part_file", messageID: "msg_user", sessionID: "ses_fixture",
      filename: "original.txt", mime: "text/plain", url: failure === "unavailable" ? "file:///fixture/missing.txt"
        : failure === "malformed" ? "data:text/plain;base64,YQ=" : "data:text/plain;base64,QQ==" }];
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    context.setDefaultTimeout(8000);
    await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
    const page = await context.newPage();
    try {
      await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
      await page.getByRole("button", { name: "Change model", exact: true }).click();
      await page.getByRole("option", { name: /Fixture model/ }).click();
      const editor = page.getByRole("textbox").first();
      await editor.fill("Unrelated draft stays here");
      await page.locator('input[type="file"]').setInputFiles({ name: "unrelated.txt", mimeType: "text/plain", buffer: Buffer.from("Unrelated bytes") });
      await page.getByRole("button", { name: "Retry response", exact: true }).focus();
      await page.keyboard.press("Enter");
      const errorCard = page.locator('[data-matterhorn-session-error="error"]');
      await errorCard.waitFor();
      expect(await errorCard.getAttribute("role")).toBe("alert");
      expect(await editor.innerText()).toBe("Unrelated draft stays here");
      expect(await page.getByText("unrelated.txt", { exact: true }).count()).toBe(1);
      const mutations = requests.filter(request => request.method === "POST" && /\/(abort|revert|unrevert|messages|preflight)$/.test(request.path));
      if (failure === "unavailable" || failure === "malformed") {
        expect(await errorCard.innerText()).toContain("Attach the files again");
        expect(await errorCard.getByRole("button", { name: "Retry response", exact: true }).count()).toBe(0);
        expect(mutations).toEqual([]);
      } else {
        expect(await errorCard.innerText()).toContain("Synthetic attachment rejection");
        expect(mutations.map(request => request.path.split("/").at(-1))).toEqual(failure === "preflight"
          ? ["abort", "revert", "preflight", "unrevert"] : ["abort", "revert", "preflight", "messages", "unrevert"]);
        expect(promptRequests[0].body).toMatchObject({ parts: expect.arrayContaining([
          expect.objectContaining({ filename: "original.txt", url: "data:text/plain;base64,QQ==" }),
        ]) });
      }
      if (failure === "unavailable" && process.env.HISTORICAL_ATTACHMENT_CAPTURES) {
        await mkdir(process.env.HISTORICAL_ATTACHMENT_CAPTURES, { recursive: true });
        for (const theme of ["light", "dark"]) for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.evaluate(theme => { document.documentElement.classList.toggle("dark", theme === "dark"); document.documentElement.dataset.theme = theme; }, theme);
          await errorCard.scrollIntoViewIfNeeded();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({ path: join(process.env.HISTORICAL_ATTACHMENT_CAPTURES, `historical-${theme}-${width}.png`), fullPage: true });
        }
      }
    } finally { await context.close(); }
  }, 30000);
}
for (const rejection of ["wire size", "private contents"]) {
  for (const withText of [false, true]) {
  test(`real gateway attachment ${rejection} rejection and recovery with ${withText ? "text" : "files only"}`, async () => {
    const stop = await startAttachmentBackend();
    const runtimeOrigin = realGateway?.runtimeOrigin;
    if (!runtimeOrigin) throw new Error("Missing isolated runtime");
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    context.setDefaultTimeout(10000);
    await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const dispatches = async (): Promise<unknown> => (await fetch(`${runtimeOrigin}/__qa/dispatches`)).json();
    try {
      await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
      await page.getByRole("button", { name: "Change model", exact: true }).click();
      await page.getByRole("option", { name: /Fixture model/ }).click();
      const editor = page.getByRole("textbox").first();
      if (withText) await editor.fill("Summarize these notes");
      const retainedBytes = Buffer.alloc(rejection === "wire size" ? 4_000_000 : 24, 97);
      await page.locator('input[type="file"]').setInputFiles([
        { name: "keep.txt", mimeType: "text/plain", buffer: retainedBytes },
        { name: "remove.txt", mimeType: "text/plain", buffer: rejection === "wire size"
          ? Buffer.alloc(4_000_000, 98) : Buffer.from("PRIVATE_KEY=disposable-browser-fixture-secret") },
      ]);
      await page.getByText("remove.txt", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      const errorCard = page.locator('[data-matterhorn-session-error="error"]');
      await errorCard.waitFor();
      expect((await editor.innerText()).trim()).toBe(withText ? "Summarize these notes" : "");
      expect(await page.getByText("keep.txt", { exact: true }).count()).toBe(1);
      expect(await page.getByText("remove.txt", { exact: true }).count()).toBe(1);
      expect(gatewayResults).toHaveLength(1);
      expect(gatewayResults[0]).toMatchObject(rejection === "wire size"
        ? { status: 413, payload: { code: "payload_too_large" } }
        : { status: 200, payload: { decision: "blocked" } });
      expect(await dispatches()).toEqual([]);
      expect(JSON.stringify(gatewayResults)).not.toContain("disposable-browser-fixture-secret");
      const removals = page.getByRole("button", { name: "Remove", exact: true });
      expect(await removals.count()).toBe(2);
      await removals.nth(1).click();
      if (rejection === "wire size") {
        await errorCard.getByRole("button", { name: "Retry response", exact: true }).click();
      } else {
        // Privacy blocks intentionally offer review, not a bypass/retry button.
        // Explicitly send the edited draft, not the old transcript's Retry action.
        expect(await errorCard.getByRole("button", { name: "Retry response", exact: true }).count()).toBe(0);
        await page.getByRole("button", { name: "Ask", exact: true }).click();
      }
      await page.getByText("keep.txt", { exact: true }).waitFor({ state: "hidden" }).catch(error => {
        throw new Error(`${error}\nIsolated gateway results: ${JSON.stringify(gatewayResults)}`);
      });
      expect((await editor.innerText()).trim()).toBe("");
      expect(gatewayResults.map(result => result.status)).toEqual(rejection === "wire size" ? [413, 200, 202] : [200, 200, 202]);
      const dispatched = await dispatches();
      expect(dispatched).toEqual([expect.objectContaining({ parts: expect.arrayContaining([
        expect.objectContaining({ type: "file", filename: "keep.txt" }),
      ]) })]);
      const serialized = JSON.stringify(dispatched);
      // Boolean assertion avoids dumping a multi-megabyte payload on failure.
      expect(serialized.includes(`"url":"data:text/plain;base64,${retainedBytes.toString("base64")}"`)).toBe(true);
      expect(serialized).not.toContain('"filename":"remove.txt"');
    } finally { await context.close(); await stop(); }
  }, 60000);
  }
}
for (const failure of ["preflight", "dispatch"] satisfies Array<"preflight" | "dispatch">) {
  for (const withText of [false, true]) {
    test(`mounted attachment ${failure} rejection preserves ${withText ? "text and files" : "files only"} for retry`, async () => {
      promptFixture = true;
      promptFailure = failure;
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      context.setDefaultTimeout(8000);
      await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
      const page = await context.newPage();
      try {
        await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
        await page.getByRole("button", { name: "Change model", exact: true }).click();
        await page.getByRole("option", { name: /Fixture model/ }).click();
        const input = page.locator('input[type="file"]');
        await input.setInputFiles({ name: "retry.txt", mimeType: "text/plain", buffer: Buffer.from("Disposable attachment") });
        const editor = page.getByRole("textbox").first();
        if (withText) await editor.fill("Summarize my attachment");
        await page.getByRole("button", { name: "Ask", exact: true }).click();
        await page.getByText(/Synthetic attachment rejection/).first().waitFor();
        expect((await editor.innerText()).trim()).toBe(withText ? "Summarize my attachment" : "");
        expect(await page.getByText("retry.txt", { exact: true }).count()).toBe(1);
        expect(promptRequests.map(request => request.stage)).toEqual(failure === "preflight" ? ["preflight"] : ["preflight", "dispatch"]);
        const failedRequest = promptRequests.at(-1)?.body;
        expect(failedRequest).toMatchObject({ parts: expect.arrayContaining([
          expect.objectContaining({ type: "file", filename: "retry.txt", url: "data:text/plain;base64,RGlzcG9zYWJsZSBhdHRhY2htZW50" }),
        ]) });
        promptFailure = null;
        await page.getByRole("button", { name: "Retry response", exact: true }).last().click();
        await page.getByText("retry.txt", { exact: true }).waitFor({ state: "hidden" });
        expect((await editor.innerText()).trim()).toBe("");
        expect(promptRequests.at(-1)?.body).toMatchObject({ parts: expect.arrayContaining([
          expect.objectContaining({ type: "file", filename: "retry.txt", url: "data:text/plain;base64,RGlzcG9zYWJsZSBhdHRhY2htZW50" }),
        ]) });
        expect(promptRequests.filter(request => request.stage === "dispatch").length).toBe(failure === "preflight" ? 1 : 2);
      } finally { await context.close(); }
    }, 30000);
  }
}

test("mounted preparation blocks the control action as well as the composer", async () => {
  promptFixture = true;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(8000);
  await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on("dialog", dialog => void dialog.accept());
  try {
    await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
    await page.getByRole("button", { name: "Change model", exact: true }).click();
    await page.getByRole("option", { name: /Fixture model/ }).click();
    await page.getByRole("textbox").first().fill("Summarize pending image");
    await page.evaluate(() => window.__openworkControl?.setEnabled(true));
    await delayImagePreparation(page);
    await page.locator('input[type="file"]').setInputFiles(await delayedImage(page));
    await page.waitForFunction(() => document.documentElement.dataset.imagePreparing === "true");
    const blocked = await page.evaluate(() => window.__openworkControl?.execute("composer.send"));
    expect(blocked?.ok).toBe(false);
    expect(promptRequests).toEqual([]);
    await releaseImagePreparation(page);
    expect(promptRequests).toEqual([]);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await page.getByText("pending.jpg", { exact: true }).waitFor({ state: "hidden" });
    expect(promptRequests.at(-1)?.body).toMatchObject({ parts: expect.arrayContaining([
      expect.objectContaining({ type: "file", filename: "pending.jpg" }),
    ]) });
  } finally { await context.close(); }
}, 30000);
for (const boundary of ["unchanged", "edit", "edit back", "clear", "append", "remove", "preparing", "navigate", "return", "off", "cross-tab logout"]) {
  test(`delayed control send after ${boundary}`, async () => {
    promptFixture = true;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    context.setDefaultTimeout(8000);
    await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
    const page = await context.newPage();
    try {
      await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
      await page.getByRole("button", { name: "Change model", exact: true }).click();
      await page.getByRole("option", { name: /Fixture model/ }).click();
      const editor = page.getByRole("textbox").first();
      await editor.fill("Original control draft");
      const input = page.locator('input[type="file"]');
      if (boundary === "remove") {
        await input.setInputFiles({ name: "removed.txt", mimeType: "text/plain", buffer: Buffer.from("Removed file") });
        await page.getByText("removed.txt", { exact: true }).waitFor();
      }
      await page.evaluate(() => {
        const original = window.setTimeout;
        window.setTimeout = (callback, delay, ...args) => {
          if (delay === 180 && typeof callback === "function") {
            window.setTimeout = original;
            window.addEventListener("qa-release-control", () => callback(...args), { once: true });
            document.documentElement.dataset.controlWaiting = "true";
            return original(() => {}, 0);
          }
          return original(callback, delay, ...args);
        };
        void window.__openworkControl?.execute("composer.send").then(result => {
          document.documentElement.dataset.controlResult = JSON.stringify(result);
        });
      });
      await page.waitForFunction(() => document.documentElement.dataset.controlWaiting === "true");
      const duplicate = await page.evaluate(() => window.__openworkControl?.execute("composer.send"));
      expect(duplicate?.ok).toBe(false);
      expect(promptRequests).toEqual([]);
      if (boundary === "edit" || boundary === "edit back" || boundary === "clear") {
        await editor.fill(boundary === "clear" ? "" : "Replacement draft");
        if (boundary === "edit back") {
          await page.waitForFunction(() => document.querySelector('[role="textbox"]')?.textContent === "Replacement draft");
          await editor.fill("Original control draft");
        }
      }
      if (boundary === "append") {
        await input.setInputFiles({ name: "new.txt", mimeType: "text/plain", buffer: Buffer.from("New file") });
        await page.getByText("new.txt", { exact: true }).waitFor();
      }
      if (boundary === "remove") await page.getByRole("button", { name: "Remove", exact: true }).click();
      if (boundary === "preparing") {
        await delayImagePreparation(page);
        await input.setInputFiles(await delayedImage(page));
        await page.waitForFunction(() => document.documentElement.dataset.imagePreparing === "true");
      }
      if (boundary === "navigate" || boundary === "return") {
        await page.getByRole("button", { name: "Other fixture chat", exact: true }).click();
        await page.waitForURL("**/ses_other");
        if (boundary === "return") {
          await page.getByRole("button", { name: "Original fixture chat", exact: true }).click();
          await page.waitForURL("**/ses_fixture");
        }
      }
      if (boundary === "off") await page.evaluate(() => window.__openworkControl?.setEnabled(false));
      if (boundary === "cross-tab logout") {
        const other = await context.newPage();
        await other.goto(`${server.url}settings/cloud-account`);
        await other.getByRole("button", { name: "Sign out", exact: true }).click();
        await page.getByRole("heading", { name: "Welcome to Matterhorn Desks", exact: true }).waitFor();
      }
      await page.evaluate(() => window.dispatchEvent(new Event("qa-release-control")));
      await page.waitForFunction(() => Boolean(document.documentElement.dataset.controlResult));
      const result = await page.evaluate(() => JSON.parse(document.documentElement.dataset.controlResult || "null"));
      if (boundary === "unchanged") {
        expect(promptRequests.map(request => request.stage)).toEqual(["preflight", "dispatch"]);
        expect((await editor.innerText()).trim()).toBe("");
      } else {
        expect(promptRequests).toEqual([]);
        if (boundary === "edit") expect((await editor.innerText()).trim()).toBe("Replacement draft");
      }
      expect(result?.ok).toBe(boundary === "unchanged");
      if (boundary === "preparing") {
        await releaseImagePreparation(page);
        await page.getByText("pending.jpg", { exact: true }).waitFor();
        expect(promptRequests).toEqual([]);
      }
      if (boundary === "edit" || boundary === "off" || boundary === "preparing") {
        const fresh = await page.evaluate(() => window.__openworkControl?.execute("composer.send"));
        expect(fresh?.ok).toBe(true);
        expect(promptRequests.map(request => request.stage)).toEqual(["preflight", "dispatch"]);
        expect(promptRequests.at(-1)?.body).toMatchObject({ parts: expect.arrayContaining([
          expect.objectContaining({ type: "text", text: boundary === "edit" ? "Replacement draft" : "Original control draft" }),
          ...(boundary === "preparing" ? [expect.objectContaining({ type: "file", filename: "pending.jpg", mime: "image/jpeg" })] : []),
        ]) });
      }
    } finally { await context.close(); }
  }, 30000);
}

for (const boundary of ["append", "remove", "navigate", "return", "cross-tab logout"]) {
  test(`mounted attachment preparation after ${boundary}`, async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    context.setDefaultTimeout(8000);
    await context.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(`${server.url}workspace/ws_fixture/session/ses_fixture`);
      const input = page.locator('input[type="file"]');
      await input.setInputFiles({ name: "earlier.txt", mimeType: "text/plain", buffer: Buffer.from("Earlier") });
      await page.getByText("earlier.txt", { exact: true }).waitFor();
      await delayImagePreparation(page);
      await input.setInputFiles(await delayedImage(page));
      await page.waitForFunction(() => document.documentElement.dataset.imagePreparing === "true");
      if (boundary === "append") {
        await input.setInputFiles({ name: "newer.txt", mimeType: "text/plain", buffer: Buffer.from("Newer") });
        await page.getByText("newer.txt", { exact: true }).waitFor();
      }
      if (boundary === "remove") await page.getByRole("button", { name: "Remove", exact: true }).click();
      if (boundary === "navigate" || boundary === "return") {
        await page.getByRole("button", { name: "Other fixture chat", exact: true }).click();
        await page.waitForURL("**/ses_other");
        if (boundary === "return") {
          await page.getByRole("button", { name: "Original fixture chat", exact: true }).click();
          await page.waitForURL("**/ses_fixture");
        }
      }
      if (boundary === "cross-tab logout") {
        const other = await context.newPage();
        await other.goto(`${server.url}settings/cloud-account`);
        await other.getByRole("button", { name: "Sign out", exact: true }).click();
        await page.getByRole("heading", { name: "Welcome to Matterhorn Desks", exact: true }).waitFor();
      }
      await releaseImagePreparation(page);
      if (boundary === "append" || boundary === "remove") {
        await page.getByText("pending.jpg", { exact: true }).waitFor();
        expect(await page.getByText("earlier.txt", { exact: true }).count()).toBe(boundary === "append" ? 1 : 0);
        if (boundary === "append") expect(await page.getByText("newer.txt", { exact: true }).count()).toBe(1);
      } else {
        expect(await page.getByText("pending.jpg", { exact: true }).count()).toBe(0);
        if (boundary === "navigate") {
          await page.getByRole("button", { name: "Original fixture chat", exact: true }).click();
          await page.waitForURL("**/ses_fixture");
        }
        if (boundary !== "cross-tab logout") {
          await page.getByText("earlier.txt", { exact: true }).waitFor();
          expect(await page.getByText("pending.jpg", { exact: true }).count()).toBe(0);
        }
      }
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, 30000);
}
const boundaries = [
  "unchanged",
  "navigate",
  "return",
  "logout",
  "cross-tab logout",
];
for (const operation of operations) {
  for (const boundary of boundaries) {
    for (const outcome of ["success", "failure"]) {
      test(`mounted ${operation} ${outcome} after ${boundary}`, async () => {
        action = operation;
        rejectAction = outcome === "failure";
        const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        });
        context.setDefaultTimeout(8000);
        const page = await context.newPage();
        const errors: string[] = [];
        const forkWarnings: string[] = [];
        page.on("console", (message) => {
          if (message.text().startsWith("[fork] failed"))
            forkWarnings.push(message.text());
        });
        context.on("page", (next) =>
          next.on("pageerror", (error) => errors.push(error.message)),
        );
        page.on("pageerror", (error) => errors.push(error.message));
        await context.route("**/*", (route) =>
          new URL(route.request().url()).origin === server.url.origin
            ? route.continue()
            : route.abort(),
        );
        page.setDefaultTimeout(10000);
        try {
          await page.goto(
            `${server.url}workspace/ws_fixture/session/ses_fixture`,
          );
          await page
            .getByRole("button", {
              name:
                operation === "fork"
                  ? "Fork conversation from this response"
                  : "Revert to this response",
              exact: true,
            })
            .click();
          for (let attempt = 0; attempt < 100 && !release; attempt++)
            await new Promise((done) => setTimeout(done, 20));
          expect(release).toBeDefined();
          if (boundary === "navigate" || boundary === "return") {
            await page
              .getByRole("button", { name: "Other fixture chat", exact: true })
              .click();
            await page.waitForURL("**/ses_other");
            if (boundary === "return") {
              await page
                .getByRole("button", {
                  name: "Original fixture chat",
                  exact: true,
                })
                .click();
              await page.waitForURL("**/ses_fixture");
              await page
                .getByText(
                  "Synthetic completed answer. No provider was called.",
                  { exact: true },
                )
                .waitFor();
            }
          }
          if (boundary === "logout" || boundary === "cross-tab logout") {
            const logoutPage =
              boundary === "logout" ? page : await context.newPage();
            if (logoutPage !== page)
              await logoutPage.goto(`${server.url}settings/cloud-account`);
            else {
              await page
                .getByRole("button", { name: "Settings", exact: true })
                .click();
              await page
                .getByRole("button", { name: "Account", exact: true })
                .click();
            }
            await logoutPage
              .getByRole("button", { name: "Sign out", exact: true })
              .click();
            await page
              .getByRole("heading", {
                name: "Welcome to Matterhorn Desks",
                exact: true,
              })
              .waitFor();
            expect(
              requests.some((request) => request.path === "/api/auth/sign-out"),
            ).toBe(true);
          }
          // Navigation schedules independent snapshot/binding reads. Let those settle
          // before observing requests attributable to the delayed action.
          await page.waitForTimeout(200);
          const beforeRelease = requests.length;
          const completed = page.waitForResponse((response) =>
            new URL(response.url()).pathname.endsWith(`/${operation}`),
          );
          release?.();
          await completed;
          if (boundary === "unchanged") {
            if (outcome === "success") {
              if (operation === "fork") await page.waitForURL("**/ses_fork");
              else
                await page
                  .getByText("Conversation reverted", { exact: true })
                  .waitFor();
              expect(
                requests
                  .slice(beforeRelease)
                  .some((request) =>
                    request.path.endsWith(
                      operation === "fork" ? "/coworker" : "/snapshot",
                    ),
                  ),
              ).toBe(true);
            } else {
              if (operation === "revert")
                await page
                  .getByText("Could not revert conversation", { exact: true })
                  .waitFor();
              else {
                await page
                  .getByText("Could not fork conversation", { exact: true })
                  .waitFor();
              }
              expect(page.url()).toContain("ses_fixture");
            }
          } else {
            // Observe after HTTP delivery and React's scheduled effects have settled.
            await page.waitForTimeout(300);
            expect(page.url()).not.toContain("ses_fork");
            if (boundary === "navigate")
              expect(page.url()).toContain("ses_other");
            if (boundary === "return")
              expect(page.url()).toContain("ses_fixture");
            expect(
              await page
                .getByText("Conversation reverted", { exact: true })
                .count(),
            ).toBe(0);
            expect(
              await page
                .getByText("Could not revert conversation", { exact: true })
                .count(),
            ).toBe(0);
            expect(
              await page
                .getByText("Could not fork conversation", { exact: true })
                .count(),
            ).toBe(0);
            expect(forkWarnings).toEqual([]);
            expect(
              requests
                .slice(beforeRelease)
                .filter((request) =>
                  request.path.endsWith(
                    operation === "fork" ? "/coworker" : "/snapshot",
                  ),
                ),
            ).toEqual([]);
          }
          expect(errors).toEqual([]);
        } catch (error) {
          console.error(
            JSON.stringify({
              errors,
              requests,
              text: await page.locator("body").innerText(),
            }),
          );
          throw error;
        } finally {
          release?.();
          await context.close();
        }
      }, 30000);
    }
  }
}

const themes: Array<"light" | "dark"> = ["light", "dark"];
for (const colorScheme of themes) {
  for (const width of [390, 768, 1440]) {
    test(`fork failure feedback ${colorScheme} ${width}px`, async () => {
      action = "fork";
      rejectAction = true;
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        colorScheme,
        reducedMotion: "reduce",
      });
      context.setDefaultTimeout(8000);
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === server.url.origin
          ? route.continue()
          : route.abort(),
      );
      const page = await context.newPage();
      try {
        await page.goto(
          `${server.url}workspace/ws_fixture/session/ses_fixture`,
        );
        const editor = page.locator('[contenteditable="true"]').first();
        await editor.fill("Keep this unsent fixture draft.");
        const fork = page.getByRole("button", {
          name: "Fork conversation from this response",
          exact: true,
        });
        await fork.focus();
        await page.keyboard.press("Enter");
        for (let attempt = 0; attempt < 100 && !release; attempt++)
          await new Promise((done) => setTimeout(done, 20));
        expect(release).toBeDefined();
        release?.();
        const alert = page
          .getByRole("alert")
          .filter({ hasText: "Could not fork conversation" });
        await alert.waitFor();
        expect(await page.locator("html").getAttribute("data-theme")).toBe(
          colorScheme,
        );
        expect(await alert.getAttribute("aria-live")).toBe("assertive");
        expect(await alert.innerText()).toContain(
          "a fork may already have been created",
        );
        expect(await editor.innerText()).toBe(
          "Keep this unsent fixture draft.",
        );
        expect(page.url()).toContain("ses_fixture");
        expect(
          requests.filter((request) => request.path.endsWith("/fork")),
        ).toHaveLength(1);
        const rect = await alert.boundingBox();
        expect(rect).not.toBeNull();
        if (!rect) throw new Error("Missing visible alert");
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(width);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (process.env.MOUNTED_QA_CAPTURE_DIR) {
          await mkdir(process.env.MOUNTED_QA_CAPTURE_DIR, { recursive: true });
          await page.screenshot({
            path: join(
              process.env.MOUNTED_QA_CAPTURE_DIR,
              `fork-failure-${colorScheme}-${width}.png`,
            ),
            fullPage: true,
          });
        }
        await alert
          .getByRole("button", { name: "Dismiss", exact: true })
          .click();
        expect(await alert.count()).toBe(0);
      } finally {
        release?.();
        await context.close();
      }
    }, 30000);
  }
}

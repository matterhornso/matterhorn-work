import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { delayImagePreparation, delayedImage, releaseImagePreparation } from "./fixtures/attachment-preparation";

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
let responseRetryFixture = false;
let historyText = true;
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
  { ...messages[0], parts: [...(historyText ? messages[0].parts : []), ...historyFiles] }, messages[1],
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
        if (promptFailure === stage) return Response.json({
          code: "attachments_too_large", message: "Remove a file and try again. Synthetic attachment rejection.",
        }, { status: 413 });
        if (stage === "preflight") return Response.json({ decision: "allow", reason: "Synthetic fixture only" });
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
  responseRetryFixture = false;
  historyText = true;
  historyFiles = [];
  promptRequests.length = 0;
  gatewayResults.length = 0;
  requests.length = 0;
});

const operations: Array<"fork" | "revert"> = ["fork", "revert"];
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

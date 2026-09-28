import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { mkdir } from "node:fs/promises";
import type { StmSettings } from "../src/app/lib/matterhorn-server";

let browser: Browser;
let server: ReturnType<typeof Bun.serve>;
let data: StmSettings;
let saved = 0, removed = 0, linked = 0, rawReads = 0;
let failWrite = false;
let savedRevision: string | null = null;
const fixtureKey = { tool: "fixture", label: "default", status: "active", revision: "a".repeat(64) };
const reset = () => {
  data = { status: { state: "connected", backend: "In-memory fixture — not Keychain" }, bindings: [], migrations: [], inventory: [fixtureKey], consumers: ["voice:realtime"], legacy: [{ key: "OPENAI_REALTIME_API_KEY", updatedAt: 1, migrationEligible: true }] };
  saved = removed = linked = rawReads = 0; failWrite = false; savedRevision = null;
};
beforeAll(async () => {
  const bundle = await build({ configFile: false, root: new URL("../", import.meta.url).pathname, logLevel: "error",
    resolve: { alias: { "@": new URL("../src", import.meta.url).pathname }, dedupe: ["react", "react-dom"] },
    define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"development"' }, plugins: [tailwindcss()],
    build: { target: "esnext", write: false, minify: false, lib: { entry: new URL("./fixtures/stm-settings.tsx", import.meta.url).pathname, formats: ["es"] }, rollupOptions: { output: { inlineDynamicImports: true } } },
  });
  const built = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!("output" in built)) throw new Error("Missing fixture build");
  const script = built.output.find(item => item.type === "chunk" && item.isEntry);
  const css = built.output.filter(item => item.type === "asset" && item.fileName.endsWith(".css"));
  if (!script || script.type !== "chunk") throw new Error("Missing script");
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/fixture.js") return new Response(script.code, { headers: { "content-type": "text/javascript" } });
    if (path === "/fixture.css") return new Response(css.map(item => item.type === "asset" ? item.source : "").join("\n"), { headers: { "content-type": "text/css" } });
    if (path === "/env") { rawReads++; return Response.json({ items: [] }); }
    if (path === "/env/stm/settings") return Response.json(data);
    if (path === "/env/stm/connect") { data.status.state = "connected"; return Response.json(data.status); }
    if (path === "/env/stm/credential") {
      savedRevision = (await request.json()).expectedRevision;
      if (failWrite) return Response.json({ code: "credential_update_uncertain", message: "Ignored reflected data" }, { status: 409 });
      saved++; return Response.json({ oldValueCleanupPending: false, restartRequired: false });
    }
    if (path === "/env/stm/bindings") { linked++; return Response.json({ ok: true }); }
    if (path === "/env/stm/migrations") {
      const body = await request.json();
      const binding = { id: "b", envName: "OPENAI_REALTIME_API_KEY", consumer: "voice:realtime", tool: "fixture", label: "default", storageBackend: data.status.backend!, credentialRevision: fixtureKey.revision, restartRequired: false };
      data.bindings = [binding]; data.migrations = [{ id: body.id, state: "published", backend: data.status.backend!, entries: [{ binding, sourceUpdatedAt: 1 }] }];
      return Response.json(data.migrations[0]);
    }
    if (path.endsWith("/finish")) { removed++; data.migrations[0].state = "complete"; data.legacy = []; return Response.json(data.migrations[0]); }
    return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>STM settings fixture</title><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{height:auto;overflow:visible}</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>', { headers: { "content-type": "text/html" } });
  } });
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => { await browser?.close(); server?.stop(true); });

async function page() {
  reset();
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
  return page;
}
test("metadata settings clear transient inputs on save, cancel, error and refresh", async () => {
  const p = await page();
  try {
    await p.goto(String(server.url));
    await p.getByRole("button", { name: "Add secret", exact: true }).click();
    await p.getByLabel("Tool identifier").fill("fixture"); await p.getByLabel("Secret label", { exact: true }).fill("new");
    await p.getByLabel("New API secret").fill("disposable-input-sentinel");
    expect(await p.getByRole("button", { name: "Save secret", exact: true }).isDisabled()).toBe(true);
    await p.getByRole("checkbox", { name: /Save this selected API secret/ }).check();
    await p.getByRole("button", { name: "Save secret", exact: true }).click();
    await p.getByText("Secret saved.", { exact: false }).waitFor();
    expect(saved).toBe(1); expect(await p.getByLabel("New API secret").count()).toBe(0);
    await p.getByRole("button", { name: "Add secret", exact: true }).click();
    await p.getByLabel("New API secret").fill("disposable-input-sentinel");
    await p.getByRole("button", { name: "Cancel", exact: true }).click();
    await p.getByRole("button", { name: "Add secret", exact: true }).click();
    expect(await p.getByLabel("New API secret").inputValue()).toBe("");
    await p.getByLabel("Tool identifier").fill("fixture"); await p.getByLabel("Secret label", { exact: true }).fill("new");
    await p.getByLabel("New API secret").fill("disposable-input-sentinel");
    await p.getByRole("checkbox", { name: /Save this selected API secret/ }).check(); failWrite = true;
    await p.getByRole("button", { name: "Save secret", exact: true }).click();
    await p.getByText("The save may have completed.", { exact: false }).waitFor();
    expect(await p.getByLabel("New API secret").inputValue()).toBe("");
    expect(await p.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })) ).not.toContain("disposable-input-sentinel");
    expect(await p.content()).not.toContain("disposable-input-sentinel"); expect(rawReads).toBe(0);
  } finally { await p.close(); }
});

test("migration requires selection and separate plaintext removal confirmation", async () => {
  const p = await page();
  try {
    await p.goto(String(server.url));
    expect(await p.getByRole("button", { name: "Move selected secrets", exact: true }).isDisabled()).toBe(true);
    await p.getByRole("checkbox", { name: "OPENAI_REALTIME_API_KEY", exact: true }).check();
    await p.getByRole("checkbox", { name: /Copy selected keys/ }).check();
    await p.getByRole("button", { name: "Move selected secrets", exact: true }).click();
    await p.getByRole("button", { name: "Review plaintext removal" }).waitFor();
    expect(removed).toBe(0);
    await p.getByRole("button", { name: "Review plaintext removal" }).click();
    await p.getByText(/Secure deletion on SSDs/).waitFor();
    await p.getByRole("button", { name: "Cancel removal" }).click(); expect(removed).toBe(0);
    await p.getByRole("button", { name: "Review plaintext removal" }).click();
    await p.getByRole("button", { name: "Confirm removal", exact: true }).click();
    await p.getByText("Plaintext entries removed.", { exact: false }).waitFor(); expect(removed).toBe(1); expect(rawReads).toBe(0);
  } finally { await p.close(); }
});

test("connection consent, default-off legacy gate and offline status remain truthful", async () => {
  const p = await page();
  try {
    data.status = { state: "not_connected" };
    await p.goto(String(server.url));
    expect(await p.getByRole("button", { name: "Connect", exact: true }).isDisabled()).toBe(true);
    await p.getByRole("checkbox", { name: /Allow this local/ }).check(); await p.getByRole("button", { name: "Connect", exact: true }).click();
    await p.getByRole("button", { name: "Add secret", exact: true }).waitFor();
    data.status = { state: "unavailable", code: "connection_failed" }; await p.getByRole("button", { name: "Refresh settings" }).click();
    await p.getByRole("button", { name: "Reconnect", exact: true }).waitFor();
    expect(await p.getByRole("button", { name: "Add secret", exact: true }).count()).toBe(0);
    data.status = { state: "unavailable", code: "disabled" }; await p.getByRole("button", { name: "Refresh settings" }).click();
    await p.getByText("Legacy environment fixture").waitFor(); expect(rawReads).toBe(0);
  } finally { await p.close(); }
});

test("changing any exact link target or migration selection invalidates consent", async () => {
  const p = await page();
  try {
    data.inventory.push({ ...fixtureKey, label: "other" });
    await p.goto(String(server.url));
    await p.getByRole("button", { name: "Link existing secret" }).click();
    const consent = p.getByRole("checkbox", { name: /Allow only this selected consumer/ });
    await consent.check(); await p.getByLabel("Secret", { exact: true }).selectOption("fixture/other");
    expect(await consent.isChecked()).toBe(false);
    await consent.check(); await p.getByLabel("Voice key").selectOption("OPENAI_API_KEY"); expect(await consent.isChecked()).toBe(false);
    await p.getByLabel("Allow access for").selectOption("mcp");
    await consent.check(); await p.getByLabel("Configured local tool name", { exact: true }).fill("fixture"); expect(await consent.isChecked()).toBe(false);
    await consent.check(); await p.getByLabel("Exact environment variable name").fill("EXAMPLE_API_KEY"); expect(await consent.isChecked()).toBe(false);
    await p.getByRole("checkbox", { name: "OPENAI_REALTIME_API_KEY", exact: true }).check();
    const migration = p.getByRole("checkbox", { name: /Copy selected keys/ }); await migration.check();
    await p.getByRole("checkbox", { name: "OPENAI_REALTIME_API_KEY", exact: true }).uncheck(); expect(await migration.isChecked()).toBe(false);
  } finally { await p.close(); }
});

test("refresh closes stale replacement and next Replace uses the fresh persisted revision", async () => {
  const p = await page();
  try {
    await p.goto(String(server.url)); await p.getByText("Stored secret metadata", { exact: true }).click();
    await p.getByRole("button", { name: "Replace default", exact: true }).click();
    data.inventory = [{ ...fixtureKey, revision: "b".repeat(64) }];
    await p.getByRole("button", { name: "Refresh settings" }).click();
    await p.getByRole("button", { name: "Replace default", exact: true }).waitFor();
    expect(await p.getByLabel("New API secret").count()).toBe(0);
    await p.getByRole("button", { name: "Replace default", exact: true }).click();
    await p.getByLabel("New API secret").fill("disposable-replacement");
    await p.getByRole("checkbox", { name: /Save this selected API secret/ }).check();
    await p.getByRole("button", { name: "Save secret", exact: true }).click();
    await p.getByText("Secret saved.", { exact: false }).waitFor(); expect(savedRevision).toBe("b".repeat(64));
  } finally { await p.close(); }
});

test("desktop/mobile/light/dark and 200 percent size remain contained; capture evidence", async () => {
  const p = await page();
  const output = new URL("../../../qa-reports/stm/2026-09-28/settings-captures/", import.meta.url).pathname;
  await mkdir(output, { recursive: true });
  try {
    for (const width of [390, 768, 1440]) for (const theme of ["light", "dark"]) {
      await p.setViewportSize({ width, height: 1000 }); await p.goto(`${server.url}?${theme === "dark" ? "dark" : "light"}`);
      await p.getByRole("button", { name: "Add secret", exact: true }).click();
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width !== 768) await p.screenshot({ path: `${output}${width}-${theme}.png`, fullPage: true });
    }
    await p.setViewportSize({ width: 390, height: 900 }); await p.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await p.getByLabel("Tool identifier").focus(); await p.keyboard.press("Tab"); expect(await p.getByLabel("Secret label", { exact: true }).evaluate(el => el === document.activeElement)).toBe(true);
  } finally { await p.close(); }
}, 30_000);

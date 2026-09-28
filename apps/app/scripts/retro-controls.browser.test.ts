import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";

let browser: Browser;
let server: ReturnType<typeof Bun.serve>;
let savedModelRequests = 0;
let modelSaveMode: "ok" | "mismatch" | "denied" = "ok";
let releaseModelSave: (() => void) | undefined;
let modelSaveGate: Promise<void> | undefined;
beforeAll(async () => {
  const bundle = await build({
    configFile: false, root: new URL("../", import.meta.url).pathname, logLevel: "error",
    resolve: { alias: { "@": new URL("../src", import.meta.url).pathname }, dedupe: ["react", "react-dom"] },
    define: { "import.meta.env": '{"VITE_MATTERHORN_RETRO_UI":"1"}', "process.env.NODE_ENV": '"development"' },
    plugins: [tailwindcss()],
    build: { target: "esnext", write: false, minify: false,
      lib: { entry: new URL("./fixtures/retro-controls.tsx", import.meta.url).pathname, formats: ["es"] },
      rollupOptions: { output: { inlineDynamicImports: true } } },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!("output" in result)) throw new Error("Missing fixture bundle");
  const script = result.output.find(item => item.type === "chunk" && item.isEntry);
  if (!script || script.type !== "chunk") throw new Error("Missing fixture script");
  const css = result.output.filter(item => item.type === "asset" && item.fileName.endsWith(".css"));
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/workspace/fixture/backend/model-selection" && request.method === "PATCH") {
      savedModelRequests++;
      const body = await request.json();
      await modelSaveGate;
      if (modelSaveMode === "denied") return Response.json({ message: "Fixture permission denied" }, { status: 403 });
      return Response.json({ success: true, selection: {
        providerId: body.providerId, modelId: modelSaveMode === "mismatch" ? "wrong-fixture-model" : body.modelId,
        source: "server_workspace_preference", savedAt: "2026-09-28T00:00:00Z",
      } });
    }
    if (path === "/fixture.js") return new Response(script.code, { headers: { "content-type": "text/javascript" } });
    if (path === "/fixture.css") return new Response(css.map(item => item.type === "asset" ? item.source : "").join("\n"), { headers: { "content-type": "text/css" } });
    return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Retro component fixture</title><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{height:auto;overflow:visible}</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>', { headers: { "content-type": "text/html" } });
  } });
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => { await browser?.close(); server?.stop(true); });

for (const theme of ["light", "dark"]) {
  test(`${theme}: real controls retain draft, selection, focus and portal semantics`, async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(5000);
    try {
      await page.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
      await page.goto(`${server.url}?theme=${theme}`);
      const save = page.getByRole("button", { name: "Save note", exact: true });
      expect(await save.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe("2px");
      expect(await save.evaluate(el => getComputedStyle(el).borderRadius)).toBe("3px");
      expect(await save.evaluate(el => getComputedStyle(el).boxShadow)).toContain("3px 3px 0px");
      const disabled = page.getByRole("button", { name: "Unavailable", exact: true });
      expect(await disabled.isDisabled()).toBe(true);
      expect(await disabled.evaluate(el => getComputedStyle(el).boxShadow)).toBe("none");
      const consent = page.getByRole("checkbox", { name: "Fixture consent" });
      expect(await consent.isChecked()).toBe(false);
      expect(await consent.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe("2px");
      await consent.check();
      expect(await consent.isChecked()).toBe(true);
      const preference = page.getByRole("switch", { name: "Fixture preference" });
      await preference.check();
      expect(await preference.isChecked()).toBe(true);
      expect(await preference.locator('[data-slot="switch-thumb"]').evaluate(el => getComputedStyle(el).transitionProperty)).toBe("none");
      await page.getByRole("textbox", { name: "Draft", exact: true }).fill("Unsent fixture draft");
      await page.getByRole("tab", { name: "Review", exact: true }).click();
      expect(await page.getByRole("tab", { name: "Review", exact: true }).getAttribute("aria-selected")).toBe("true");
      await page.getByRole("button", { name: "Open review", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      expect(await dialog.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe("2px");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      expect(await page.getByRole("textbox", { name: "Draft", exact: true }).inputValue()).toBe("Unsent fixture draft");
      expect(await page.getByRole("button", { name: "Open review", exact: true }).evaluate(el => el === document.activeElement)).toBe(true);
      await page.getByLabel("Note title", { exact: true }).focus();
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => document.activeElement ? getComputedStyle(document.activeElement).outlineWidth : "");
      expect(focus).toBe("3px");
      await save.click();
      expect(await page.getByRole("status").innerText()).toBe("Fixture saved");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    } finally { await page.close(); }
  }, 30_000);
}

test("flag-off styles remain the incumbent controls", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${server.url}?retro=0`);
    expect(await page.locator("html").getAttribute("data-matterhorn-ui")).toBeNull();
    expect(await page.getByRole("button", { name: "Save note", exact: true }).evaluate(el => getComputedStyle(el).borderTopWidth)).toBe("1px");
  } finally { await page.close(); }
});

test("models filter and persist before first/later navigation; failed saves stay retryable", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  savedModelRequests = 0; modelSaveMode = "ok";
  try {
    await page.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
    await page.goto(`${server.url}?models`);
    const models = page.getByRole("list", { name: "Chat models" });
    expect(await models.getByRole("button").count()).toBe(2);
    expect(await models.innerText()).not.toContain("embedding");
    expect(await models.innerText()).not.toContain("Disconnected");
    await page.getByRole("combobox", { name: "Provider", exact: true }).selectOption("venice");
    expect(await models.getByRole("button").count()).toBe(1);
    await page.getByRole("combobox", { name: "Provider", exact: true }).selectOption("");
    await page.getByRole("searchbox", { name: "Search models" }).fill("no match");
    await page.getByText("No matching models. Change the search or provider.").waitFor();
    await page.getByRole("searchbox", { name: "Search models" }).fill("");
    modelSaveGate = new Promise<void>(resolve => { releaseModelSave = resolve; });
    const asi = models.getByRole("button", { name: /ASI1 Mini/ });
    await asi.click();
    await page.getByText("Saving…", { exact: true }).waitFor();
    expect(await asi.isDisabled()).toBe(true);
    expect(await page.getByTestId("model-navigation").innerText()).toBe("");
    expect(await page.getByText("Workspace model saved.", { exact: true }).count()).toBe(0);
    releaseModelSave?.(); modelSaveGate = undefined;
    await page.getByText("Desk launcher requested", { exact: true }).waitFor();
    expect(await asi.getAttribute("aria-pressed")).toBe("true");
    expect(savedModelRequests).toBe(1);
    modelSaveMode = "mismatch";
    const venice = models.getByRole("button", { name: /Fixture Chat/ });
    await venice.click();
    await page.getByRole("alert").filter({ hasText: "The model was not saved. Try again." }).waitFor();
    expect(await asi.getAttribute("aria-pressed")).toBe("true");
    expect(await venice.getAttribute("aria-pressed")).toBe("false");
    modelSaveMode = "denied";
    await venice.click();
    await page.getByRole("alert").filter({ hasText: "Fixture permission denied" }).waitFor();
    expect(await venice.isDisabled()).toBe(false);
    modelSaveMode = "ok";
    await venice.click();
    await page.getByText("Return to conversation requested", { exact: true }).waitFor();
    expect(await venice.getAttribute("aria-pressed")).toBe("true");
    await page.getByText("Provider privacy", { exact: true }).click();
    await page.getByText(/Synthetic policy:.*Sending is blocked/).waitFor();
    await page.getByRole("button", { name: "Privacy details", exact: true }).click();
    expect(await page.getByTestId("model-action").innerText()).toBe("Privacy details requested");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { releaseModelSave?.(); modelSaveGate = undefined; await page.close(); }
}, 30_000);

test("model loading, unavailable and managed/local recovery remain truthful", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  try {
    await page.goto(`${server.url}?models&loading`);
    await page.getByRole("status").filter({ hasText: "Loading models…" }).waitFor();
    expect(await page.getByRole("list", { name: "Chat models" }).count()).toBe(0);
    await page.goto(`${server.url}?models&empty`);
    await page.getByText("No chat models are connected.").waitFor();
    expect(await page.getByRole("button", { name: "Connect provider", exact: true }).count()).toBe(0);
    await page.getByRole("button", { name: "Refresh models" }).click();
    expect(await page.getByTestId("model-action").innerText()).toBe("Refresh requested");
    await page.goto(`${server.url}?models&failed&local`);
    await page.getByText("Models could not be loaded.").waitFor();
    await page.getByRole("button", { name: "Connect provider", exact: true }).click();
    expect(await page.getByTestId("model-action").innerText()).toBe("Connect requested");
  } finally { await page.close(); }
});

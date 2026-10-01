import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { chromium, firefox, webkit, type Browser, type Page } from "playwright";
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { mkdir } from "node:fs/promises";
import { JEV_CONSENT_VERSION } from "@matterhorn-work/types/jev";

let browser: Browser;
let server: ReturnType<typeof Bun.serve>;
let classifications = 0;
let sent: Array<Record<string, unknown>> = [];
let preflights: Array<Record<string, unknown>> = [];
let release: (() => void) | undefined;
let slow = false;
let unavailable = false;
let failProvider = false;
beforeAll(async () => {
  const bundle = await build({ configFile: false, envDir: false, root: new URL("../", import.meta.url).pathname, logLevel: "error",
    resolve: { alias: { "@": new URL("../src", import.meta.url).pathname }, dedupe: ["react", "react-dom"] }, plugins: [tailwindcss()],
    define: { "process.env.NODE_ENV": '"development"' },
    build: { target: "esnext", write: false, minify: false, lib: { entry: new URL("./fixtures/jev-chat.tsx", import.meta.url).pathname, formats: ["es"] }, rollupOptions: { output: { inlineDynamicImports: true } } },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!("output" in result)) throw new Error("Missing bundle");
  const script = result.output.find(item => item.type === "chunk" && item.isEntry);
  if (!script || script.type !== "chunk") throw new Error("Missing script");
  const css = result.output.filter(item => item.type === "asset" && item.fileName.endsWith(".css"));
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/fixture.js") return new Response(script.code, { headers: { "content-type": "text/javascript" } });
    if (path === "/fixture.css") return new Response(css.map(item => item.type === "asset" ? item.source : "").join("\n"), { headers: { "content-type": "text/css" } });
    if (path === "/workspace/fixture/jev") return Response.json({ available: !unavailable, reason: "Fixture", preferenceScope: request.headers.get("authorization"), consentVersion: JEV_CONSENT_VERSION });
    if (path.endsWith("/jev")) {
      classifications++;
      if (slow) await new Promise<void>(resolve => { release = resolve; });
      return Response.json(failProvider ? { status: "unavailable", reason: "Fixture Jev unavailable. Using your selected model." }
        : { status: "classified", receipt: "fixture-signed-receipt", expiresAt: Date.now() + 300_000, topic: "bittensor", task: "compare" });
    }
    if (path.endsWith("/messages/preflight")) { preflights.push(await request.json()); return Response.json({ decision: "allow" }); }
    if (path.endsWith("/messages")) { sent.push(await request.json()); return Response.json({ ok: true, accepted: true }); }
    return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jev fixture</title><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{height:auto;overflow:visible}</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>', { headers: { "content-type": "text/html" } });
  } });
  const engine = process.env.JEV_QA_BROWSER ?? "chromium";
  browser = await (engine === "webkit" ? webkit : engine === "firefox" ? firefox : chromium).launch();
}, 60_000);
beforeEach(() => { release?.(); release = undefined; classifications = 0; sent = []; preflights = []; slow = false; unavailable = false; failProvider = false; });
afterAll(async () => { release?.(); await browser?.close(); server?.stop(true); });
async function open(page: Page) { await page.goto(String(server.url)); await page.getByRole("button", { name: "Jev: Off" }).waitFor(); }
async function enable(page: Page) {
  await page.getByRole("button", { name: "Jev: Off" }).click();
  await page.getByRole("button", { name: "Enable Jev", exact: true }).click();
  await page.getByRole("button", { name: "Jev: On" }).waitFor();
}
async function send(page: Page) { await page.getByRole("button", { name: "Send", exact: true }).click(); await page.getByTestId("answer").filter({ hasText: "Fixture response" }).waitFor(); }

test("off by default; explicit consent; selected model preserved; disable and remembered choice", async () => {
  const page = await browser.newPage();
  try {
    await open(page); await send(page); expect(classifications).toBe(0);
    await page.getByRole("button", { name: "Jev: Off" }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click(); expect(classifications).toBe(0);
    await enable(page); await page.getByLabel("Selected model").selectOption("asi1"); await send(page);
    expect(classifications).toBe(1); expect(sent.at(-1)?.model).toEqual({ providerId: "cudos", modelId: "asi1" });
    expect(sent.at(-1)?.jevReceipt).toBe("fixture-signed-receipt"); expect(preflights.at(-1)?.jevReceipt).toBe(sent.at(-1)?.jevReceipt);
    await page.getByRole("button", { name: "New chat" }).click(); await page.getByRole("button", { name: "Jev: On" }).waitFor();
    await page.reload(); await page.getByRole("button", { name: "Jev: On" }).waitFor();
    await page.getByRole("button", { name: "Jev: On" }).click(); await page.getByRole("button", { name: "Jev: Off" }).waitFor();
    expect(await page.getByRole("dialog").count()).toBe(0);
    await send(page); expect(classifications).toBe(1); expect(sent.at(-1)?.jevReceipt).toBeUndefined();
    await page.reload(); await page.getByRole("button", { name: "Jev: Off" }).waitFor();
    expect(await page.getByRole("textbox", { name: "Message" }).inputValue()).toContain("Compare public");
  } finally { await page.close(); }
}, 25_000);
test("account switch does not inherit opt-in; private mode skips; provider failures fall back", async () => {
  const page = await browser.newPage();
  try {
    await open(page); await enable(page);
    await page.getByRole("button", { name: "Switch test account" }).click(); await page.getByRole("button", { name: "Jev: Off" }).waitFor(); await send(page); expect(classifications).toBe(0);
    await enable(page); await page.getByRole("button", { name: "Private mode" }).click(); await send(page); expect(classifications).toBe(0);
    await page.getByRole("button", { name: "Private mode" }).click(); failProvider = true; await send(page);
    expect(classifications).toBe(1); expect(sent.at(-1)?.jevReceipt).toBeUndefined();
  } finally { await page.close(); }
}, 20_000);
test("Stop during classification prevents model dispatch and preserves draft", async () => {
  const page = await browser.newPage();
  try {
    await open(page); await enable(page); slow = true;
    const request = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith("/jev"));
    await page.getByRole("button", { name: "Send", exact: true }).click(); await request;
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await page.getByTestId("answer").filter({ hasText: "cancelled" }).waitFor(); release?.();
    expect(sent.length).toBe(0); expect(preflights.length).toBe(0);
    expect(await page.getByRole("textbox", { name: "Message" }).inputValue()).toContain("Compare public");
  } finally { release?.(); await page.close(); }
}, 20_000);
test("disabling during classification discards its result and continues ordinary chat", async () => {
  const page = await browser.newPage();
  try {
    await open(page); await enable(page); slow = true;
    const request = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith("/jev"));
    await page.getByRole("button", { name: "Send", exact: true }).click(); await request;
    await page.getByRole("button", { name: "Jev: On" }).click();
    await page.getByTestId("answer").filter({ hasText: "Fixture response" }).waitFor(); release?.();
    expect(sent.length).toBe(1); expect(sent[0].jevReceipt).toBeUndefined();
  } finally { release?.(); await page.close(); }
}, 20_000);
test("responsive light/dark control and consent are keyboard usable with no page overflow", async () => {
  const captureRoot = process.env.JEV_QA_CAPTURE_DIR;
  if (captureRoot) await mkdir(captureRoot, { recursive: true });
  for (const theme of ["light", "dark"]) for (const width of [390, 650, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    try {
      await page.goto(`${server.url}?theme=${theme}`);
      const control = page.getByRole("button", { name: "Jev: Off" }); await control.waitFor();
      await control.focus(); await page.keyboard.press("Enter"); await page.getByRole("dialog").waitFor();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (captureRoot) await page.screenshot({ path: `${captureRoot}/consent-${theme}-${width}.png`, fullPage: true });
      await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "hidden" });
      if (captureRoot) await page.screenshot({ path: `${captureRoot}/composer-${theme}-${width}.png`, fullPage: true });
    } finally { await page.close(); }
  }
}, 40_000);

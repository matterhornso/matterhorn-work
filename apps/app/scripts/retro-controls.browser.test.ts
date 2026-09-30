import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, firefox, webkit, type Browser } from "playwright";
import { verifyBundledFonts } from "./fixtures/verify-bundled-fonts";
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { mkdir, readFile } from "node:fs/promises";

let browser: Browser;
let server: ReturnType<typeof Bun.serve>;
let savedModelRequests = 0;
let modelSaveMode: "ok" | "mismatch" | "denied" = "ok";
let releaseModelSave: (() => void) | undefined;
let modelSaveGate: Promise<void> | undefined;
let noteSaveDenied = false;
let memoryCaptures = 0;
let accessMode: "off" | "ready" | "error" = "off";
let accessWrites = 0;
let authAvailable = false;
const initialNote = () => ({
  version: "matterhorn.note.v1", id: "fixture-note", workspaceId: "fixture", title: "Beta checklist",
  body: "Disposable fixture note", tags: [], links: [], source: "manual", filePath: "notes/fixture.md",
  createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z",
});
let note = initialNote();
beforeAll(async () => {
  const bundle = await build({
    configFile: false, envDir: false, root: new URL("../", import.meta.url).pathname, logLevel: "error",
    resolve: { alias: { "@": new URL("../src", import.meta.url).pathname }, dedupe: ["react", "react-dom"] },
    define: { "import.meta.env.VITE_MATTERHORN_RETRO_UI": '"1"', "process.env.NODE_ENV": '"development"' },
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
  const logo = await readFile(new URL("../public/matterhorn-logo-square.svg", import.meta.url));
  // Signed-out production entry deliberately does not import the app stylesheet.
  const authCss = await readFile(new URL("../src/react-app/domains/cloud/public-web-signin.css", import.meta.url), "utf8");
  const retroCss = await readFile(new URL("../src/styles/retro.css", import.meta.url), "utf8");
  const entryHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const entryStyle = entryHtml.match(/<style>[\s\S]*?<\/style>/)?.[0];
  if (!entryStyle) throw new Error("Missing incumbent first-paint typography");
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/workspace/fixture/backend/") && request.method === "GET") return Response.json({ message: "Fixture privacy service unavailable" }, { status: 503 });
    if (path === "/fixture-auth/v1/session") return authAvailable ? Response.json({ authenticated: false }) : Response.json({ message: "Fixture unavailable" }, { status: 503 });
    if (path === "/api/auth/config") return Response.json({ signupsAvailable: false, signupStatus: "paused", emailVerificationRequired: true, passwordResetAvailable: true, legalAcceptanceRequired: true, minimumPasswordLength: 12, turnstileSiteKey: null });
    if (path === "/api/auth/account/mcp-access") {
      if (request.method !== "GET") { accessWrites++; return Response.json({ message: "Fixture creation unavailable" }, { status: 503 }); }
      if (accessMode === "error") return Response.json({ message: "Fixture access unavailable" }, { status: 503 });
      return Response.json({ mode: accessMode === "off" ? "off" : "invite", eligible: accessMode === "ready", maxExpiresInDays: 30, credentials: [] });
    }
    if (path === "/matterhorn-logo-square.svg") return new Response(logo, { headers: { "content-type": "image/svg+xml" } });
    if (path === "/workspace/fixture/notes") return Response.json({ success: true, items: [note], count: 1 });
    if (path === "/workspace/fixture/notes/fixture-note" && request.method === "PATCH") {
      if (noteSaveDenied) return Response.json({ message: "Fixture save unavailable" }, { status: 503 });
      note = { ...note, ...await request.json() };
      return Response.json({ success: true, note });
    }
    if (path === "/workspace/fixture/memory/entities") return Response.json({ success: true, records: [] });
    if (path === "/workspace/fixture/memory/suggestions") return Response.json({ success: true, entries: [] });
    if (path === "/workspace/fixture/memory/capture") {
      memoryCaptures++;
      return Response.json({ message: "Fixture save unavailable" }, { status: 503 });
    }
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
    const auth = new URL(request.url).searchParams.has("auth");
    if (path === "/fixture.css") return new Response(auth ? `${authCss}\n${retroCss}` : css.map(item => item.type === "asset" ? item.source : "").join("\n"), { headers: { "content-type": "text/css" } });
    return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Retro component fixture</title>${auth ? entryStyle : ""}<link rel="stylesheet" href="/fixture.css${auth ? "?auth" : ""}"><style>html,body,#root{height:auto;overflow:visible}</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>`, { headers: { "content-type": "text/html" } });
  } });
  const engine = process.env.RETRO_QA_BROWSER ?? "chromium";
  if (!["chromium", "firefox", "webkit"].includes(engine)) throw new Error("Unknown QA browser engine");
  browser = await (engine === "firefox" ? firefox : engine === "webkit" ? webkit : chromium).launch();
}, 60_000);
afterAll(async () => { await browser?.close(); server?.stop(true); });

test("bundled fonts load and auth typography matches the local distribution when supplied", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await page.goto(`${server.url}?auth&theme=dark`);
    await page.locator(".public-auth-title").waitFor();
    const typography = () => page.locator(".public-auth-title").evaluate(el => {
      const style = getComputedStyle(el);
      return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight, lineHeight: style.lineHeight };
    });
    const fixture = await typography();
    const target = process.env.RETRO_QA_DIST_URL;
    if (target) {
      if (new URL(target).hostname !== "127.0.0.1") throw new Error("Distribution comparison must stay local");
      await page.goto(target);
      await page.getByRole("button", { name: "Sign in", exact: true }).first().waitFor();
      expect(await typography()).toEqual(fixture);
      console.log(JSON.stringify({ typographyComparison: "local distribution and fixture", ...fixture }));
      expect(await page.locator(".public-auth-kicker").count()).toBe(0);
      const staticPage = await browser.newPage({ javaScriptEnabled: false });
      try {
        await staticPage.goto(target);
        expect(await staticPage.locator(".public-auth-kicker").count()).toBe(0);
        expect(await staticPage.locator(".public-auth-beta-status").innerText()).toBe("Public beta");
        expect(await staticPage.locator(".public-auth-beta-status").evaluate(el => el.previousElementSibling?.className)).toBe("public-auth-description");
      } finally { await staticPage.close(); }
    }
    await page.goto(`${server.url}?public=/security`);
    await page.getByRole("heading", { name: "Security", exact: true }).waitFor();
    await verifyBundledFonts(page);
    const body = await page.locator("body").evaluate(el => getComputedStyle(el).fontFamily);
    if (target) {
      await page.goto(new URL("/security", target).href);
      await page.getByRole("heading", { name: "Security", exact: true }).waitFor();
      await verifyBundledFonts(page);
      expect(await page.locator("body").evaluate(el => getComputedStyle(el).fontFamily)).toBe(body);
    }
  } finally { await page.close(); }
}, 20_000);

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
      const grouped = page.getByRole("textbox", { name: "Grouped search", exact: true });
      await grouped.fill("Keep this query");
      expect(await grouped.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe("0px");
      expect(await grouped.evaluate(el => getComputedStyle(el.parentElement!).borderTopWidth)).toBe("2px");
      expect(await grouped.evaluate(el => getComputedStyle(el.parentElement!).outlineWidth)).toBe("3px");
      const groupedMessage = page.getByRole("textbox", { name: "Grouped message", exact: true });
      await groupedMessage.fill("Keep this message");
      expect(await groupedMessage.inputValue()).toBe("Keep this message");
      const invalidGroup = page.getByRole("textbox", { name: "Invalid grouped field", exact: true });
      expect(await invalidGroup.evaluate(el => getComputedStyle(el.parentElement!).borderTopColor)).toBe(theme === "light" ? "rgb(185, 28, 28)" : "rgb(255, 180, 173)");
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

test("chat picker keeps disabled models unselectable, selection explicit and draft intact", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  try {
    await page.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
    await page.goto(`${server.url}?picker`);
    const done = page.getByRole("button", { name: "Done", exact: true });
    expect(await done.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe("2px");
    expect(await done.evaluate(el => getComputedStyle(el).boxShadow)).toContain("3px 3px 0px");
    const search = page.getByRole("textbox", { name: "Search providers and models", exact: true });
    await search.fill("fixture");
    expect(await page.getByRole("button", { name: /Embedding fixture/ }).count()).toBe(0);
    expect(await page.getByRole("button", { name: /Unavailable fixture model/ }).isDisabled()).toBe(true);
    await search.fill("ASI1");
    const current = page.getByRole("button", { name: /ASI1 Mini Chat/ });
    expect(await current.getAttribute("aria-pressed")).toBe("true");
    for (const theme of ["light", "dark"]) {
      await page.locator("html").evaluate((el, value) => { el.setAttribute("data-theme", value); }, theme);
      expect(await current.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(209, 242, 255)");
      expect(await current.evaluate(el => getComputedStyle(el).color)).toBe("rgb(24, 23, 28)");
    }
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    expect(await page.getByRole("textbox", { name: "Draft", exact: true }).inputValue()).toBe("Unsent fixture draft");
    await page.goto(`${server.url}?picker&empty&loading`);
    await page.getByRole("status").filter({ hasText: "Loading available models" }).waitFor();
    await page.goto(`${server.url}?picker&unselected`);
    await page.getByRole("button", { name: /ASI1 Mini Chat/ }).waitFor();
    expect(await page.getByRole("button", { name: /ASI1 Mini Chat/ }).getAttribute("aria-pressed")).toBe("false");
  } finally { await page.close(); }
}, 15_000);

test("flag-off styles remain the incumbent controls", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${server.url}?retro=0`);
    expect(await page.locator("html").getAttribute("data-matterhorn-ui")).toBeNull();
    expect(await page.getByRole("button", { name: "Save note", exact: true }).evaluate(el => getComputedStyle(el).borderTopWidth)).toBe("1px");
  } finally { await page.close(); }
});

test("reopened picker reveals the model selected outside the dialog", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  try {
    await page.goto(`${server.url}?picker&reopen`);
    await page.getByRole("button", { name: /ASI1 Mini Chat/ }).waitFor();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Change provider outside picker", exact: true }).click();
    await page.getByRole("button", { name: "Choose model", exact: true }).click();
    const current = page.getByRole("button", { name: /Other provider chat Chat/ });
    await current.waitFor();
    expect(await current.getAttribute("aria-pressed")).toBe("true");
    await page.keyboard.press("Escape");
    expect(await page.getByRole("textbox", { name: "Draft", exact: true }).inputValue()).toBe("Unsent fixture draft");
  } finally { await page.close(); }
});

test("appearance preserves theme selection, language keyboard access and busy state", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  try {
    await page.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
    await page.goto(`${server.url}?settings`);
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
    expect(await page.getByRole("button", { name: "Dark", exact: true }).getAttribute("aria-pressed")).toBe("true");
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    expect(await page.getByRole("button", { name: "Dark", exact: true }).getAttribute("aria-pressed")).toBe("true");
    expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
    await page.reload();
    await page.getByRole("button", { name: "Dark", exact: true }).waitFor();
    expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
    await page.getByRole("button", { name: "Light", exact: true }).click();
    expect(await page.locator("html").getAttribute("data-theme")).toBe("light");
    await page.getByRole("button", { name: "System", exact: true }).click();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
    const language = page.getByRole("combobox", { name: "Language", exact: true });
    await language.focus(); await page.keyboard.press("Space");
    await page.getByRole("listbox").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("listbox").waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "combobox");
    expect(await language.evaluate(el => el === document.activeElement)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto(`${server.url}?settings&busy`);
    expect(await page.getByRole("button", { name: "Dark", exact: true }).isDisabled()).toBe(true);
    expect(await page.getByRole("combobox", { name: "Language", exact: true }).isDisabled()).toBe(true);
  } finally { await page.close(); }
}, 15_000);

test("settings and core forms reflow at 200 percent text size without horizontal overflow", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const failures: string[] = [];
  try {
    await page.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
    for (const surface of ["settings", "settings&privacy&disconnected", "models", "memory", "notes", "wallet&blocked", "integrations"]) {
      await page.goto(`${server.url}?${surface}`);
      await page.locator("#root > *").first().waitFor();
      await page.waitForLoadState("networkidle");
      await page.evaluate(async () => { document.documentElement.style.fontSize = "200%"; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
      const overflow = await page.evaluate(() => [...document.querySelectorAll("main *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ tag: el.tagName, slot: el.getAttribute("data-slot"), text: el.textContent?.slice(0, 80), width: el.getBoundingClientRect().width })).slice(0, 8));
      if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) failures.push(`${surface}: ${JSON.stringify(overflow)}`);
    }
    expect(failures).toEqual([]);
  } finally { await page.close(); }
}, 30_000);

test("privacy disconnected and failed states keep controls gated and navigation usable", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  try {
    await page.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
    await page.goto(`${server.url}?settings&privacy&disconnected`);
    await page.getByText("Open a workspace to review its privacy controls.", { exact: true }).waitFor();
    expect(await page.getByRole("button", { name: "Download archive", exact: true }).isDisabled()).toBe(true);
    expect(await page.getByRole("switch", { name: "Collect explicit workspace feedback" }).isDisabled()).toBe(true);
    await page.getByRole("button", { name: "Memory", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Memory requested" }).waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto(`${server.url}?settings&privacy`);
    await page.getByText("Fixture privacy service unavailable", { exact: true }).waitFor();
    expect(await page.getByRole("switch", { name: "Collect explicit workspace feedback" }).isDisabled()).toBe(true);
  } finally { await page.close(); }
}, 15_000);

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
    await page.getByRole("searchbox", { name: "Search models" }).fill(" ASI1 Mini ");
    expect(await models.getByRole("button").count()).toBe(1);
    expect(await models.innerText()).toContain("ASI1 Mini");
    await page.getByRole("searchbox", { name: "Search models" }).fill("");
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

test("public trust navigation keeps active page, readable structure and app link", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  try {
    await page.goto(`${server.url}?public=/security`);
    await page.getByRole("heading", { name: "Security", exact: true }).waitFor();
    const nav = page.getByRole("navigation", { name: "Trust pages", exact: true });
    expect(await nav.getByRole("link", { name: "Security", exact: true }).getAttribute("aria-current")).toBe("page");
    await nav.getByRole("link", { name: "Privacy", exact: true }).click();
    await page.getByRole("heading", { name: "Privacy", exact: true }).waitFor();
    expect(await nav.getByRole("link", { name: "Privacy", exact: true }).getAttribute("aria-current")).toBe("page");
    expect(await page.getByRole("link", { name: "Back to app", exact: true }).getAttribute("href")).toBe("/session");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await page.close(); }
});

test("notes keep labelled drafts on save error and persist before returning", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000); note = initialNote(); noteSaveDenied = false;
  try {
    await page.goto(`${server.url}?notes`);
    await page.getByRole("button", { name: /Beta checklist/ }).click();
    noteSaveDenied = true;
    await page.getByRole("textbox", { name: "Note body", exact: true }).fill("Edited disposable note");
    await page.getByRole("button", { name: "Back to notes", exact: true }).click();
    await page.getByText("Could not save note", { exact: true }).first().waitFor();
    expect(await page.getByRole("textbox", { name: "Note body", exact: true }).inputValue()).toBe("Edited disposable note");
    expect(note.body).toBe("Disposable fixture note");
    noteSaveDenied = false;
    await page.getByRole("button", { name: "Back to notes", exact: true }).click();
    await page.getByRole("region", { name: "Notes panel", exact: true }).waitFor();
    expect(note.body).toBe("Edited disposable note");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { noteSaveDenied = false; await page.close(); }
}, 15_000);

test("wallet review preserves blockers, explicit execution, failure and dismissal", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  try {
    await page.goto(`${server.url}?wallet&blocked`);
    await page.getByRole("dialog", { name: "Transaction Batch" }).waitFor();
    expect(await page.getByRole("button", { name: "Blocked", exact: true }).isDisabled()).toBe(true);
    expect(await page.getByTestId("wallet-attempts").innerText()).toBe("0");
    expect(await page.getByRole("alert").innerText()).toContain("Fixture policy blocks this action.");
    expect(await page.getByRole("alert").evaluate(el => getComputedStyle(el).color)).toBe("rgb(185, 28, 28)");
    await page.getByRole("button", { name: "Close transaction review" }).click();
    await page.getByText("Review closed", { exact: true }).waitFor();
    await page.goto(`${server.url}?wallet&theme=dark`);
    expect(await page.getByTestId("wallet-attempts").innerText()).toBe("0");
    await page.getByRole("button", { name: "Execute Step 1", exact: true }).click();
    await page.getByRole("alert").waitFor();
    expect(await page.getByTestId("wallet-attempts").innerText()).toBe("1");
    await page.getByRole("button", { name: "Retry Failed", exact: true }).click();
    expect(await page.getByTestId("wallet-attempts").innerText()).toBe("1");
    expect(await page.getByRole("button", { name: "Execute Step 1", exact: true }).isEnabled()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await page.close(); }
}, 15_000);

test("integrations preserve server access state and recover without exposing credentials", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000); accessMode = "off"; accessWrites = 0;
  try {
    await page.goto(`${server.url}?integrations`);
    await page.getByRole("heading", { name: "External AI access is not open yet" }).waitFor();
    expect(await page.getByRole("button", { name: "Create key", exact: true }).count()).toBe(0);
    expect(accessWrites).toBe(0);
    const connections = page.getByRole("list", { name: "Managed MCP connections" });
    expect(await connections.innerText()).toContain("Needs setup");
    expect(await connections.locator('[data-connection-ready="true"]').evaluate(el => getComputedStyle(el).color)).toBe("rgb(22, 101, 52)");
    expect(await connections.locator('[data-connection-ready="false"]').evaluate(el => getComputedStyle(el).color)).toBe("rgb(138, 75, 8)");
    accessMode = "error";
    await page.reload();
    await page.getByRole("alert").waitFor();
    accessMode = "ready";
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("combobox", { name: "AI app", exact: true }).selectOption("Claude Desktop");
    await page.getByRole("button", { name: "Create key", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Fixture creation unavailable" }).waitFor();
    expect(accessWrites).toBe(1);
    expect(await page.getByRole("button", { name: "Show access key" }).count()).toBe(0);
    await page.getByRole("button", { name: "Browse certified apps", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Browse requested" }).waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { accessMode = "off"; await page.close(); }
}, 15_000);

// Optional batched visual evidence. This does not label fixtures as live acceptance.
test("public auth keeps an outage explicit and recovery unavailable until service returns", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000); authAvailable = false;
  try {
    await page.goto(`${server.url}?auth`);
    await page.getByRole("alert").filter({ hasText: "Account access is temporarily unavailable" }).waitFor();
    expect(await page.getByRole("button", { name: "Forgot password?", exact: true }).isDisabled()).toBe(true);
    expect(await page.getByRole("textbox", { name: "Email", exact: true }).isDisabled()).toBe(true);
    authAvailable = true;
    await page.getByRole("button", { name: "Check again", exact: true }).click();
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await page.getByRole("heading", { name: "Reset your password", exact: true }).waitFor();
    expect(await page.getByRole("button", { name: "Send reset link", exact: true }).isEnabled()).toBe(true);
    await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { authAvailable = false; await page.close(); }
}, 15_000);

test("transcript tool labels, disclosure, focus and failure actions stay usable", async () => {
  for (const theme of ["light", "dark"]) {
    for (const width of [390, 650, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      await page.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
      try {
        await page.goto(`${server.url}?chat&theme=${theme}`);
        const tool = page.getByRole("button", { name: "Hyperliquid orderbook", exact: true });
        await tool.waitFor();
        expect(await tool.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
        await tool.focus();
        expect(await tool.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
        await tool.press("Enter");
        expect(await tool.getAttribute("aria-expanded")).toBe("true");
        expect(await page.getByText('"source": "synthetic-fixture"', { exact: false }).count()).toBeGreaterThan(0);
        await tool.press("Enter");
        expect(await tool.getAttribute("aria-expanded")).toBe("false");
        await page.getByRole("button", { name: "Retry response", exact: true }).click();
        await page.getByText("Fixture retry requested", { exact: true }).waitFor();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const directory = process.env.RETRO_QA_CHAT_CAPTURES;
        if (directory) {
          await mkdir(directory, { recursive: true });
          await verifyBundledFonts(page);
          await page.screenshot({ path: `${directory}/chat-${theme}-${width}.png`, fullPage: true });
        }
        await page.getByRole("button", { name: "Dismiss error", exact: true }).click();
        await page.getByText("Fixture warning dismissed", { exact: true }).waitFor();
      } finally { await page.close(); }
    }
  }
}, 45_000);

test.skipIf(!process.env.RETRO_QA_CORE_CAPTURES)("capture scoped shared-controls and models review", async () => {
  const directory = process.env.RETRO_QA_CORE_CAPTURES;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  for (const theme of ["light", "dark"]) {
    for (const { surface, width } of [{ surface: "models", width: 390 }, { surface: "picker", width: 650 }, { surface: "controls", width: 1280 }]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      try {
        await page.goto(`${server.url}?${surface}&theme=${theme}`);
        await page.locator("#root > *").first().waitFor();
        await page.waitForLoadState("networkidle");
        await verifyBundledFonts(page);
        await page.screenshot({ path: `${directory}/${surface}-${theme}-${width}.png`, fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      } finally { await page.close(); }
    }
  }
}, 30_000);

test.skipIf(!process.env.RETRO_QA_CAPTURES)("capture component matrix for bounded visual review", async () => {
  const directory = process.env.RETRO_QA_CAPTURES;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  accessMode = "off";
  for (const theme of ["light", "dark"]) {
    for (const width of [390, 768, 1280, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      try {
        for (const surface of ["auth", "models", "picker", "notes", "memory", "wallet&blocked", "integrations", "public=/security", "settings", "settings&privacy&disconnected"]) {
          await page.goto(`${server.url}?${surface}&theme=${theme}`);
          await page.locator("#root > *").first().waitFor();
          await page.waitForLoadState("networkidle");
          if (surface !== "auth") await verifyBundledFonts(page);
          const name = surface.includes("privacy") ? "settings-privacy" : surface.split(/[=&]/)[0];
          await page.screenshot({ path: `${directory}/${name}-${theme}-${width}.png`, fullPage: true });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
      } finally { await page.close(); }
    }
  }
}, 90_000);

test("memory requires explicit confirmation and keeps failed captures visible", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000); memoryCaptures = 0;
  try {
    await page.goto(`${server.url}?memory`);
    await page.getByRole("button", { name: "Review", exact: true }).click();
    await page.getByText("No suggestions", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Saved", exact: true }).click();
    await page.getByRole("button", { name: "Add memory", exact: true }).click();
    await page.getByRole("textbox", { name: "Memory title" }).fill("Reading preference");
    await page.getByRole("textbox", { name: "Memory summary" }).fill("Concise explanations");
    await page.getByRole("textbox", { name: "Memory details" }).fill("Prefer concise explanations in this disposable fixture.");
    await page.getByRole("button", { name: "Save memory", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Confirm that this contains no secrets" }).waitFor();
    expect(memoryCaptures).toBe(0);
    await page.getByRole("checkbox", { name: /I confirm this is safe/ }).check();
    await page.getByRole("button", { name: "Save memory", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Fixture save unavailable" }).waitFor();
    expect(memoryCaptures).toBe(1);
    expect(await page.getByRole("textbox", { name: "Memory title" }).inputValue()).toBe("Reading preference");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await page.close(); }
}, 15_000);

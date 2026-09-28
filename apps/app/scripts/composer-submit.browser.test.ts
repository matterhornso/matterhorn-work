import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { mkdir, readFile } from "node:fs/promises";
import { verifyBundledFonts } from "./fixtures/verify-bundled-fonts";

let browser: Browser;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  const bundle = await build({
    configFile: false,
    envDir: false,
    root: new URL("../", import.meta.url).pathname,
    logLevel: "error",
    resolve: { alias: { "@": new URL("../src", import.meta.url).pathname }, dedupe: ["react", "react-dom"] },
    define: { "import.meta.env.VITE_MATTERHORN_RETRO_UI": JSON.stringify(process.env.RETRO_QA_FLAG === "1" ? "1" : "0"), "process.env.NODE_ENV": '"development"' },
    build: {
      target: "esnext",
      write: false,
      minify: false,
      lib: { entry: new URL("./fixtures/composer-submit.tsx", import.meta.url).pathname, formats: ["es"] },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
    plugins: [tailwindcss(), {
      name: "isolated-host-policy",
      load(id) {
        // Only host configuration is stubbed; the composer and Lexical editor
        // are the production components, including their React event wiring.
        if (id.endsWith("/desktop-config-provider.tsx")) {
          return "export function useDesktopRestriction() { return false; } export function useCheckDesktopRestriction() { return () => false; }";
        }
      },
    }],
  });
  const built = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!("output" in built)) throw new Error("Expected a fixture bundle");
  const entry = built.output.find((output) => output.type === "chunk" && output.isEntry);
  if (!entry || entry.type !== "chunk") throw new Error("Fixture entry missing");
  const script = entry.code;
  const css = built.output.filter(item => item.type === "asset" && item.fileName.endsWith(".css"));
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/fixture.js") {
        return new Response(script, { headers: { "Content-Type": "text/javascript" } });
      }
      if (new URL(request.url).pathname === "/fixture.css") return new Response(css.map(item => item.type === "asset" ? item.source : "").join("\n"), { headers: { "Content-Type": "text/css" } });
      const path = new URL(request.url).pathname;
      if (/^\/(?:extensions\/)?[a-z0-9/_-]+\.svg$/i.test(path)) {
        const asset = await readFile(new URL(`../public${path}`, import.meta.url)).catch(() => null);
        if (asset) return new Response(asset, { headers: { "Content-Type": "image/svg+xml" } });
      }
      return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{height:auto;overflow:visible}</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>', {
        headers: { "Content-Type": "text/html" },
      });
    },
  });
  browser = await chromium.launch();
}, 30_000);

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
});

async function fixturePage() {
  const page = await browser.newPage();
  // A regression test must never contact an account, provider or protocol.
  await page.route("**/*", (route) => new URL(route.request().url()).origin === server.url.origin
    ? route.continue()
    : route.abort());
  page.setDefaultTimeout(3_000);
  return page;
}

test("auth rechecks never flash sign-in or expose the desk before confirmation", async () => {
  const page = await fixturePage();
  try {
    await page.goto(`${server.url}?authBoundary`);
    await page.getByRole("heading", { name: "Authenticated desk" }).waitFor();
    await page.getByRole("button", { name: "Recheck session" }).click();
    await page.getByRole("status").waitFor();
    expect(await page.getByRole("heading").count()).toBe(0);
    await page.getByRole("button", { name: "Confirm session" }).click();
    await page.getByRole("heading", { name: "Authenticated desk" }).waitFor();
    expect(await page.getByRole("heading", { name: "Sign in", exact: true }).count()).toBe(0);
    await page.getByRole("button", { name: "Expire session" }).click();
    await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
    expect(await page.getByRole("heading", { name: "Authenticated desk" }).count()).toBe(0);
  } finally { await page.close(); }
});

test("Ask click sends a serializable request without a React event as consent", async () => {
  const page = await fixturePage();
  try {
    await page.goto(server.url.href);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    const result = await page.getByTestId("result").textContent();
    expect(result).not.toBe("serialization_failed");
    expect(JSON.parse(result ?? "null")).toEqual({
      parts: [{ type: "text", text: "Explain a blockchain in one sentence." }],
    });
  } finally { await page.close(); }
});

test("Enter sends without a consent argument", async () => {
  const page = await fixturePage();
  try {
    await page.goto(server.url.href);
    await page.getByRole("textbox", { name: "Test prompt" }).press("Enter");
    const result = await page.getByTestId("result").textContent();
    expect(JSON.parse(result ?? "null")).toEqual({
      parts: [{ type: "text", text: "Explain a blockchain in one sentence." }],
    });
  } finally { await page.close(); }
});

test("empty and disabled composers cannot Ask; busy empty composer can stop", async () => {
  const page = await fixturePage();
  try {
    for (const query of ["empty", "disabled"]) {
      await page.goto(`${server.url}?${query}`);
      await page.getByRole("button", { name: "Ask", exact: true }).waitFor();
      expect(await page.getByRole("button", { name: "Ask", exact: true }).isDisabled()).toBe(true);
      expect(await page.getByTestId("result").textContent()).toBe("");
    }
    await page.goto(`${server.url}?empty&busy`);
    await page.getByRole("button", { name: "Stop generating", exact: true }).click();
    expect(await page.getByTestId("result").textContent()).toBe("stopped");
  } finally { await page.close(); }
});

test("pending sends are single-flight before render, and failure permits a token-free retry", async () => {
  const page = await fixturePage();
  try {
    await page.goto(`${server.url}?managed&failFirst`);
    await page.getByRole("button", { name: "Two sends before render" }).click();
    expect(JSON.parse(await page.getByTestId("calls").textContent() ?? "null")).toHaveLength(1);
    expect(await page.getByRole("button", { name: "Ask", exact: true }).isDisabled()).toBe(true);
    await page.getByRole("button", { name: "Complete fixture request" }).click();
    await page.getByTestId("result").filter({ hasText: "retry_available" }).waitFor();
    await page.getByRole("button", { name: "Retry fixture request" }).click();
    await page.getByRole("button", { name: "Complete fixture request" }).click();
    await page.getByTestId("result").filter({ hasText: "accepted" }).waitFor();
    expect(JSON.parse(await page.getByTestId("calls").textContent() ?? "null")).toEqual([
      { text: "Explain a blockchain in one sentence." },
      { text: "Explain a blockchain in one sentence." },
    ]);
  } finally { await page.close(); }
});

test("only explicit consent sends a token; subsequent ordinary sends do not reuse it", async () => {
  const page = await fixturePage();
  try {
    await page.goto(`${server.url}?managed`);
    await page.getByRole("button", { name: "Missing fixture consent" }).click();
    expect(await page.getByTestId("result").textContent()).toBe("invalid_consent");
    expect(await page.getByTestId("calls").textContent()).toBe("[]");
    await page.getByRole("button", { name: "Confirm fixture consent" }).click();
    await page.getByRole("button", { name: "Complete fixture request" }).click();
    await page.getByTestId("result").filter({ hasText: "accepted" }).waitFor();
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    expect(JSON.parse(await page.getByTestId("calls").textContent() ?? "null")).toEqual([
      { text: "Explain a blockchain in one sentence.", privacyConsentToken: "fixture-consent-token" },
      { text: "Explain a blockchain in one sentence." },
    ]);
    await page.getByRole("button", { name: "Complete fixture request" }).click();
  } finally { await page.close(); }
});

test("all five real desk buttons are keyboard reachable and do not submit a draft", async () => {
  const page = await fixturePage();
  try {
    await page.goto(`${server.url}?launcher`);
    const desks = page.getByRole("region", { name: "Desks", exact: true });
    expect(await desks.getByRole("button").count()).toBe(5);
    for (const id of ["private_ai", "bittensor", "hyperliquid", "polymarket", "sui"]) {
      const button = page.getByTestId(`open-${id}-desk`);
      await button.focus();
      await page.keyboard.press("Enter");
      expect(await page.getByTestId("selected-desk").textContent()).toBe(id);
      expect(await page.getByTestId("calls").textContent()).toBe("[]");
      expect(await page.getByRole("textbox", { name: "Test prompt" }).innerText()).toBe("Explain a blockchain in one sentence.");
    }
  } finally { await page.close(); }
});

test.skipIf(process.env.RETRO_QA_FLAG !== "1")("mobile sidebar closes after navigation and restores its trigger focus", async () => {
  const page = await fixturePage();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.url}?sidebar`);
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Workspace navigation", exact: true });
    await drawer.waitFor();
    await drawer.getByRole("button", { name: "Bittensor", exact: true }).click();
    await drawer.waitFor({ state: "hidden" });
    expect(await page.getByRole("status").filter({ hasText: "Bittensor" }).innerText()).toBe("Bittensor");
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
    await drawer.waitFor();
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    expect(await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).evaluate(el => el === document.activeElement)).toBe(true);
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await drawer.waitFor({ state: "hidden" });
    expect(await page.getByRole("textbox", { name: "Test prompt" }).innerText()).toBe("Explain a blockchain in one sentence.");
  } finally { await page.close(); }
});

test.skipIf(!process.env.RETRO_QA_CAPTURES)("capture real launcher and composer in both themes and responsive sizes", async () => {
  const directory = process.env.RETRO_QA_CAPTURES;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  for (const theme of ["light", "dark"]) {
    for (const width of [390, 768, 1280, 1440]) {
      const page = await fixturePage();
      try {
        await page.setViewportSize({ width, height: 1100 });
        await page.emulateMedia({ colorScheme: theme === "dark" ? "dark" : "light", reducedMotion: "reduce" });
        await page.goto(`${server.url}?launcher&theme=${theme}`);
        await page.getByRole("textbox", { name: "Test prompt" }).waitFor();
        await page.waitForLoadState("networkidle");
        await verifyBundledFonts(page);
        await page.screenshot({ path: `${directory}/launcher-composer-${theme}-${width}.png`, fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (process.env.RETRO_QA_FLAG === "1") {
          await page.goto(`${server.url}?sidebar&launcher&theme=${theme}`);
          await page.getByRole("textbox", { name: "Test prompt" }).waitFor();
          if (width < 768) await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
          await verifyBundledFonts(page);
          await page.screenshot({ path: `${directory}/sidebar-${theme}-${width}.png`, fullPage: true });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
        await page.goto(`${server.url}?busy&empty&theme=${theme}`);
        await page.getByRole("button", { name: "Stop generating", exact: true }).waitFor();
        await verifyBundledFonts(page);
        await page.screenshot({ path: `${directory}/composer-busy-${theme}-${width}.png`, fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      } finally { await page.close(); }
    }
  }
}, 60_000);

import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { build } from "vite";

let browser: Browser;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  const bundle = await build({
    configFile: false,
    root: new URL("../", import.meta.url).pathname,
    logLevel: "error",
    resolve: { alias: { "@": new URL("../src", import.meta.url).pathname }, dedupe: ["react", "react-dom"] },
    define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"development"' },
    build: {
      target: "esnext",
      write: false,
      minify: false,
      lib: { entry: new URL("./fixtures/composer-submit.tsx", import.meta.url).pathname, formats: ["es"] },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
    plugins: [{
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
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname === "/fixture.js") {
        return new Response(script, { headers: { "Content-Type": "text/javascript" } });
      }
      return new Response('<div id="root"></div><script type="module" src="/fixture.js"></script>', {
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

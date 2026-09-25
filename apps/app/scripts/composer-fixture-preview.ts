// Disposable UI fixture server. No accounts, provider calls, or protocol traffic.
// Start: bun apps/app/scripts/composer-fixture-preview.ts
import { build } from "vite";

const bundle = await build({
  configFile: false,
  root: new URL("../", import.meta.url).pathname,
  logLevel: "error",
  resolve: { alias: { "@": new URL("../src", import.meta.url).pathname }, dedupe: ["react", "react-dom"] },
  define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"development"' },
  build: {
    target: "esnext", write: false, minify: false,
    lib: { entry: new URL("./fixtures/composer-submit.tsx", import.meta.url).pathname, formats: ["es"] },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  plugins: [{
    name: "isolated-host-policy",
    load(id) {
      if (id.endsWith("/desktop-config-provider.tsx")) {
        return "export function useDesktopRestriction() { return false; } export function useCheckDesktopRestriction() { return () => false; };";
      }
    },
  }],
});
const built = Array.isArray(bundle) ? bundle[0] : bundle;
if (!("output" in built)) throw new Error("Expected fixture bundle");
const entry = built.output.find((output) => output.type === "chunk" && output.isEntry);
if (!entry || entry.type !== "chunk") throw new Error("Missing fixture entry");
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  fetch(request) {
    if (new URL(request.url).pathname === "/fixture.js") return new Response(entry.code, { headers: { "Content-Type": "text/javascript" } });
    return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated composer QA</title><div id="root"></div><script type="module" src="/fixture.js"></script></html>', {
      headers: { "Content-Type": "text/html", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'" },
    });
  },
});
console.log(`${server.url}?managed&draftRace`);

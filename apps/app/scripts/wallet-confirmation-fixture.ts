// Disposable browser fixture. No backend proxy or real wallet transport.
// Run: bun apps/app/scripts/wallet-confirmation-fixture.ts
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
const bundle = await build({
  configFile: false, envDir: false, root: new URL("../", import.meta.url).pathname, logLevel: "error",
  resolve: { alias: { "@": new URL("../src", import.meta.url).pathname }, dedupe: ["react", "react-dom"] },
  plugins: [tailwindcss()], define: { "process.env.NODE_ENV": '"development"' },
  build: { target: "esnext", write: false, minify: false,
    lib: { entry: new URL("./fixtures/wallet-confirmation.tsx", import.meta.url).pathname, formats: ["es"] },
    rollupOptions: { output: { inlineDynamicImports: true } } },
});
const built = Array.isArray(bundle) ? bundle[0] : bundle;
if (!("output" in built)) throw new Error("Missing bundle");
const script = built.output.find((item) => item.type === "chunk" && item.isEntry);
if (!script || script.type !== "chunk") throw new Error("Missing entry");
const css = built.output.filter((item) => item.type === "asset" && item.fileName.endsWith(".css"));
let available = false;
let committed = false;
let confirmations = 0;
const headers = { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" };
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/fixture.js") return new Response(script.code, { headers: { ...headers, "Content-Type": "text/javascript" } });
  if (path === "/fixture.css") return new Response(css.map((item) => item.type === "asset" ? item.source : "").join("\n"), { headers: { ...headers, "Content-Type": "text/css" } });
  if (path === "/__qa/restore" && request.method === "POST") { available = true; return Response.json({ ok: true }, { headers }); }
  if (path === "/__qa/evidence") return Response.json({ available, committed, confirmations }, { headers });
  if (/^\/workspace\/fixture-workspace\/(crypto-evidence|agent-files)\/fixture-record\/(anchor|renew)\/confirm$/.test(path) && request.method === "POST") {
    confirmations++;
    if (!available) return Response.json({ code: "unavailable", message: "Synthetic unavailable verifier" }, { status: 503, headers });
    committed = true;
    return Response.json({ item: {} }, { headers });
  }
  if (/^\/workspace\/fixture-workspace\/(crypto-evidence|agent-files)$/.test(path)) return Response.json({ items: [{
    id: "fixture-record", evidenceId: "fixture-record", revision: committed ? 3 : 2,
    publication: { network: "testnet", renewalTransactionDigest: committed ? "3".repeat(44) : null },
    anchor: committed ? { network: "testnet", transactionDigest: "3".repeat(44) } : null,
  }] }, { headers });
  if (path !== "/") return new Response("Not found", { status: 404, headers });
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wallet confirmation fixture</title><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>', { headers: { ...headers, "Content-Type": "text/html" } });
} });
console.log(`Wallet confirmation fixture: ${server.url} (synthetic only)`);

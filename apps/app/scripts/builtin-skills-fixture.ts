import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";

const bundle = await build({
  configFile: false, envDir: false, root: new URL("../", import.meta.url).pathname, logLevel: "error",
  resolve: { alias: { "@": new URL("../src", import.meta.url).pathname }, dedupe: ["react", "react-dom"] },
  plugins: [tailwindcss()], define: { "process.env.NODE_ENV": '"development"' },
  build: { target: "esnext", write: false, minify: false,
    lib: { entry: new URL("./fixtures/builtin-skills.tsx", import.meta.url).pathname, formats: ["es"] },
    rollupOptions: { output: { inlineDynamicImports: true } } },
});
const built = Array.isArray(bundle) ? bundle[0] : bundle;
if (!("output" in built)) throw new Error("Missing fixture bundle");
const script = built.output.find((item) => item.type === "chunk" && item.isEntry);
if (!script || script.type !== "chunk") throw new Error("Missing fixture entry");
const css = built.output.filter((item) => item.type === "asset" && item.fileName.endsWith(".css"));
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/fixture.js") return new Response(script.code, { headers: { "Content-Type": "text/javascript" } });
  if (path === "/fixture.css") return new Response(css.map((item) => item.type === "asset" ? item.source : "").join("\n"), { headers: { "Content-Type": "text/css" } });
  if (path !== "/") return new Response(null, { status: 404 });
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Built-in skills QA — synthetic</title><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>', {
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "connect-src 'none'" },
  });
} });
console.log(`Built-in skills fixture: ${server.url} (synthetic, no accounts or network connections)`);

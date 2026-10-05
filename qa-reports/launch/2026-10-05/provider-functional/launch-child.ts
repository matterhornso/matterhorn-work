import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { startEmbeddedServer } from "../../../../apps/server/src/embedded";
import { resolveProviderPrivacyPolicy } from "../../../../apps/server/src/provider-privacy";
import { setConsoleEmailPreviewSink } from "../../../../packages/email/src/send-email";

const root = process.env.MATTERHORN_QA_ROOT;
const repo = process.env.MATTERHORN_QA_REPO;
if (!root || !repo) throw new Error("Use launch.mjs; isolated paths are required.");
const reserve = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null, { status: 503 }) });
const backendPort = reserve.port;
await reserve.stop(true);
const { createServer } = await import(pathToFileURL(join(repo, "apps/app/node_modules/vite/dist/node/index.js")).href);
process.env.VITE_MATTERHORN_DEV_API_TARGET = `http://127.0.0.1:${backendPort}`;
const frontend = await createServer({
  root: join(repo, "apps/app"), envDir: false, cacheDir: join(root, "vite-cache"),
  configFile: join(repo, "apps/app/vite.config.ts"), mode: "functional-qa",
  server: { host: "127.0.0.1", port: 0, strictPort: false }, clearScreen: false,
  plugins: [{ name: "isolated-functional-env", enforce: "post", config(config) {
    // The repository Vite config separately loads its migration fragment.
    // This disposable browser may use only the launcher's explicit VITE env.
    for (const name of Object.keys(config.define ?? {})) {
      if (name.startsWith("import.meta.env.VITE_")) delete config.define[name];
    }
  } }],
});
await frontend.listen();
const address = frontend.httpServer?.address();
if (!address || typeof address === "string") throw new Error("Frontend did not bind a local port.");
const url = `http://127.0.0.1:${address.port}`;
process.env.MATTERHORN_APP_URL = url;
setConsoleEmailPreviewSink(preview => writeFileSync(join(root, "private-email-preview.json"), JSON.stringify(preview), { mode: 0o600 }));
let backend;
try {
  backend = await startEmbeddedServer({
    host: "127.0.0.1", port: backendPort, workspaces: [join(root, "workspace")],
    configPath: join(root, "server.json"), token: randomBytes(32).toString("hex"), hostToken: randomBytes(32).toString("hex"),
    approvalMode: "manual", corsOrigins: [url], logRequests: false, manageOpencode: true,
    opencodeBin: process.env.MATTERHORN_QA_BINARY, opencodeCwd: join(root, "workspace"),
  });
} catch (error) { await frontend.close(); throw error; }
const policy = resolveProviderPrivacyPolicy("cudos", "ASI:Cloud");
writeFileSync(join(root, "runtime.json"), JSON.stringify({
  ready: true, url, backendUrl: backend.url, root, pid: process.pid,
  mode: process.env.MATTERHORN_QA_WIRING_ONLY === "1" ? "provider-free wiring only" : "configured provider; no inference sent yet",
  guardedRuntime: "enforce", accountGateway: true, hostApproval: "manual", providerPolicyMode: "verified-only",
  providerPolicyAllowed: policy.allowed, providerPolicyStatus: policy.status,
  email: "Local console fixture; public signup and verification routes required. Not real inbox delivery.",
  privateEmailPreview: join(root, "private-email-preview.json"),
  usageLimitTokens: 100000, inferenceRequestsSentByLauncher: 0,
}, null, 2), { mode: 0o600 });
let closing = false;
async function close() { if (closing) return; closing = true; await frontend.close(); await backend.stop(); process.exit(0); }
process.once("SIGINT", close);
process.once("SIGTERM", close);

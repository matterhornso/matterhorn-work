import os from "node:os";
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const portValue = Number.parseInt(process.env.PORT ?? "", 10);
const devPort = Number.isFinite(portValue) && portValue > 0 ? portValue : 5173;
const devApiTarget =
  process.env.VITE_MATTERHORN_DEV_API_TARGET?.trim() ||
  "http://127.0.0.1:3222";
const sameOriginMatterhornProxy = {
  target: devApiTarget,
  changeOrigin: true,
  ws: true,
};
const sameOriginWorkspaceProxy = {
  ...sameOriginMatterhornProxy,
  bypass: (req: IncomingMessage) => {
    const isDocumentRequest =
      req.method === "HEAD" ||
      (req.method === "GET" && req.headers.accept?.includes("text/html"));

    return isDocumentRequest ? (req.url ?? "/") : undefined;
  },
};
const sameOriginProxy = {
  "/api": sameOriginMatterhornProxy,
  "/workspaces": sameOriginMatterhornProxy,
  "/workspace": sameOriginWorkspaceProxy,
  "/opencode": sameOriginMatterhornProxy,
};
const allowedHosts = new Set<string>();
const envAllowedHosts = process.env.VITE_ALLOWED_HOSTS ?? "";

const addHost = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return;
  allowedHosts.add(trimmed);
};

envAllowedHosts.split(",").forEach(addHost);
addHost(process.env.OPENWORK_PUBLIC_HOST ?? null);
const hostname = os.hostname();
addHost(hostname);
const shortHostname = hostname.split(".")[0];
if (shortHostname && shortHostname !== hostname) {
  addHost(shortHostname);
}
const appRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const appPackagePath = resolve(appRoot, "package.json");
const desktopPackagePath = resolve(appRoot, "..", "desktop", "package.json");
const publicAuthCriticalCss = readFileSync(
  resolve(appRoot, "src/react-app/domains/cloud/public-web-signin.css"),
  "utf8",
);
const publicBetaWebBuild =
  process.env.VITE_MATTERHORN_DEPLOYMENT?.trim().toLowerCase() === "web"
  && /^(1|true|yes|on)$/i.test(process.env.VITE_MATTERHORN_PUBLIC_BETA?.trim() ?? "");

const publicAuthStaticShell = `<main class="public-auth-shell" data-matterhorn-static-auth>
  <div class="public-auth-layout">
    <section class="public-auth-primary" aria-labelledby="public-auth-title">
      <div class="public-auth-brand"><img src="/matterhorn-logo-square.svg" alt="" aria-hidden="true" /><span>Matterhorn Desks</span></div>
      <p class="public-auth-kicker">Public beta</p>
      <h1 id="public-auth-title" class="public-auth-title">Serious work deserves more than a chat.</h1>
      <p class="public-auth-description">Open a private workspace for focused AI desks, tools, and durable project evidence.</p>
      <p class="public-auth-status" role="status" aria-live="polite">Opening secure account access…</p>
      <div aria-hidden="true" style="min-height: 300px"></div>
    </section>
    <aside class="public-auth-context" aria-labelledby="public-auth-context-title">
      <h2 id="public-auth-context-title">Choose a desk. Ask for the outcome.</h2>
      <p class="public-auth-context-lead">Each desk gives your conversation the right working context, tools, and outputs from the first message.</p>
    </aside>
  </div>
</main>`;

function readPackageVersion(packagePath: string): string | null {
  if (!existsSync(packagePath)) return null;

  const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string };
  return parsed.version?.trim() || null;
}

const buildAppVersion =
  process.env.VITE_OPENWORK_APP_VERSION?.trim() ||
  readPackageVersion(desktopPackagePath) ||
  readPackageVersion(appPackagePath) ||
  "0.0.0";
const webBuildCommit =
  process.env.VITE_MATTERHORN_BUILD_COMMIT?.trim().toLowerCase() || "";
const fullCommitPattern = /^[a-f0-9]{40}$/;

// Load the Tauri → Electron migration-release fragment if present. Written
// by scripts/migration/01-cut-migration-release.mjs for the specific
// release commit; absent otherwise so every other build has the migration
// prompt dormant. Pre-parsed here so Vite's define/import.meta.env picks
// up the keys without a custom plugin.
function loadMigrationReleaseEnv(): Record<string, string> {
  const fragmentPath = resolve(appRoot, ".env.migration-release");
  if (!existsSync(fragmentPath)) return {};
  const out: Record<string, string> = {};
  const raw = readFileSync(fragmentPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.search("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key.startsWith("VITE_")) continue;
    out[key] = trimmed.slice(eq + 1).trim();
  }
  return out;
}
const migrationReleaseEnv = loadMigrationReleaseEnv();

// Electron packaged builds load index.html via `file://`, so asset URLs
// must be relative. Tauri serves via its own protocol so absolute paths
// work there. Gate on an env var the electron build script sets.
const isElectronPackagedBuild = process.env.OPENWORK_ELECTRON_BUILD === "1";

export default defineConfig({
  base: isElectronPackagedBuild ? "./" : "/",
  esbuild: {
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  define: {
    ...Object.fromEntries(
      Object.entries(migrationReleaseEnv).map(([k, v]) => [
        `import.meta.env.${k}`,
        JSON.stringify(v),
      ]),
    ),
    "import.meta.env.VITE_OPENWORK_APP_VERSION": JSON.stringify(buildAppVersion),
  },
  plugins: [
    {
      name: "matterhorn-public-auth-critical-render",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          const withStyles = html.replace(
            "</head>",
            `<style data-matterhorn-public-auth-critical>${publicAuthCriticalCss}</style>\n  </head>`,
          );
          return publicBetaWebBuild
            ? withStyles.replace('<div id="root"></div>', `<div id="root">${publicAuthStaticShell}</div>`)
            : withStyles;
        },
      },
    },
    {
      name: "matterhorn-web-build-attestation",
      transformIndexHtml() {
        if (!fullCommitPattern.test(webBuildCommit)) return [];
        return [{
          tag: "meta",
          attrs: {
            name: "matterhorn-build-commit",
            content: webBuildCommit,
          },
          injectTo: "head",
        }];
      },
    },
    {
      name: "openwork-dev-server-id",
      configureServer(server) {
        server.middlewares.use("/__openwork_dev_server_id", (_req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ appRoot }));
        });
      },
    },
    tailwindcss(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { compilationMode: "annotation" }]],
      },
    }),
  ],
  server: {
    port: devPort,
    strictPort: true,
    ...(allowedHosts.size > 0 ? { allowedHosts: Array.from(allowedHosts) } : {}),
    proxy: sameOriginProxy,
  },
  preview: {
    proxy: sameOriginProxy,
  },
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        app: resolve(appRoot, "index.html"),
        overlay: resolve(appRoot, "overlay.html"),
      },
      output: {
        manualChunks(id: string): string | undefined {
          // Keep Vite's dynamic-import preloader in a neutral core chunk.
          // If Rollup places it inside a route-deferred vendor chunk, every
          // dynamic import makes that otherwise-lazy chunk an eager dependency.
          if (id.includes("vite/preload-helper")) {
            return "vendor-loader";
          }
          // React is needed by every entry, including the signed-out public
          // gate. Keep the router separate so authentication does not download
          // workspace navigation before a session is verified.
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/")
          ) {
            return "vendor-react";
          }
          if (id.includes("node_modules/react-router-dom")) {
            return "vendor-router";
          }
          // Syntax highlighting (heavy WASM)
          if (
            id.includes("node_modules/shiki") ||
            id.includes("node_modules/\u0004shiki") ||
            id.includes("node_modules/@shikijs")
          ) {
            return "vendor-shiki";
          }
          // Markdown
          if (
            id.includes("node_modules/marked") ||
            id.includes("node_modules/marked-")
          ) {
            return "vendor-markdown";
          }
          // React Query is part of the core application runtime. Keep it out
          // of the route-deferred wallet chunk so public authentication does
          // not download the Web3 stack simply to initialize the query cache.
          if (id.includes("node_modules/@tanstack/react-query")) {
            return "vendor-query";
          }
          // Wallet + Web3 stacks are split by chain family. A single wallet
          // vendor chunk made every wallet-capable route download runtimes for
          // chains it never opened and exceeded the route budget by itself.
          if (
            id.includes("node_modules/wagmi") ||
            id.includes("node_modules/viem") ||
            id.includes("node_modules/@walletconnect") ||
            id.includes("node_modules/@coinbase")
          ) {
            return "vendor-wallet-evm";
          }
          if (
            id.includes("node_modules/@mysten") ||
            id.includes("node_modules/@wallet-standard")
          ) {
            return "vendor-wallet-sui";
          }
          if (id.includes("node_modules/@polkadot/extension-")) {
            return "vendor-wallet-bittensor-extension";
          }
          if (id.includes("node_modules/@polkadot")) {
            return "vendor-wallet-bittensor";
          }
          // Editor / lexical (heavy, only needed for composer)
          if (id.includes("node_modules/@lexical")) {
            return "vendor-editor";
          }
          return undefined;
        },
      },
    },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": resolve(appRoot, "src"),
    },
  },
});

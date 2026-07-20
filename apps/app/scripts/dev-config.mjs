import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteConfigPath = path.join(appRoot, "vite.config.ts");
const source = await readFile(viteConfigPath, "utf8");

assert.match(
  source,
  /esbuild:\s*\{\s*target:\s*["']esnext["']/m,
  "apps/app/vite.config.ts must keep esbuild.target at esnext so dev startup can prebundle modern dependencies like @ai-sdk/gateway.",
);

assert.match(
  source,
  /optimizeDeps:\s*\{[\s\S]*?esbuildOptions:\s*\{[\s\S]*?target:\s*["']esnext["']/m,
  "apps/app/vite.config.ts must keep optimizeDeps.esbuildOptions.target at esnext for Vite dev dependency optimization.",
);

assert.match(
  source,
  /build:\s*\{[\s\S]*?target:\s*["']esnext["']/m,
  "apps/app/vite.config.ts must keep build.target at esnext for app/electron parity.",
);

assert.doesNotMatch(
  source,
  /chrome87|edge88|firefox78|safari14/,
  "apps/app/vite.config.ts must not reintroduce the old browser target list that breaks destructuring transforms in Vite dev.",
);

console.log("Matterhorn Desks UI dev Vite target regression check passed.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteConfigPath = path.join(appRoot, "vite.config.ts");
const source = await readFile(viteConfigPath, "utf8");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\function hasBlockTarget(blockName, target) {
  const expression = new RegExp(String.raw`${blockName}:\\s*\\{[\\s\\S]*?target:\\s*["']${target}["']`, "m");
  return expression.test(source);
}
");
}

function hasBlockTarget(blockName, target) {
  const expression = new RegExp(`${escapeRegex(blockName)}:\\s*\\{\\s*target:\\s*["']${escapeRegex(target)}["']`, "m");
  return expression.test(source);
}

assert.equal(
  hasBlockTarget("esbuild", "esnext"),
  true,
  "apps/app/vite.config.ts must keep esbuild.target at esnext so dev startup can prebundle modern dependencies like @ai-sdk/gateway.",
);

assert.equal(
  /optimizeDeps:\s*\{[\s\S]*?esbuildOptions:\s*\{[\s\S]*?target:\s*["']esnext["']/m.test(source),
  true,
  "apps/app/vite.config.ts must keep optimizeDeps.esbuildOptions.target at esnext for Vite dev dependency optimization.",
);

assert.equal(
  hasBlockTarget("build", "esnext"),
  true,
  "apps/app/vite.config.ts must keep build.target at esnext for app/electron parity.",
);

assert.equal(
  /chrome87|edge88|firefox78|safari14/.test(source),
  false,
  "apps/app/vite.config.ts must not reintroduce the old browser target list that breaks destructuring transforms in Vite dev.",
);

console.log("Matterhorn Work UI dev Vite target regression check passed.");

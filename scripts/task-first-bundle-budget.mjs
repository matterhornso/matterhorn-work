#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TASK_FIRST_BUNDLE_BUDGETS = Object.freeze({
  publicEntryGraphBytes: 650_000,
  publicEntryChunkBytes: 300_000,
  routeEntryBytes: 600_000,
  walletFamilyBytes: 900_000,
});

const FORBIDDEN_PUBLIC_ENTRY_CHUNKS = [
  "authenticated-app",
  "session-route",
  "settings-route",
  "vendor-wallet",
  "vendor-shiki",
  "experimental-translations",
  "artifact-text-editor",
  "xlsx",
];

const FORBIDDEN_AUTHENTICATED_SHELL_IMPORTS = ["session-route", "settings-route"];
const FORBIDDEN_WORKSPACE_IMPORTS = [
  "vendor-wallet",
  "vendor-shiki",
  "artifact-text-editor",
  "xlsx",
  "experimental-translations",
];

function assetReferencesFromHtml(html) {
  return [...html.matchAll(/(?:src|href)=["']\/([^"'?#]+\.(?:js|css))["']/g)]
    .map((match) => match[1]);
}

function staticChunkImports(source) {
  const imports = new Set();
  for (const match of source.matchAll(/\bimport(?!\s*\()[^;"']*?(?:from\s*)?["']\.\/([^"']+\.js)["']/g)) {
    imports.add(match[1]);
  }
  return [...imports];
}

function findChunk(assetNames, prefix) {
  const matches = assetNames.filter((name) => name.startsWith(`${prefix}-`) && name.endsWith(".js"));
  return matches.length === 1 ? matches[0] : null;
}

function staticChunkGraph(assetsDir, entryChunks) {
  const visited = new Set();
  const pending = [...entryChunks];
  while (pending.length > 0) {
    const chunk = pending.pop();
    if (!chunk || visited.has(chunk)) continue;
    visited.add(chunk);
    const chunkPath = resolve(assetsDir, chunk);
    if (!existsSync(chunkPath)) continue;
    for (const imported of staticChunkImports(readFileSync(chunkPath, "utf8"))) {
      if (!visited.has(imported)) pending.push(imported);
    }
  }
  return [...visited];
}

function includesChunkPrefix(value, prefixes) {
  return prefixes.find((prefix) => value.includes(prefix)) ?? null;
}

export function auditTaskFirstBundle(distDirectory) {
  const distDir = resolve(distDirectory);
  const indexPath = resolve(distDir, "index.html");
  const assetsDir = resolve(distDir, "assets");
  const failures = [];

  if (!existsSync(indexPath) || !existsSync(assetsDir)) {
    return {
      ok: false,
      failures: [`Expected a production build at ${distDir}. Run the public-Beta web build first.`],
      metrics: null,
    };
  }

  const assetNames = readdirSync(assetsDir);
  const html = readFileSync(indexPath, "utf8");
  const publicAssets = assetReferencesFromHtml(html);
  const publicJs = publicAssets.filter((name) => name.endsWith(".js"));
  const publicJsRows = publicJs.map((name) => ({
    name,
    bytes: statSync(resolve(distDir, name)).size,
  }));
  const publicEntryGraphBytes = publicJsRows.reduce((total, item) => total + item.bytes, 0);

  if (publicEntryGraphBytes > TASK_FIRST_BUNDLE_BUDGETS.publicEntryGraphBytes) {
    failures.push(
      `Signed-out JavaScript graph is ${publicEntryGraphBytes} B; budget is ${TASK_FIRST_BUNDLE_BUDGETS.publicEntryGraphBytes} B.`,
    );
  }
  for (const item of publicJsRows) {
    if (item.bytes > TASK_FIRST_BUNDLE_BUDGETS.publicEntryChunkBytes) {
      failures.push(
        `Signed-out entry chunk ${item.name} is ${item.bytes} B; budget is ${TASK_FIRST_BUNDLE_BUDGETS.publicEntryChunkBytes} B.`,
      );
    }
    const forbidden = includesChunkPrefix(item.name, FORBIDDEN_PUBLIC_ENTRY_CHUNKS);
    if (forbidden) failures.push(`Signed-out entry eagerly requests forbidden ${forbidden} code via ${item.name}.`);
  }

  const routeMetrics = {};
  for (const prefix of ["session-route", "settings-route"]) {
    const chunk = findChunk(assetNames, prefix);
    if (!chunk) {
      failures.push(`Expected exactly one ${prefix} production chunk.`);
      continue;
    }
    const bytes = statSync(resolve(assetsDir, chunk)).size;
    routeMetrics[prefix] = { name: chunk, bytes };
    if (bytes > TASK_FIRST_BUNDLE_BUDGETS.routeEntryBytes) {
      failures.push(`${chunk} is ${bytes} B; route-entry budget is ${TASK_FIRST_BUNDLE_BUDGETS.routeEntryBytes} B.`);
    }
  }

  const authenticatedApp = findChunk(assetNames, "authenticated-app");
  if (!authenticatedApp) {
    failures.push("Expected exactly one authenticated-app production chunk.");
  } else {
    const graph = staticChunkGraph(assetsDir, [authenticatedApp]);
    for (const imported of graph) {
      const forbidden = includesChunkPrefix(imported, FORBIDDEN_AUTHENTICATED_SHELL_IMPORTS);
      if (forbidden) failures.push(`Authenticated shell statically imports ${forbidden} via ${imported}.`);
    }
  }

  const workspaceImports = {};
  for (const prefix of ["session-route", "settings-route"]) {
    const chunk = routeMetrics[prefix]?.name;
    if (!chunk) continue;
    const graph = staticChunkGraph(assetsDir, [chunk]);
    workspaceImports[prefix] = graph;
    for (const imported of graph) {
      const forbidden = includesChunkPrefix(imported, FORBIDDEN_WORKSPACE_IMPORTS);
      if (forbidden) failures.push(`${chunk} statically imports deferred ${forbidden} code via ${imported}.`);
    }
  }

  const walletChunks = assetNames
    .filter((name) => name.startsWith("vendor-wallet-") && name.endsWith(".js"))
    .map((name) => ({ name, bytes: statSync(resolve(assetsDir, name)).size }));
  if (walletChunks.length === 0) {
    failures.push("Expected wallet-family chunks in the production build.");
  }
  for (const item of walletChunks) {
    if (item.bytes > TASK_FIRST_BUNDLE_BUDGETS.walletFamilyBytes) {
      failures.push(`${item.name} is ${item.bytes} B; wallet-family budget is ${TASK_FIRST_BUNDLE_BUDGETS.walletFamilyBytes} B.`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    metrics: {
      publicEntryGraphBytes,
      publicEntryChunks: publicJsRows,
      routes: routeMetrics,
      walletChunks,
      workspaceStaticImports: workspaceImports,
    },
  };
}

function parseArguments(argv) {
  const args = { dist: "apps/app/dist", json: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dist") args.dist = argv[++index];
    else if (argv[index] === "--json") args.json = true;
  }
  return args;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const args = parseArguments(process.argv.slice(2));
  const result = auditTaskFirstBundle(args.dist);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log("Matterhorn task-first bundle budgets: PASS");
    console.log(JSON.stringify(result.metrics, null, 2));
  } else {
    console.error("Matterhorn task-first bundle budgets: FAIL");
    for (const failure of result.failures) console.error(`- ${failure}`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

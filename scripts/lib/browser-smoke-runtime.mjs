import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export function defaultBrowserSmokeRuntimeFile(repoRoot) {
  return resolve(
    process.env.MATTERHORN_MEDIA_SMOKE_RUNTIME_FILE
      || resolve(repoRoot, ".matterhorn-work", "runtime", "matterhorn-generated-media-smoke-runtime.json"),
  );
}

function isWorkspaceSessionUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    return /^\/workspace\/[^/]+\/session(?:\/[^/]+)?$/.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

export async function resolveBrowserSmokeTarget(config, options) {
  if (config.url) return;
  const runtimeFile = options.runtimeFile ?? defaultBrowserSmokeRuntimeFile(options.repoRoot);
  let runtime;
  try {
    runtime = JSON.parse(await readFile(runtimeFile, "utf8"));
  } catch {
    throw new Error(
      `No ${options.label} URL was provided and no live fixture manifest exists at ${runtimeFile}. Start pnpm dev:generated-media-smoke, or pass --url explicitly.`,
    );
  }

  const runtimePid = Number(runtime?.pid);
  let runtimeIsAlive = Number.isInteger(runtimePid) && runtimePid > 0;
  if (runtimeIsAlive) {
    try {
      process.kill(runtimePid, 0);
    } catch {
      runtimeIsAlive = false;
    }
  }
  if (!runtimeIsAlive) {
    throw new Error(`The fixture manifest at ${runtimeFile} is stale. Restart pnpm dev:generated-media-smoke.`);
  }

  const sessionUrl = typeof runtime?.sessionUrl === "string" ? runtime.sessionUrl.trim() : "";
  if (!isWorkspaceSessionUrl(sessionUrl)) {
    throw new Error(
      `The fixture manifest at ${runtimeFile} does not contain a valid workspace session URL. Restart pnpm dev:generated-media-smoke.`,
    );
  }
  config.url = sessionUrl;

  if ("serverUrl" in config && !config.serverUrl && typeof runtime?.serverUrl === "string") {
    config.serverUrl = runtime.serverUrl.trim().replace(/\/$/, "");
  }
}

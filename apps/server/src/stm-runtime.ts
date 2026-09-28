import { dirname, join } from "node:path";
import { StmCredentials, StmMcpLaunches } from "@matterhorn-work/stm-credentials";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveDefaultEnvStorePath } from "./env-file.js";

export const STM_RELEASE_FLAG = "MATTERHORN_WORK_STM_ENABLED";
export const STM_VOICE_CONSUMER = "voice:realtime";

export function createLocalStmMcpLaunches(credentials: StmCredentials) {
  return new StmMcpLaunches({ credentials, registryPath: join(dirname(resolveDefaultEnvStorePath()), "stm-mcp-launches.json") });
}

export function localStmMcpLauncher(): string[] | null {
  // Electron cannot assume system Node/Bun. A separately staged executable must
  // be provided by its trusted runtime owner before packaged support is enabled.
  if (process.versions.electron) return null;
  const sibling = join(dirname(process.execPath), "matterhorn-stm-mcp");
  if (process.versions.bun && existsSync(sibling)) return [sibling];
  const extension = process.versions.bun ? "ts" : "js";
  const entry = fileURLToPath(new URL(`./stm-mcp-entry.${extension}`, import.meta.url));
  if (entry.includes("/$bunfs/") || entry.includes("/~BUN/")) return null;
  return existsSync(entry) ? [process.execPath, entry] : null;
}

/** Used by the same startServer entry point in Electron, CLI and orchestrator.
 * There is no discovery/launch/network access in this factory. Keep the adapter
 * present when disabled so existing references cannot fall back to plaintext.
 * Hosted/network listeners cannot resolve personal local secrets even if a
 * deployment accidentally carries the flag. Control routes still require the
 * host token; bound voice calls additionally require it before resolution.
 */
export function createLocalStmCredentials(input: {
  host: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  envStorePath?: string;
}) {
  const env = input.env ?? process.env;
  return new StmCredentials({
    enabled: env[STM_RELEASE_FLAG] === "1",
    localDesktop: ["127.0.0.1", "::1", "localhost"].includes(input.host),
    platform: input.platform ?? process.platform,
    registryPath: join(dirname(input.envStorePath ?? resolveDefaultEnvStorePath()), "stm-bindings.json"),
  });
}

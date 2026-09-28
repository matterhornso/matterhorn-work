import { dirname, join } from "node:path";
import { StmCredentials } from "@matterhorn-work/stm-credentials";
import { resolveDefaultEnvStorePath } from "./env-file.js";

export const STM_RELEASE_FLAG = "MATTERHORN_WORK_STM_ENABLED";
export const STM_VOICE_CONSUMER = "voice:realtime";

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

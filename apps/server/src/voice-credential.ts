import type { StmCredentials } from "@matterhorn-work/stm-credentials";

type NamedEnvironment = { get(key: string): Promise<string | undefined> };

/** Preserve stored realtime > stored general > inherited override precedence.
 * A linked name is authoritative: locked/missing/denied STM never falls back.
 * No OpenCode provider-auth storage is accessed or migrated by this helper.
 */
export async function resolveVoiceCredential(
  env: NamedEnvironment,
  stm?: Pick<StmCredentials, "resolveKeyForConsumer">,
  inherited: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  for (const name of ["OPENAI_REALTIME_API_KEY", "OPENAI_API_KEY"]) {
    const legacy = await env.get(name);
    const conflicts = { ...inherited, ...(legacy === undefined ? {} : { [name]: legacy }) };
    const linked = await stm?.resolveKeyForConsumer("voice:realtime", name, conflicts);
    if (linked !== undefined) return linked;
    if (legacy?.trim()) return legacy.trim();
  }
  return inherited.OPENWORK_OPENAI_REALTIME_API_KEY?.trim()
    || inherited.OPENAI_REALTIME_API_KEY?.trim()
    || inherited.OPENAI_API_KEY?.trim()
    || "";
}

import { expect, test } from "bun:test";
import { StmError } from "@matterhorn-work/stm-credentials";
import { resolveVoiceCredential } from "./voice-credential.js";

function legacy(values: Record<string, string>) {
  const reads: string[] = [];
  return { reads, get: async (name: string) => { reads.push(name); return values[name]; } };
}

test("legacy voice key precedence is unchanged and reads only needed names", async () => {
  const env = legacy({ OPENAI_REALTIME_API_KEY: " realtime-fixture ", OPENAI_API_KEY: "general-fixture" });
  expect(await resolveVoiceCredential(env, undefined, { OPENWORK_OPENAI_REALTIME_API_KEY: "override-fixture" })).toBe("realtime-fixture");
  expect(env.reads).toEqual(["OPENAI_REALTIME_API_KEY"]);
  expect(await resolveVoiceCredential(legacy({ OPENAI_API_KEY: "stored-general" }), undefined, { OPENWORK_OPENAI_REALTIME_API_KEY: "override" })).toBe("stored-general");
  expect(await resolveVoiceCredential(legacy({}), undefined, { OPENWORK_OPENAI_REALTIME_API_KEY: "override", OPENAI_REALTIME_API_KEY: "realtime" })).toBe("override");
  expect(await resolveVoiceCredential(legacy({}), undefined, { OPENAI_REALTIME_API_KEY: "realtime", OPENAI_API_KEY: "general" })).toBe("realtime");
  expect(await resolveVoiceCredential(legacy({}), undefined, { OPENAI_API_KEY: "general" })).toBe("general");
  expect(await resolveVoiceCredential(legacy({}), undefined, {})).toBe("");
});

test("linked realtime key resolves alone, not every key bound to voice", async () => {
  const calls: string[] = [];
  const stm = { resolveKeyForConsumer: async (consumer: string, name: string) => {
    expect(consumer).toBe("voice:realtime"); calls.push(name); return "linked-realtime";
  } };
  expect(await resolveVoiceCredential(legacy({}), stm, {})).toBe("linked-realtime");
  expect(calls).toEqual(["OPENAI_REALTIME_API_KEY"]);
});

test("only absent binding permits legacy fallback; unavailable/denied bindings fail closed", async () => {
  for (const code of ["disabled", "connection_failed", "key_unavailable", "consumer_not_authorized"]) {
    const stm = { resolveKeyForConsumer: async () => { throw new StmError(code); } };
    await expect(resolveVoiceCredential(legacy({ OPENAI_API_KEY: "must-not-fallback" }), stm, { OPENAI_API_KEY: "also-forbidden" })).rejects.toThrow(code);
  }
  const stm = { resolveKeyForConsumer: async () => undefined };
  expect(await resolveVoiceCredential(legacy({ OPENAI_API_KEY: "unmigrated" }), stm, {})).toBe("unmigrated");
});

test("plaintext conflict candidates are passed to the privileged adapter", async () => {
  const stm = { resolveKeyForConsumer: async (_consumer: string, name: string, inherited?: NodeJS.ProcessEnv) => {
    expect(name).toBe("OPENAI_REALTIME_API_KEY");
    expect(inherited?.OPENAI_REALTIME_API_KEY).toBe("stored-conflict");
    expect(inherited?.OTHER_KEY).toBe("unrelated");
    throw new StmError("plaintext_conflict");
  } };
  await expect(resolveVoiceCredential(legacy({ OPENAI_REALTIME_API_KEY: "stored-conflict" }), stm, { OTHER_KEY: "unrelated" })).rejects.toThrow("plaintext_conflict");
});

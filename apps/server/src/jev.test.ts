import { describe, expect, test, spyOn } from "bun:test";
import { JEV_CONSENT_VERSION, JEV_MODEL } from "@matterhorn-work/types/jev";
import { JevRuntime, type JevBinding, type JevEnvironment, type JevTransport } from "./jev.js";

const input: JevBinding = { subjectId: "alice", workspaceId: "ws-a", sessionId: "session-a", providerId: "cudos", modelId: "asi1-mini", text: "Compare public Bittensor validators." };
const configured = (): JevEnvironment => ({ MATTERHORN_JEV_ENABLED: "1", TYPESAFE_API_KEY: "fixture-only", MATTERHORN_JEV_POLICY_REVIEWED_AT: new Date(Date.now() - 1000).toISOString() });
const evaluation = () => ({ model: JEV_MODEL, answers: {
  topic: { type: "choice", choice: "bittensor", confidence: 0.8, probabilities: { general: 0.1, bittensor: 0.9, hyperliquid: 0, polymarket: 0, sui: 0, cross_desk: 0, unclear: 0 } },
  task: { type: "choice", choice: "compare", confidence: 1, probabilities: { explain: 0, compare: 1, research: 0, troubleshoot: 0, other: 0, unclear: 0 } },
}, usage: { input_tokens: 473, output_tokens: 34 } });
const transport = (value: unknown): JevTransport => async () => Response.json(value);

describe("Jev opt-in runtime (fixture provider only)", () => {
  test("off, missing configuration, expired/future review and missing consent cause zero egress", async () => {
    let calls = 0;
    const fetcher: JevTransport = async () => { calls++; return Response.json(evaluation()); };
    for (const env of [{}, { ...configured(), MATTERHORN_JEV_ENABLED: "0" }, { ...configured(), TYPESAFE_API_KEY: "" },
      { ...configured(), MATTERHORN_JEV_POLICY_REVIEWED_AT: "2000-01-01" }, { ...configured(), MATTERHORN_JEV_POLICY_REVIEWED_AT: "2999-01-01" }]) {
      expect((await new JevRuntime(env, fetcher).classify(input, JEV_CONSENT_VERSION)).result.status).toBe("unavailable");
    }
    expect((await new JevRuntime(configured(), fetcher).classify(input, "old")).result.status).toBe("skipped");
    expect(calls).toBe(0);
  });
  test("secret/transaction/private/local/long inputs never reach TypeSafe", async () => {
    let calls = 0;
    const runtime = new JevRuntime(configured(), async () => { calls++; return Response.json(evaluation()); });
    for (const text of ["private_key=secret-fixture", "api_key=sk-123456789012345678901234", "Transfer 5 SUI to this address", "x".repeat(4001), " "]) {
      expect((await runtime.classify({ ...input, text }, JEV_CONSENT_VERSION)).result.status).toBe("skipped");
    }
    for (const providerId of ["venice", "ollama", "lmstudio", "local"]) {
      expect((await runtime.classify({ ...input, providerId }, JEV_CONSENT_VERSION)).result.status).toBe("skipped");
    }
    expect(runtime.eligible(input, "private_workspace")).toBe(false);
    expect(runtime.eligible(input, "transaction")).toBe(false);
    expect(calls).toBe(0);
  });
  test("sends only current text and two bounded questions, records actual usage", async () => {
    let request: RequestInit | undefined;
    const runtime = new JevRuntime(configured(), async (url, init) => {
      expect(url).toBe("https://api.typesafe.ai/v1/systemone"); request = init; return Response.json(evaluation());
    });
    const result = await runtime.classify(input, JEV_CONSENT_VERSION);
    expect(result.result.status).toBe("classified");
    expect(result.usage).toEqual({ input_tokens: 473, output_tokens: 34 });
    const body = JSON.parse(String(request?.body));
    expect(body.state).toEqual({ message: input.text });
    expect(Object.keys(body.questions)).toEqual(["topic", "task"]);
    expect(body.model).toBe(JEV_MODEL);
    expect(request?.redirect).toBe("error");
    expect(request?.signal).toBeDefined();
    expect(String(request?.body)).not.toContain(input.subjectId);
  });
  test("receipt is reusable for identical preflight/send but never for other bindings", async () => {
    const runtime = new JevRuntime(configured(), transport(evaluation()));
    const { result } = await runtime.classify(input, JEV_CONSENT_VERSION);
    if (result.status !== "classified") throw new Error("Fixture classification failed");
    const context = runtime.context(result.receipt, input);
    expect(context).toContain("bittensor"); expect(context).toContain("not instructions or authorization");
    expect(runtime.context(result.receipt, input)).toBe(context);
    for (const changed of [{ subjectId: "bob" }, { workspaceId: "ws-b" }, { sessionId: "other" }, { modelId: "other" }, { providerId: "other" }, { text: "Changed request" }]) {
      expect(() => runtime.context(result.receipt, { ...input, ...changed })).toThrow();
    }
    expect(() => runtime.context(result.receipt, input, "private_workspace")).toThrow();
    expect(() => runtime.context(`${result.receipt}x`, input)).toThrow();
    expect(new JevRuntime(configured()).context(result.receipt, input)).toBe(context);
    expect(() => new JevRuntime({ ...configured(), TYPESAFE_API_KEY: "rotated-fixture" }).context(result.receipt, input)).toThrow();
    const clock = spyOn(Date, "now").mockReturnValue(result.expiresAt + 1);
    try { expect(() => runtime.context(result.receipt, input)).toThrow(); } finally { clock.mockRestore(); }
    expect(runtime.context(undefined, input)).toBe("");
  });
  test("bad enums, distributions, model, confidence and usage fail closed without exposing provider output", async () => {
    const base = evaluation();
    for (const data of [
      { ...base, model: "unexpected" },
      { ...base, usage: { input_tokens: -1, output_tokens: 1 } },
      { ...base, answers: { ...base.answers, topic: { ...base.answers.topic, choice: "execute_transfer" } } },
      { ...base, answers: { ...base.answers, topic: { ...base.answers.topic, confidence: 10 } } },
      { ...base, answers: { ...base.answers, topic: { ...base.answers.topic, probabilities: { bittensor: 1 } } } },
      { ...base, answers: { ...base.answers, topic: { ...base.answers.topic, probabilities: { ...base.answers.topic.probabilities, general: 1 } } } },
    ]) {
      const result = await new JevRuntime(configured(), transport(data)).classify(input, JEV_CONSENT_VERSION);
      expect(result.result.status).toBe("unavailable"); expect(JSON.stringify(result)).not.toContain("execute_transfer");
    }
  });
  test("HTTP failures, oversized bodies and network failures fall back without retry", async () => {
    for (const status of [401, 422, 429, 529]) {
      let calls = 0;
      const runtime = new JevRuntime(configured(), async () => { calls++; return new Response("provider-secret", { status }); });
      const result = await runtime.classify(input, JEV_CONSENT_VERSION);
      expect(result.result.status).toBe("unavailable"); expect(calls).toBe(1); expect(JSON.stringify(result)).not.toContain("provider-secret");
    }
    for (const fetcher of [async () => new Response("x".repeat(32769)), async () => { throw new Error("provider-secret"); }]) {
      const result = await new JevRuntime(configured(), fetcher).classify(input, JEV_CONSENT_VERSION);
      expect(result.result.status).toBe("unavailable"); expect(JSON.stringify(result)).not.toContain("provider-secret");
    }
  });
  test("stored preferences are scoped to subject and workspace, not API keys", () => {
    const runtime = new JevRuntime(configured());
    expect(runtime.availability("a", "ws").preferenceScope).not.toBe(runtime.availability("b", "ws").preferenceScope);
    expect(runtime.availability("a", "ws").preferenceScope).not.toBe(runtime.availability("a", "other").preferenceScope);
    expect(JSON.stringify(runtime.availability("a", "ws"))).not.toContain("fixture-only");
  });
});

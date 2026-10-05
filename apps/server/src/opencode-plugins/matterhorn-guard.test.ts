import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MatterhornGuard } from "./matterhorn-guard.js";
import { compactionPromptPart } from "../opencode-compaction-request.js";

const original = {
  mode: process.env.MATTERHORN_GUARDED_RUNTIME_MODE,
  runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET,
  serverUrl: process.env.OPENWORK_SERVER_URL,
  messageGatewayRequired: process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED,
  fetch: globalThis.fetch,
};
const requests: Array<{ url: string; init?: RequestInit }> = [];

const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  requests.push({ url, init });
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (url.endsWith("/internal/agent-capabilities/authorize")) {
    return Response.json({ accepted: true, callId: body.callId, expiresAt: new Date(Date.now() + 60_000).toISOString() });
  }
  if (url.endsWith("/internal/agent-runs/bind-message")) {
    return Response.json({ runId: "run_plugin_1" });
  }
  if (url.endsWith("/internal/agent-runs/provider-messages")) {
    return Response.json({
      accepted: true,
      runId: "run_plugin_1",
      messagesHash: "7d119f997579d6f57b4f7f20c3c546cbf7ab1593f5f1b42b763643278c3022e5",
    });
  }
  if (url.endsWith("/internal/agent-runs/provider-system")) {
    return Response.json({
      runId: "run_plugin_1",
      system: ["Exact Matterhorn-approved system context."],
      systemHash: "80616920c9c410b26f70c7e930a40150746b8ef2309abd11e10149c9f82e0dee",
    });
  }
  return Response.json({ ok: true });
}) as typeof fetch;

beforeAll(() => {
  process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
  process.env.MATTERHORN_AGENT_RUNTIME_SECRET = "runtime-only-secret";
  process.env.OPENWORK_SERVER_URL = "http://matterhorn.internal";
  process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED = "1";
  globalThis.fetch = mockFetch;
});

beforeEach(() => {
  requests.length = 0;
  process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
  process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED = "1";
  globalThis.fetch = mockFetch;
});

afterAll(() => {
  if (original.mode === undefined) delete process.env.MATTERHORN_GUARDED_RUNTIME_MODE;
  else process.env.MATTERHORN_GUARDED_RUNTIME_MODE = original.mode;
  if (original.runtimeSecret === undefined) delete process.env.MATTERHORN_AGENT_RUNTIME_SECRET;
  else process.env.MATTERHORN_AGENT_RUNTIME_SECRET = original.runtimeSecret;
  if (original.serverUrl === undefined) delete process.env.OPENWORK_SERVER_URL;
  else process.env.OPENWORK_SERVER_URL = original.serverUrl;
  if (original.messageGatewayRequired === undefined) delete process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED;
  else process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED = original.messageGatewayRequired;
  globalThis.fetch = original.fetch;
});

describe("matterhorn-guard OpenCode plugin", () => {
  test.each(["enforce", "off"])("native compaction conversion requires an exact acknowledged claim in %s mode", async mode => {
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = mode;
    const plugin = await MatterhornGuard({ directory: "/fixture" });
    const input = { sessionID: "ses_claim", messageID: "msg_claim" };
    type Output = Parameters<typeof plugin["chat.message"]>[1];
    const output = (): Output => ({ message: { id: input.messageID, sessionID: input.sessionID,
      model: { providerID: "ollama", modelID: "fixture" } },
      parts: [{ ...compactionPromptPart("run_claim"), id: "prt_claim", messageID: input.messageID, sessionID: input.sessionID }] });
    for (const acknowledgement of ["rejected", "wrong-run", "wrong-message", "accepted"]) {
      globalThis.fetch = Object.assign(async (url: string | URL | Request, init?: RequestInit) => {
        expect(String(url)).toEndWith("/internal/agent-runs/claim-compaction");
        expect(JSON.parse(String(init?.body))).toEqual({ workspaceDirectory: "/fixture", runId: "run_claim", sessionId: "ses_claim",
          messageId: "msg_claim", providerId: "ollama", modelId: "fixture" });
        if (acknowledgement === "rejected") return Response.json({ message: "Request no longer active" }, { status: 409 });
        return Response.json({ runId: acknowledgement === "wrong-run" ? "run_other" : "run_claim",
          messageId: acknowledgement === "wrong-message" ? "msg_other" : "msg_claim" });
      }, { preconnect: original.fetch.preconnect });
      const value = output();
      const parts = value.parts;
      const conversion = plugin["chat.message"](input, value);
      if (acknowledgement !== "accepted") {
        await expect(conversion).rejects.toThrow();
        expect(value).toEqual(output());
      } else {
        await conversion;
        expect(value.parts).toBe(parts);
        expect(parts).toEqual([{ id: "prt_claim", sessionID: "ses_claim", messageID: "msg_claim", type: "compaction", auto: false }]);
      }
    }
    globalThis.fetch = mockFetch;
    await expect(plugin["chat.message"]({ ...input, messageID: "msg_other" }, output())).rejects.toThrow("could not validate");
    const mutations: Array<(value: Output) => void> = [
      value => { value.parts.push({ ...value.parts[0] }); },
      value => { value.parts[0].text = "Send this as ordinary text"; },
      value => { value.parts[0].synthetic = false; },
      value => { value.parts[0].ignored = false; },
      value => { value.parts[0].sessionID = "ses_other"; },
      value => { value.parts[0].messageID = "msg_other"; },
      value => { value.parts[0].id = ""; },
      value => { value.message.id = "msg_other"; },
      value => { value.message.sessionID = "ses_other"; },
    ];
    for (const mutate of mutations) {
      const value = output();
      mutate(value);
      const before = structuredClone(value);
      await expect(plugin["chat.message"](input, value)).rejects.toThrow("could not validate");
      expect(value).toEqual(before);
    }
    expect(requests).toHaveLength(0);
    const ordinary = output();
    ordinary.parts[0].metadata = {};
    await plugin["chat.message"](input, ordinary);
    expect(requests).toHaveLength(0);
    expect(ordinary.parts[0].type).toBe("text");
  });

  test.each(["enforce", "off"])("retains every usage step until settlement acknowledgement in %s mode", async (mode) => {
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = mode;
    const completions: unknown[] = [];
    let rejectCompletion = true;
    globalThis.fetch = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/bind-message")) return Response.json({ runId: `run_ack_${mode}` });
      completions.push(JSON.parse(String(init?.body)));
      if (rejectCompletion) throw new Error("Settlement connection interrupted");
      return Response.json({ ok: true });
    }, { preconnect: original.fetch.preconnect });
    const plugin = await MatterhornGuard({});
    const step = (id: string, finish: string) => ({ event: { type: "message.updated", properties: { info: {
      role: "assistant", id: `${mode}_${id}`, parentID: "user_ack", sessionID: `ses_ack_${mode}`,
      finish, time: { completed: 2000 }, tokens: { input: 100, output: 20 },
    } } } });
    await plugin.event(step("tool", "tool-calls"));
    const failed = plugin.event(step("final", "stop"));
    if (mode === "enforce") await expect(failed).rejects.toThrow("Settlement connection interrupted");
    else await failed;
    rejectCompletion = false;
    await plugin.event(step("final", "stop"));
    expect(completions).toHaveLength(2);
    for (const completion of completions) expect(completion).toMatchObject({
      runId: `run_ack_${mode}`, status: "success", usage: { inputTokens: 200, outputTokens: 40 },
    });
  });

  test("requires an explicit completion acknowledgement and confines internal credentials", async () => {
    const completions: unknown[] = [];
    let acknowledged = false;
    globalThis.fetch = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      if (String(input).endsWith("/bind-message")) return Response.json({ runId: "run_invalid_ack" });
      completions.push(JSON.parse(String(init?.body)));
      return Response.json(acknowledged ? { ok: true } : {});
    }, { preconnect: original.fetch.preconnect });
    const plugin = await MatterhornGuard({});
    const step = (id: string, finish: string) => ({ event: { type: "message.updated", properties: { info: {
      role: "assistant", id, parentID: "user_invalid_ack", sessionID: "ses_invalid_ack",
      finish, time: { completed: 2000 }, tokens: { input: 50, output: 10 },
    } } } });
    await plugin.event(step("invalid_ack_tool", "tool-calls"));
    await expect(plugin.event(step("invalid_ack_final", "stop"))).rejects.toThrow("acknowledgement");
    acknowledged = true;
    await plugin.event(step("invalid_ack_final", "stop"));
    expect(completions).toHaveLength(2);
    expect(completions[1]).toMatchObject({ usage: { inputTokens: 100, outputTokens: 20 } });
  });

  test("records user cancellation separately from provider failure", async () => {
    const plugin = await MatterhornGuard({ directory: "/workspace/guarded" });
    await plugin.event({ event: { type: "message.updated", properties: { info: {
      role: "assistant", id: "msg_cancelled", parentID: "msg_cancelled_parent", sessionID: "ses_cancelled",
      error: { name: "MessageAbortedError", data: { message: "cancelled" } },
      tokens: { input: 120, output: 36, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1000, completed: 2000 },
    } } } });
    const completion = requests.find(request => request.url.endsWith("/internal/agent-runs/complete"));
    expect(JSON.parse(String(completion?.init?.body))).toMatchObject({
      status: "cancelled", usage: { inputTokens: 120, outputTokens: 36 },
    });
  });

  test("never forwards the runtime credential through an actual HTTP redirect", async () => {
    let redirectedRequests = 0;
    const destination = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
      redirectedRequests += 1;
      return Response.json({ runId: "unexpected_redirect_run" });
    } });
    const source = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
      return new Response(null, { status: 307, headers: { location: destination.url.href } });
    } });
    const previousUrl = process.env.OPENWORK_SERVER_URL;
    try {
      process.env.OPENWORK_SERVER_URL = source.url.href;
      globalThis.fetch = original.fetch;
      const plugin = await MatterhornGuard({});
      await expect(plugin.event({ event: { type: "message.updated", properties: { info: {
        role: "assistant", id: "redirect_assistant", parentID: "redirect_user", sessionID: "redirect_session",
        tokens: { input: 1, output: 1 }, finish: "stop", time: { completed: 2000 },
      } } } })).rejects.toThrow();
      expect(redirectedRequests).toBe(0);
    } finally {
      process.env.OPENWORK_SERVER_URL = previousUrl;
      globalThis.fetch = mockFetch;
      source.stop(true);
      destination.stop(true);
    }
  });
  test.each(["length", "content-filter"])("settles %s as partial while retaining actual usage", async (finish) => {
    const plugin = await MatterhornGuard({ directory: "/workspace/guarded" });
    await plugin.event({ event: { type: "message.updated", properties: { info: {
      role: "assistant", id: `msg_partial_${finish}`, parentID: "msg_user_partial", sessionID: "ses_partial",
      finish, tokens: { input: 120, output: 36, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1000, completed: 2000 },
    } } } });
    const completion = requests.find(request => request.url.endsWith("/internal/agent-runs/complete"));
    expect(completion).toBeDefined();
    expect(JSON.parse(String(completion?.init?.body))).toMatchObject({
      status: "partial", usage: { inputTokens: 120, outputTokens: 36 },
    });
  });

  test("revalidates an unchanged run-bound snapshot before a provider retry", async () => {
    const plugin = await MatterhornGuard({ directory: "/workspace/guarded" });
    const messages = [{ info: { id: "msg_retry", role: "user", sessionID: "ses_retry" },
      parts: [{ type: "text", text: "Read public data" }] }];
    await plugin["experimental.chat.messages.transform"]({}, { messages });
    const input = { sessionID: "ses_retry", model: { providerID: "cudos", id: "asi1-mini" } };
    await plugin["experimental.chat.system.transform"](input, { system: [] });
    await plugin["experimental.chat.system.transform"](input, { system: [] });
    const validations = requests.filter(request => request.url.endsWith("/internal/agent-runs/provider-messages"));
    expect(validations).toHaveLength(2);
    expect(JSON.parse(String(validations[1]?.init?.body))).toMatchObject({
      expectedRunId: "run_plugin_1", messages: [{ parts: [{ text: "Read public data" }] }],
    });
    expect(requests.at(-2)?.url).toEndWith("/internal/agent-runs/provider-messages");
    expect(requests.at(-1)?.url).toEndWith("/internal/agent-runs/provider-system");
    messages[0]!.parts[0]!.text = "late unreviewed mutation";
    await expect(plugin["experimental.chat.system.transform"](input, { system: [] })).rejects.toThrow("messages changed");
    messages[0]!.parts[0]!.text = "Read public data";
    await plugin["experimental.chat.messages.transform"]({}, { messages });
    await plugin["experimental.chat.system.transform"](input, { system: [] });
    globalThis.fetch = Object.assign(async () => Response.json({ message: "Run replaced" }, { status: 409 }),
      { preconnect: original.fetch.preconnect });
    await expect(plugin["experimental.chat.system.transform"](input, { system: [] })).rejects.toThrow("Run replaced");
  });

  test("reports final usage and receipt completion even with capability mode off", async () => {
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "off";
    const plugin = await MatterhornGuard({ directory: "/workspace/guarded" });
    await plugin.event({ event: { type: "message.updated", properties: { info: {
      role: "assistant", id: "msg_off_completion", parentID: "msg_off_user", sessionID: "ses_off_completion",
      finish: "stop", tokens: { input: 120, output: 30, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1000, completed: 2000 },
    } } } });
    const completions = requests.filter(request => request.url.endsWith("/internal/agent-runs/complete"));
    expect(completions).toHaveLength(1);
    expect(JSON.parse(String(completions[0]?.init?.body))).toMatchObject({
      runId: "run_plugin_1", status: "success", usage: { inputTokens: 120, outputTokens: 30 },
    });
    expect(completions[0]?.init?.headers).toEqual(expect.objectContaining({
      "X-Matterhorn-Agent-Runtime-Secret": "runtime-only-secret",
    }));
  });

  test("keeps a run active after a tool-call step until the final assistant response", async () => {
    const plugin = await MatterhornGuard({ directory: "/workspace/guarded" });
    const eventForStep = (id: string, finish: string) => ({
      event: {
        type: "message.updated",
        properties: { info: {
          role: "assistant", id, parentID: "msg_user_tool_loop_regression", sessionID: "ses_tool_loop_regression",
          finish, tokens: { input: 900, output: 100, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: 1000, completed: 2000 },
        } },
      },
    });
    await plugin.event(eventForStep("msg_assistant_tool_step_regression", "tool-calls"));
    // OpenCode completes each model step before it executes tools. That is
    // not completion of the user's whole request or its run authority.
    expect(requests.filter(request => request.url.endsWith("/internal/agent-runs/complete"))).toHaveLength(0);
    await plugin.event(eventForStep("msg_assistant_final_step_regression", "stop"));
    const completions = requests.filter(request => request.url.endsWith("/internal/agent-runs/complete"));
    expect(completions).toHaveLength(1);
    expect(JSON.parse(String(completions[0]?.init?.body))).toMatchObject({ status: "success", usage: { inputTokens: 1800, outputTokens: 200 } });
  });

  test("adds only the reserved call id after model argument generation", async () => {
    const plugin = await MatterhornGuard({ directory: "/workspace/guarded" });
    await plugin.event({
      event: {
        type: "message.updated",
        properties: {
          info: {
            role: "assistant",
            id: "msg_assistant_plugin_1",
            parentID: "msg_user_plugin_1",
            sessionID: "ses_plugin",
            tokens: { input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            time: {},
          },
        },
      },
    });
    const output: { args: Record<string, unknown> } = { args: { asset: "BTC", limit: 5 } };
    await plugin["tool.execute.before"]({
      tool: "matterhorn-work_matterhorn_hyperliquid_list_markets",
      sessionID: "ses_plugin",
      callID: "call_plugin_1",
      messageID: "msg_assistant_plugin_1",
    }, output);
    expect(output.args).toEqual({ asset: "BTC", limit: 5, _matterhornCallId: "call_plugin_1" });
    expect(JSON.stringify(output.args)).not.toContain("runtime-only-secret");
    expect(JSON.stringify(output.args)).not.toContain("capability");
    const request = requests.at(-1);
    expect(request?.init?.headers).toEqual(expect.objectContaining({ "X-Matterhorn-Agent-Runtime-Secret": "runtime-only-secret" }));
    expect(String(request?.init?.body)).not.toContain("runtime-only-secret");
    expect(JSON.parse(String(request?.init?.body))).toMatchObject({ runId: "run_plugin_1" });
  });

  test("validates the exact final message array without modifying it", async () => {
    const plugin = await MatterhornGuard({ directory: "/workspace/guarded" });
    const messages = [{
      info: { id: "msg_user_plugin_1", role: "user", sessionID: "ses_plugin" },
      parts: [{ type: "text", text: "Compare public Bittensor validators" }],
    }];
    const output = { messages: structuredClone(messages) };

    await plugin["experimental.chat.messages.transform"]({}, output);

    expect(output.messages).toEqual(messages);
    const request = requests.at(-1);
    expect(request?.url).toEndWith("/internal/agent-runs/provider-messages");
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      workspaceDirectory: "/workspace/guarded",
      sessionId: "ses_plugin",
      messages,
    });
    expect(String(request?.init?.body)).not.toContain("runtime-only-secret");
  });

  test("rejects mixed-session and unbounded final message arrays before transport", async () => {
    const plugin = await MatterhornGuard({ directory: "/workspace/guarded" });
    const message = (sessionID: string) => ({
      info: { role: "user", sessionID },
      parts: [{ type: "text", text: "public research" }],
    });

    await expect(plugin["experimental.chat.messages.transform"]({}, {
      messages: [message("ses_plugin"), message("ses_other")],
    })).rejects.toThrow("crossed chat boundaries");
    await expect(plugin["experimental.chat.messages.transform"]({}, {
      messages: Array.from({ length: 2_049 }, () => message("ses_plugin")),
    })).rejects.toThrow("safely validate");
    expect(requests).toHaveLength(0);
  });

  test("replaces late OpenCode system context with the exact authorized provider context", async () => {
    const plugin = await MatterhornGuard({ directory: "/workspace/guarded" });
    const output = { system: ["OpenCode environment", "unreviewed workspace instruction"] };
    await plugin["experimental.chat.system.transform"]({
      sessionID: "ses_plugin",
      model: { providerID: "cudos", id: "asi1-mini" },
    }, output);

    expect(output.system).toEqual(["Exact Matterhorn-approved system context."]);
    const request = requests.at(-1);
    expect(request?.url).toEndWith("/internal/agent-runs/provider-system");
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      workspaceDirectory: "/workspace/guarded",
      sessionId: "ses_plugin",
      providerId: "cudos",
      modelId: "asi1-mini",
      purpose: "message",
    });
    expect(String(request?.init?.body)).not.toContain("OpenCode environment");
    expect(String(request?.init?.body)).not.toContain("unreviewed workspace instruction");
    expect(String(request?.init?.body)).not.toContain("runtime-only-secret");
  });

  test("fails closed outside capability enforcement when the provider binding is unavailable", async () => {
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "off";
    const unavailableFetch: typeof fetch = Object.assign(
      async () => Response.json({ code: "agent_provider_system_not_bound" }, { status: 409 }),
      { preconnect: globalThis.fetch.preconnect },
    );
    globalThis.fetch = unavailableFetch;
    const plugin = await MatterhornGuard({ directory: "/workspace/guarded" });
    const output = { system: ["unreviewed"] };

    await expect(plugin["experimental.chat.system.transform"]({
      sessionID: "ses_plugin",
      model: { providerID: "cudos", id: "asi1-mini" },
    }, output)).rejects.toThrow("Matterhorn denied this guarded runtime action.");
    expect(output.system).toEqual(["unreviewed"]);
  });

  test("rejects a provider-system response whose content does not match its bound hash", async () => {
    const tamperedFetch: typeof fetch = Object.assign(
      async () => Response.json({
        runId: "run_plugin_1",
        system: ["Tampered system context"],
        systemHash: "80616920c9c410b26f70c7e930a40150746b8ef2309abd11e10149c9f82e0dee",
      }),
      { preconnect: globalThis.fetch.preconnect },
    );
    globalThis.fetch = tamperedFetch;
    const plugin = await MatterhornGuard({ directory: "/workspace/guarded" });

    await expect(plugin["experimental.chat.system.transform"]({
      sessionID: "ses_plugin",
      model: { providerID: "cudos", id: "asi1-mini" },
    }, { system: ["late unreviewed context"] })).rejects.toThrow("hash did not match");
  });

  test("adds crypto-specific safe compaction requirements", async () => {
    const plugin = await MatterhornGuard({ directory: "/workspace/guarded" });
    const output = { context: [] as string[] };
    await plugin["experimental.session.compacting"]({ sessionID: "ses_plugin" }, output);
    expect(output.context.join("\n")).toContain("Do not retain or reconstruct secrets");
    expect(output.context.join("\n")).toContain("intent hash");
    const systemOutput = { system: ["late compaction context"] };
    await plugin["experimental.chat.system.transform"]({
      sessionID: "ses_plugin",
      model: { providerID: "cudos", id: "asi1-mini" },
    }, systemOutput);
    expect(JSON.parse(String(requests.at(-1)?.init?.body))).toMatchObject({ purpose: "compaction" });
  });
});

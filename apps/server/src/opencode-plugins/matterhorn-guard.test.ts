import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MatterhornGuard } from "./matterhorn-guard.js";

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

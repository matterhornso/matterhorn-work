import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MatterhornGuard } from "./matterhorn-guard.js";

const original = {
  mode: process.env.MATTERHORN_GUARDED_RUNTIME_MODE,
  runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET,
  serverUrl: process.env.OPENWORK_SERVER_URL,
  fetch: globalThis.fetch,
};
const requests: Array<{ url: string; init?: RequestInit }> = [];

beforeAll(() => {
  process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
  process.env.MATTERHORN_AGENT_RUNTIME_SECRET = "runtime-only-secret";
  process.env.OPENWORK_SERVER_URL = "http://matterhorn.internal";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith("/internal/agent-capabilities/authorize")) {
      return Response.json({ accepted: true, callId: body.callId, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    }
    if (url.endsWith("/internal/agent-runs/bind-message")) {
      return Response.json({ runId: "run_plugin_1" });
    }
    return Response.json({ ok: true });
  }) as typeof fetch;
});

afterAll(() => {
  if (original.mode === undefined) delete process.env.MATTERHORN_GUARDED_RUNTIME_MODE;
  else process.env.MATTERHORN_GUARDED_RUNTIME_MODE = original.mode;
  if (original.runtimeSecret === undefined) delete process.env.MATTERHORN_AGENT_RUNTIME_SECRET;
  else process.env.MATTERHORN_AGENT_RUNTIME_SECRET = original.runtimeSecret;
  if (original.serverUrl === undefined) delete process.env.OPENWORK_SERVER_URL;
  else process.env.OPENWORK_SERVER_URL = original.serverUrl;
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

  test("adds crypto-specific safe compaction requirements", async () => {
    const plugin = await MatterhornGuard({ directory: "/workspace/guarded" });
    const output = { context: [] as string[] };
    await plugin["experimental.session.compacting"]({ sessionID: "ses_plugin" }, output);
    expect(output.context.join("\n")).toContain("Do not retain or reconstruct secrets");
    expect(output.context.join("\n")).toContain("intent hash");
  });
});

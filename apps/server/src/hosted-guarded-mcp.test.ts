import { describe, expect, test } from "bun:test";

import {
  handleHostedGuardedMcpPost,
  HOSTED_GUARDED_MCP_PROTOCOL_VERSION,
  HOSTED_GUARDED_MCP_TOOLS,
  HostedGuardedMcpToolError,
  hostedGuardedMcpMethodNotAllowed,
  type HostedGuardedMcpInvocation,
} from "./hosted-guarded-mcp.js";

function request(
  headers: Record<string, string> = {},
): Request {
  return new Request("https://matterhorn.example/mcp/guarded", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": HOSTED_GUARDED_MCP_PROTOCOL_VERSION,
      ...headers,
    },
  });
}

async function responseBody(response: Response): Promise<Record<string, any>> {
  return await response.json() as Record<string, any>;
}

async function call(
  payload: unknown,
  invoke: (invocation: HostedGuardedMcpInvocation) => Promise<unknown> = async () => ({ ok: true }),
  req = request(),
): Promise<{ response: Response; body: Record<string, any> | null }> {
  const response = await handleHostedGuardedMcpPost({
    request: req,
    payload,
    invoke,
    serverVersion: "0.13.15",
  });
  return {
    response,
    body: response.status === 202 || response.status === 405 ? null : await responseBody(response),
  };
}

describe("hosted guarded Streamable HTTP MCP", () => {
  test("negotiates the current protocol with only account-scoped tool capability", async () => {
    const { response, body } = await call({
      jsonrpc: "2.0",
      id: "init",
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "acceptance-client", version: "1.0.0" },
      },
    }, undefined, request({ "MCP-Protocol-Version": "" }));

    expect(response.status).toBe(200);
    expect(body?.result).toMatchObject({
      protocolVersion: HOSTED_GUARDED_MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "matterhorn-hosted-guarded-mcp", version: "0.13.15" },
    });
    expect(body?.result.capabilities).not.toHaveProperty("prompts");
    expect(body?.result.capabilities).not.toHaveProperty("resources");
    expect(Object.keys(body?.result.capabilities)).toEqual(["tools"]);
    expect(body?.result.instructions).toContain("Wallet signing");
    expect(body?.result.instructions).toContain("unavailable");
  });

  test("advertises exactly the same 11 closed tools as the local guarded connector", async () => {
    const { response, body } = await call({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    expect(response.status).toBe(200);
    expect(body?.result.tools).toEqual(HOSTED_GUARDED_MCP_TOOLS);
    expect(body?.result.tools).toHaveLength(11);
    expect(body?.result.tools.every((tool: any) => tool.inputSchema.additionalProperties === false)).toBe(true);
    expect(body?.result.tools.map((tool: any) => tool.name).join(" ")).not.toMatch(
      /(?:wallet_(?:sign|submit)|transaction_(?:sign|submit|relay|broadcast)|shell|command|plugin|config|skill)/i,
    );

    const localToolModuleUrl = new URL(
      "../../../packages/matterhorn-guarded-mcp/tools.mjs",
      import.meta.url,
    ).href;
    const local = await import(localToolModuleUrl) as { tools: unknown[] };
    expect(local.tools).toEqual([...HOSTED_GUARDED_MCP_TOOLS]);
  });

  test("requires Streamable HTTP media types and validates protocol versions", async () => {
    const payload = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    const wrongContent = await call(payload, undefined, request({ "Content-Type": "text/plain" }));
    expect(wrongContent.response.status).toBe(415);
    expect(wrongContent.body?.error.message).not.toContain("text/plain");

    const wrongAccept = await call(payload, undefined, request({ Accept: "application/json" }));
    expect(wrongAccept.response.status).toBe(406);

    const wrongVersion = await call(payload, undefined, request({ "MCP-Protocol-Version": "2099-01-01" }));
    expect(wrongVersion.response.status).toBe(400);
    expect(wrongVersion.body?.error.message).toBe("Unsupported MCP protocol version.");

    const defaultVersion = await call(payload, undefined, request({ "MCP-Protocol-Version": "" }));
    expect(defaultVersion.response.status).toBe(200);
  });

  test("rejects batches and invalid requests while acknowledging notifications and responses", async () => {
    const batch = await call([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]);
    expect(batch.body?.error.code).toBe(-32600);

    const badId = await call({ jsonrpc: "2.0", id: {}, method: "tools/list" });
    expect(badId.body?.error.code).toBe(-32600);
    expect(badId.body?.id).toBeNull();

    const notification = await call({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(notification.response.status).toBe(202);
    expect(await notification.response.text()).toBe("");

    const clientResponse = await call({ jsonrpc: "2.0", id: 7, result: {} });
    expect(clientResponse.response.status).toBe(202);
    expect(await clientResponse.response.text()).toBe("");
  });

  test("routes prompts only through the authoritative account message gateway", async () => {
    const invocations: HostedGuardedMcpInvocation[] = [];
    const { body } = await call({
      jsonrpc: "2.0",
      id: "prompt",
      method: "tools/call",
      params: {
        name: "matterhorn_submit_session_prompt",
        arguments: {
          workspaceId: "ws_account",
          sessionId: "ses_guarded",
          message: "Compare Bittensor validators using public evidence.",
          agentId: "matterhorn-bittensor",
          privacyMode: "public_research",
          executionMode: "work",
        },
      },
    }, async (invocation) => {
      invocations.push(invocation);
      return { accepted: true, runId: "run_guarded" };
    });

    expect(invocations).toEqual([{
      method: "POST",
      path: "/workspace/ws_account/sessions/ses_guarded/messages",
      body: {
        message: "Compare Bittensor validators using public evidence.",
        agentId: "matterhorn-bittensor",
        privacyMode: "public_research",
        executionMode: "work",
      },
    }]);
    expect(JSON.parse(body?.result.content[0].text)).toEqual({ accepted: true, runId: "run_guarded" });
  });

  test("maps bounded workspace and progress operations without arbitrary routes", async () => {
    const invocations: HostedGuardedMcpInvocation[] = [];
    const invoke = async (invocation: HostedGuardedMcpInvocation) => {
      invocations.push(invocation);
      return invocation.accept === "text/event-stream"
        ? { events: [{ event: "session.status" }] }
        : { ok: true };
    };

    await call({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "matterhorn_list_sessions",
        arguments: { workspaceId: "ws_safe", start: 0, limit: 10, roots: true },
      },
    }, invoke);
    await call({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "matterhorn_watch_session_events",
        arguments: { workspaceId: "ws_safe", sessionId: "ses_safe", maxEvents: 999 },
      },
    }, invoke);

    expect(invocations[0]).toEqual({
      method: "GET",
      path: "/workspace/ws_safe/sessions",
      query: { roots: true, start: 0, search: undefined, limit: 10 },
    });
    expect(invocations[1]).toMatchObject({
      method: "GET",
      path: "/workspace/ws_safe/sessions/ses_safe/events",
      accept: "text/event-stream",
      query: { maxEvents: 50 },
    });
  });

  test("fails closed on unknown tools, arguments, and non-integer bounds", async () => {
    let invoked = false;
    const invoke = async () => {
      invoked = true;
      return { ok: true };
    };
    const unknown = await call({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "matterhorn_wallet_submit", arguments: {} },
    }, invoke);
    expect(unknown.body?.error.code).toBe(-32601);

    const broadened = await call({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "matterhorn_get_session",
        arguments: { workspaceId: "ws_safe", sessionId: "ses_safe", wallet: true },
      },
    }, invoke);
    expect(broadened.body?.error.code).toBe(-32602);

    const fractionalLimit = await call({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "matterhorn_get_session_messages",
        arguments: { workspaceId: "ws_safe", sessionId: "ses_safe", limit: 1.5 },
      },
    }, invoke);
    expect(fractionalLimit.body?.result.isError).toBe(true);
    expect(invoked).toBe(false);
  });

  test("never reflects unknown failures or secrets to the MCP client", async () => {
    const unknown = await call({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "matterhorn_list_workspaces", arguments: {} },
    }, async () => {
      throw new Error("secret-token at /data/private/workspace");
    });
    expect(unknown.body?.result.isError).toBe(true);
    expect(JSON.stringify(unknown.body)).not.toContain("secret-token");
    expect(JSON.stringify(unknown.body)).not.toContain("/data/private");

    const disclosed = await call({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "matterhorn_list_workspaces", arguments: {} },
    }, async () => {
      throw new HostedGuardedMcpToolError("This request needs privacy review in Matterhorn before it can be sent.");
    });
    expect(disclosed.body?.result.content[0].text).toBe(
      "This request needs privacy review in Matterhorn before it can be sent.",
    );
  });

  test("returns method-not-allowed for GET and DELETE transport probes", async () => {
    const response = hostedGuardedMcpMethodNotAllowed();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

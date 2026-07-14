import { afterEach, describe, expect, test } from "bun:test";

import { resolveWorkspaceEndpoint } from "../src/app/lib/workspace-endpoint";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function captureNextRequest() {
  let request: { input: RequestInfo | URL; init?: RequestInit } | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    request = { input, init };
    return new Response(JSON.stringify({
      activeId: "ws_launch",
      workspace: { id: "ws_launch" },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return () => request;
}

describe("workspace endpoint host authorization", () => {
  test("preserves local client and host credentials for activation", async () => {
    const captured = captureNextRequest();
    const endpoint = resolveWorkspaceEndpoint(
      { id: "ws_launch", workspaceType: "local" } as any,
      {
        baseUrl: "http://127.0.0.1:4140",
        token: "client-token",
        hostToken: "host-token",
      },
    );

    expect(endpoint).not.toBeNull();
    await endpoint!.client.activateWorkspace(endpoint!.workspaceId);

    const request = captured();
    const headers = new Headers(request?.init?.headers);
    expect(String(request?.input)).toBe("http://127.0.0.1:4140/workspaces/ws_launch/activate");
    expect(headers.get("authorization")).toBe("Bearer client-token");
    expect(headers.get("x-matterhorn-host-token")).toBe("host-token");
  });

  test("keeps remote client and host credentials separate", async () => {
    const captured = captureNextRequest();
    const endpoint = resolveWorkspaceEndpoint(
      {
        id: "rem_ws_launch",
        workspaceType: "remote",
        baseUrl: "https://worker.example.test",
        matterhornClientToken: "remote-client-token",
        matterhornHostToken: "remote-host-token",
      } as any,
      { baseUrl: "http://127.0.0.1:4140", token: "local-client-token" },
    );

    expect(endpoint).not.toBeNull();
    await endpoint!.client.activateWorkspace(endpoint!.workspaceId);

    const request = captured();
    const headers = new Headers(request?.init?.headers);
    expect(String(request?.input)).toBe("https://worker.example.test/workspaces/ws_launch/activate");
    expect(headers.get("authorization")).toBe("Bearer remote-client-token");
    expect(headers.get("x-matterhorn-host-token")).toBe("remote-host-token");
  });
});

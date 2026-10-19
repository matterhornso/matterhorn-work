import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { routerWorkspaceRequestOptions } from "../src/router-workspace-request.js";

const managed = { Authorization: "Basic synthetic-local-only" };
const workspaceTypes: Array<"local" | "remote"> = ["local", "remote"];

test("remote workspace requests never inherit managed credentials and local requests use a fresh copy", () => {
  const remote = routerWorkspaceRequestOptions("remote", managed);
  const local = routerWorkspaceRequestOptions("local", managed);
  expect(remote).toEqual({ headers: {}, redirect: "error" });
  expect(local).toEqual({ headers: managed, redirect: "error" });
  local.headers.Authorization = "changed";
  expect(managed.Authorization).toBe("Basic synthetic-local-only");
});

test("SDK path and direct dispose preserve local authentication and unauthenticated remote compatibility", async () => {
  const requests: Array<{ path: string; auth: string | null; method: string }> = [];
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    requests.push({ path: new URL(request.url).pathname, auth: request.headers.get("authorization"), method: request.method });
    return Response.json({ directory: "/synthetic", worktree: "/synthetic" });
  } });
  try {
    for (const type of workspaceTypes) {
      const options = routerWorkspaceRequestOptions(type, managed);
      const client = createOpencodeClient({ baseUrl: server.url.toString(), directory: "/synthetic", ...options });
      const result = await client.path.get();
      expect(result.response.status).toBe(200);
      const response = await fetch(new URL("/instance/dispose?directory=%2Fsynthetic", server.url), { method: "POST", ...routerWorkspaceRequestOptions(type, managed) });
      expect(response.status).toBe(200);
    }
    expect(requests).toEqual([
      { path: "/path", method: "GET", auth: managed.Authorization },
      { path: "/instance/dispose", method: "POST", auth: managed.Authorization },
      { path: "/path", method: "GET", auth: null },
      { path: "/instance/dispose", method: "POST", auth: null },
    ]);
  } finally { server.stop(true); }
});

test("redirects cannot carry local credentials or remote workspace requests to a second destination", async () => {
  let destinationCalls = 0;
  const destination = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
    destinationCalls++;
    return Response.json({ directory: "/unexpected" });
  } });
  const redirector = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
    return new Response(null, { status: 307, headers: { Location: destination.url.toString() } });
  } });
  try {
    for (const type of workspaceTypes) {
      const client = createOpencodeClient({ baseUrl: redirector.url.toString(), ...routerWorkspaceRequestOptions(type, managed) });
      await expect(client.path.get(undefined, { throwOnError: true })).rejects.toThrow();
      await expect(fetch(redirector.url, { method: "POST", ...routerWorkspaceRequestOptions(type, managed) })).rejects.toThrow();
    }
    expect(destinationCalls).toBe(0);
  } finally { redirector.stop(true); destination.stop(true); }
});

test("both reachable router workspace routes use the credential-scoped options", async () => {
  const source = await readFile(new URL("../src/cli.ts", import.meta.url), "utf8");
  const start = source.indexOf('parts[2] === "path"');
  const end = source.indexOf('if (req.method === "POST" && url.pathname === "/shutdown")', start);
  const routes = source.slice(start, end);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  expect(routes.match(/routerWorkspaceRequestOptions\(workspace.workspaceType, authHeaders\)/g)).toHaveLength(2);
  expect(routes).not.toContain("headers: authHeaders");
});

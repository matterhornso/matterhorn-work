// Isolated QA regressions. Real loopback server; generated files and trusted
// local test token only. Not hosted browser or real-provider acceptance.
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConnection } from "node:net";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

const keys = ["MATTERHORN_AUTH_DB", "MATTERHORN_WORK_DATA_DIR", "MATTERHORN_WORK_MEMORY_ROOT", "OPENWORK_ENV_STORE", "OPENWORK_TOKEN_STORE", "OPENWORK_INBOX_ENABLED", "OPENWORK_INBOX_MAX_BYTES", "MATTERHORN_SIGNUPS_ENABLED", "MATTERHORN_EMAIL_VERIFICATION_REQUIRED", "MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED"];
const originalEnv = new Map(keys.map(key => [key, process.env[key]]));
const roots: string[] = [];
const stops: Array<() => unknown> = [];
const token = "isolated-inbox-qa-local-only";
afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (roots.length) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function fixture(mode: "fresh" | "ready" | "linked-root", readOnly = false) {
  const root = await mkdtemp(join(tmpdir(), "mh-inbox-qa-"));
  roots.push(root);
  const workspace = join(root, "workspace");
  const outside = join(root, "outside-authorized-workspace");
  const inbox = join(workspace, ".opencode/openwork/inbox");
  await mkdir(workspace);
  await mkdir(outside);
  if (mode === "ready") await mkdir(inbox, { recursive: true });
  if (mode === "linked-root") {
    await mkdir(join(workspace, ".opencode/openwork"), { recursive: true });
    await symlink(outside, inbox);
  }
  process.env.MATTERHORN_AUTH_DB = join(root, "accounts.db");
  process.env.MATTERHORN_WORK_DATA_DIR = join(root, "data");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(root, "memory");
  process.env.OPENWORK_ENV_STORE = join(root, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(root, "tokens.json");
  process.env.OPENWORK_INBOX_ENABLED = "true";
  process.env.OPENWORK_INBOX_MAX_BYTES = "32";
  const config: ServerConfig = {
    host: "127.0.0.1", port: 0, token, hostToken: "isolated-inbox-host-qa-only",
    approval: { mode: "auto", timeoutMs: 1000 }, corsOrigins: ["http://127.0.0.1"],
    workspaces: [{ id: "ws_inbox_qa", name: "QA", path: workspace, preset: "starter", workspaceType: "local" }],
    authorizedRoots: [workspace], readOnly, startedAt: Date.now(),
    tokenSource: "cli", hostTokenSource: "cli", logFormat: "pretty", logRequests: false, reloadWatchers: false,
  };
  const server = await startServer(config);
  stops.push(() => server.stop());
  const url = `http://127.0.0.1:${server.port}/workspace/ws_inbox_qa/inbox`;
  const upload = async (path: string, content = "SYNTHETIC_QA_BYTES") => {
    const body = new FormData();
    body.set("file", new File([content], "qa.txt", { type: "text/plain" }));
    body.set("path", path);
    return fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
  };
  const download = (path: string) => fetch(`${url}/${Buffer.from(path).toString("base64url")}`, { headers: { Authorization: `Bearer ${token}` } });
  return { base: `http://127.0.0.1:${server.port}`, root, workspace, outside, inbox, upload, download };
}

async function registerAccount(base: string, email: string) {
  process.env.MATTERHORN_SIGNUPS_ENABLED = "true";
  process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED = "false";
  process.env.MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED = "false";
  const signup = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "isolated-inbox-password-qa-only" }),
  });
  expect(signup.status).toBe(200);
  const cookie = signup.headers.get("set-cookie")?.split(";")[0];
  if (!cookie?.startsWith("mh_session=")) throw new Error("QA signup did not return a session");
  const response = await fetch(`${base}/workspaces`, { headers: { cookie } });
  expect(response.status).toBe(200);
  const payload = await response.json();
  const workspace = payload.items?.[0];
  if (typeof workspace?.id !== "string" || typeof workspace?.path !== "string") {
    throw new Error("QA workspace has no id/path");
  }
  return { cookie, workspaceId: workspace.id, workspacePath: workspace.path };
}

test("first inbox upload works without a pre-created inbox directory", async () => {
  const f = await fixture("fresh");
  const response = await f.upload("qa.txt");
  console.log(JSON.stringify({ probe: "first-upload", status: response.status }));
  expect(response.status).toBe(200);
  expect(await readFile(join(f.inbox, "qa.txt"), "utf8")).toBe("SYNTHETIC_QA_BYTES");
});

test("existing inbox supports nested roundtrip and rejects traversal and oversized files", async () => {
  const f = await fixture("ready");
  expect((await f.upload("nested/qa.txt")).status).toBe(200);
  const downloaded = await f.download("nested/qa.txt");
  expect(downloaded.status).toBe(200);
  expect(await downloaded.text()).toBe("SYNTHETIC_QA_BYTES");
  expect((await f.upload("../escape.txt")).status).toBe(400);
  expect((await f.upload("nested/qa.txt", "x".repeat(33))).status).toBe(413);
  expect(await readFile(join(f.inbox, "nested/qa.txt"), "utf8")).toBe("SYNTHETIC_QA_BYTES");
});

test("a newly registered browser account can perform its first inbox upload", async () => {
  const f = await fixture("fresh");
  process.env.MATTERHORN_SIGNUPS_ENABLED = "true";
  process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED = "false";
  process.env.MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED = "false";
  const signup = await fetch(`${f.base}/api/auth/sign-up/email`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "inbox-qa@example.test", password: "isolated-inbox-password-qa-only" }),
  });
  expect(signup.status).toBe(200);
  const cookie = signup.headers.get("set-cookie")?.split(";")[0];
  if (!cookie?.startsWith("mh_session=")) throw new Error("QA signup did not return a session");
  const workspaces = await fetch(`${f.base}/workspaces`, { headers: { cookie } });
  expect(workspaces.status).toBe(200);
  const payload = await workspaces.json();
  const workspaceId = payload.items[0].id;
  const body = new FormData();
  body.set("file", new File(["SYNTHETIC_QA_BYTES"], "qa.txt", { type: "text/plain" }));
  const response = await fetch(`${f.base}/workspace/${workspaceId}/inbox`, { method: "POST", headers: { cookie }, body });
  console.log(JSON.stringify({ probe: "account-cookie-first-upload", status: response.status }));
  expect(response.status).toBe(200);
});

test("inbox rejects an escaping symlink below a legitimate inbox root", async () => {
  const f = await fixture("ready");
  await symlink(f.outside, join(f.inbox, "escape"));
  expect((await f.upload("escape/qa.txt")).status).toBe(400);
});

test("inbox rejects unauthenticated requests and disabled access without modifying existing files", async () => {
  const f = await fixture("ready");
  await writeFile(join(f.inbox, "qa.txt"), "EXISTING_QA_BYTES");
  const url = `${f.base}/workspace/ws_inbox_qa/inbox`;
  expect((await fetch(url)).status).toBe(401);
  expect((await fetch(`${url}/${Buffer.from("qa.txt").toString("base64url")}`)).status).toBe(401);
  const body = new FormData();
  body.set("file", new File(["UNAUTHORIZED_QA_BYTES"], "qa.txt"));
  expect((await fetch(url, { method: "POST", body })).status).toBe(401);
  process.env.OPENWORK_INBOX_ENABLED = "false";
  expect((await f.download("qa.txt")).status).toBe(404);
  expect((await f.upload("qa.txt")).status).toBe(404);
  expect(await readFile(join(f.inbox, "qa.txt"), "utf8")).toBe("EXISTING_QA_BYTES");
});

test("read-only mode prevents inbox overwrite while retaining download access", async () => {
  const f = await fixture("ready", true);
  await writeFile(join(f.inbox, "qa.txt"), "EXISTING_QA_BYTES");
  expect((await f.upload("qa.txt")).status).toBe(403);
  expect(await readFile(join(f.inbox, "qa.txt"), "utf8")).toBe("EXISTING_QA_BYTES");
  const response = await f.download("qa.txt");
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("EXISTING_QA_BYTES");
});

test("inbox download rejects a symlinked inbox root outside the authorized workspace", async () => {
  const f = await fixture("linked-root");
  await writeFile(join(f.outside, "qa.txt"), "OUTSIDE_WORKSPACE_SENTINEL");
  const response = await f.download("qa.txt");
  const leaked = (await response.text()).includes("OUTSIDE_WORKSPACE_SENTINEL");
  console.log(JSON.stringify({ probe: "linked-root-read", status: response.status, escapedWorkspace: leaked }));
  expect(leaked).toBe(false);
  expect(response.status).toBe(400);
});

test("inbox upload rejects a symlinked inbox root outside the authorized workspace", async () => {
  const f = await fixture("linked-root");
  const response = await f.upload("qa.txt");
  const outsideContent = await readFile(join(f.outside, "qa.txt"), "utf8").catch(() => null);
  console.log(JSON.stringify({ probe: "linked-root-write", status: response.status, escapedWorkspace: outsideContent === "SYNTHETIC_QA_BYTES" }));
  expect(outsideContent).toBeNull();
  expect(response.status).toBe(400);
});

test("outbox download rejects a symlinked outbox root outside the authorized workspace", async () => {
  const f = await fixture("ready");
  await symlink(f.outside, join(f.workspace, ".opencode/openwork/outbox"));
  await writeFile(join(f.outside, "qa.txt"), "OUTBOX_OUTSIDE_SENTINEL");
  const id = Buffer.from("qa.txt").toString("base64url");
  const response = await fetch(`${f.base}/workspace/ws_inbox_qa/artifacts/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  const leaked = (await response.text()).includes("OUTBOX_OUTSIDE_SENTINEL");
  console.log(JSON.stringify({ probe: "linked-outbox-read", status: response.status, escapedWorkspace: leaked }));
  expect(leaked).toBe(false);
  expect(response.status).toBe(400);
});

test("account cookies isolate real inbox and output bytes even with identical filenames", async () => {
  const f = await fixture("ready");
  const a = await registerAccount(f.base, "files-a@example.test");
  const b = await registerAccount(f.base, "files-b@example.test");
  expect(a.workspaceId).not.toBe(b.workspaceId);
  // Pre-create inboxes ONLY to isolate this test from the independently
  // demonstrated fresh-upload defect. Accounts themselves use normal signup.
  for (const account of [a, b]) {
    if (!account.workspacePath.startsWith(`${f.root}/data/web-workspaces/`)) {
      throw new Error("Refusing file fixture outside generated data root");
    }
    await mkdir(join(account.workspacePath, ".opencode/openwork/inbox"), { recursive: true });
    await mkdir(join(account.workspacePath, ".opencode/openwork/outbox"), { recursive: true });
  }
  const fileId = Buffer.from("qa.txt").toString("base64url");
  const upload = (workspaceId: string, cookie: string, bytes: string) => {
    const body = new FormData();
    body.set("file", new File([bytes], "qa.txt", { type: "text/plain" }));
    return fetch(`${f.base}/workspace/${workspaceId}/inbox`, { method: "POST", headers: { cookie }, body });
  };
  expect((await upload(a.workspaceId, a.cookie, "ACCOUNT_A_FILE")).status).toBe(200);
  expect((await upload(b.workspaceId, b.cookie, "ACCOUNT_B_FILE")).status).toBe(200);
  await writeFile(join(a.workspacePath, ".opencode/openwork/outbox/qa.txt"), "ACCOUNT_A_OUTPUT");
  await writeFile(join(b.workspacePath, ".opencode/openwork/outbox/qa.txt"), "ACCOUNT_B_OUTPUT");
  for (const [owner, visitor, prefix] of [[a, b, "ACCOUNT_A"], [b, a, "ACCOUNT_B"]] satisfies Array<[typeof a, typeof b, string]>) {
    for (const [route, expected] of [["inbox", `${prefix}_FILE`], ["artifacts", `${prefix}_OUTPUT`]]) {
      const url = `${f.base}/workspace/${owner.workspaceId}/${route}`;
      const own = await fetch(`${url}/${fileId}`, { headers: { cookie: owner.cookie } });
      expect(own.status).toBe(200);
      expect(await own.text()).toBe(expected);
      const denied = await fetch(`${url}/${fileId}`, { headers: { cookie: visitor.cookie } });
      expect(denied.status).toBe(404);
      expect(await denied.text()).not.toContain(expected);
      expect((await fetch(url, { headers: { cookie: visitor.cookie } })).status).toBe(404);
    }
    expect((await upload(owner.workspaceId, visitor.cookie, "CROSS_ACCOUNT_OVERWRITE")).status).toBe(404);
    expect(await readFile(join(owner.workspacePath, ".opencode/openwork/inbox/qa.txt"), "utf8")).toBe(`${prefix}_FILE`);
  }
});

test("malformed and incomplete multipart uploads preserve files and return client errors", async () => {
  const f = await fixture("ready");
  await writeFile(join(f.inbox, "qa.txt"), "EXISTING_QA_BYTES");
  const url = `${f.base}/workspace/ws_inbox_qa/inbox`;
  const malformed = [
    { type: "application/json", body: "{}" },
    { type: "multipart/form-data", body: "no-boundary" },
    { type: "multipart/form-data; boundary=qa-boundary", body: '--qa-boundary\r\nContent-Disposition: form-data; name="file"; filename="qa.txt"\r\nContent-Type: text/plain\r\n\r\nINCOMPLETE_QA_BYTES' },
  ];
  const statuses: number[] = [];
  for (const input of malformed) {
    const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": input.type }, body: input.body });
    statuses.push(response.status);
    expect(await readFile(join(f.inbox, "qa.txt"), "utf8")).toBe("EXISTING_QA_BYTES");
    expect(await readdir(f.inbox)).toEqual(["qa.txt"]);
  }
  console.log(JSON.stringify({ probe: "malformed-multipart", statuses, existingFilePreserved: true, partialFiles: false }));
  for (const status of statuses) {
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  }
});

test("dropped upload connection preserves existing bytes and permits a successful retry", async () => {
  const f = await fixture("ready");
  await writeFile(join(f.inbox, "qa.txt"), "EXISTING_QA_BYTES");
  const partial = '--qa-boundary\r\nContent-Disposition: form-data; name="file"; filename="qa.txt"\r\nContent-Type: text/plain\r\n\r\nPARTIAL_QA_BYTES';
  const port = Number(new URL(f.base).port);
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(2000, () => socket.destroy(new Error("QA socket timeout")));
    socket.once("error", reject);
    socket.once("close", () => resolve());
    socket.once("connect", () => {
      // Deliberately drop the transport before satisfying Content-Length.
      socket.write([
        "POST /workspace/ws_inbox_qa/inbox HTTP/1.1",
        `Host: 127.0.0.1:${port}`,
        `Authorization: Bearer ${token}`,
        "Content-Type: multipart/form-data; boundary=qa-boundary",
        "Content-Length: 1024",
        "Connection: close", "", partial,
      ].join("\r\n"), () => socket.destroy());
    });
  });
  const unchanged = await f.download("qa.txt");
  expect(unchanged.status).toBe(200);
  expect(await unchanged.text()).toBe("EXISTING_QA_BYTES");
  expect(await readdir(f.inbox)).toEqual(["qa.txt"]);
  expect((await f.upload("qa.txt", "SUCCESSFUL_RETRY")).status).toBe(200);
  expect(await readFile(join(f.inbox, "qa.txt"), "utf8")).toBe("SUCCESSFUL_RETRY");
  expect(await readdir(f.inbox)).toEqual(["qa.txt"]);
});

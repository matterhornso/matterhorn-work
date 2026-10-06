import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, chmod } from "node:fs/promises";
import http from "node:http";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  "runtime-root": { type: "string" }, "app-url": { type: "string" },
  "workspace-id": { type: "string" }, output: { type: "string" },
} });
const root = values["runtime-root"];
const ownerWorkspace = values["workspace-id"];
const output = values.output ?? join(dirname(fileURLToPath(import.meta.url)), "account-isolation-results.json");
const observations = [];
const report = { version: 1, checkedAt: new Date().toISOString(), scope: "Two normal accounts in an isolated local runtime; console verification fixture, not production email delivery.", observations,
  safety: { adminCredentialsUsed: false, authBypass: false, firstAccountWrites: 0, inferenceRequests: 0, walletActions: 0, responseContentsPersisted: false } };
let currentCheck = "validate-isolated-target";

function requireCheck(id, condition, metadata = {}) {
  observations.push({ id, status: condition ? "passed" : "failed", ...metadata });
  assert(condition, id);
}

async function run() {
  assert(root && /^matterhorn-pr1032-functional-[A-Za-z0-9]+$/.test(basename(root)));
  assert(/^ws_web_[a-f0-9]{16}$/.test(ownerWorkspace ?? ""));
  const runtime = JSON.parse(await readFile(join(root, "runtime.json"), "utf8"));
  const origin = new URL(values["app-url"]);
  assert.equal(origin.protocol, "http:");
  assert.equal(origin.hostname, "desks-qa.localhost");
  assert.equal(origin.origin, new URL(runtime.url).origin);
  assert(!origin.username && !origin.password && origin.port);
  report.appUrl = origin.origin;
  report.firstWorkspaceId = ownerWorkspace;

  async function request(id, path, cookie, body) {
    currentCheck = id;
    const method = body === undefined ? "GET" : "POST";
    if (method === "POST") assert(["/api/auth/sign-up/email", "/api/auth/verify-email"].includes(path));
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port: origin.port, path, method,
        headers: { Host: origin.host, Origin: origin.origin, Accept: "application/json",
          ...(cookie ? { Cookie: cookie } : {}), ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } }, response => {
        const chunks = []; let bytes = 0;
        response.on("data", chunk => { bytes += chunk.length; if (bytes > 2_000_000) req.destroy(new Error("bounded-response-limit")); else chunks.push(chunk); });
        response.on("end", () => {
          let data; try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reject(new Error("non-json-response")); }
          resolve({ status: response.statusCode, data, cookie: (response.headers["set-cookie"] ?? []).map(value => value.split(";")[0]).join("; ") });
        });
      });
      req.on("error", () => reject(new Error("local-transport-failed")));
      req.setTimeout(15_000, () => req.destroy(new Error("timeout")));
      req.end(payload);
    });
  }

  const owner = JSON.parse(await readFile(join(root, "private-ui-account.json"), "utf8"));
  assert(typeof owner.cookie === "string" && owner.cookie && !/[\r\n]/.test(owner.cookie));
  const original = await request("first-account-note-readable", `/workspace/${ownerWorkspace}/notes`, owner.cookie);
  const ownerNotes = original.data.notes ?? original.data.items ?? [];
  const note = ownerNotes.find(item => item.title === "Disposable web desk QA");
  requireCheck("first-account-note-readable", original.status === 200 && Boolean(note?.id), { httpStatus: original.status, matchingNotePresent: Boolean(note?.id) });
  const firstSessions = await request("first-account-sessions-readable", `/workspace/${ownerWorkspace}/sessions`, owner.cookie);
  requireCheck("first-account-sessions-readable", firstSessions.status === 200, { httpStatus: firstSessions.status });
  const sessionId = firstSessions.data.items?.[0]?.id;

  const accountPath = join(root, "private-secondary-account.json");
  let secondary;
  try { secondary = JSON.parse(await readFile(accountPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw new Error("secondary-private-record-invalid"); }
  if (!secondary) {
    secondary = { email: `web-isolation-${randomBytes(8).toString("hex")}@example.test`, password: `Qa-${randomBytes(24).toString("base64url")}` };
    await writeFile(accountPath, JSON.stringify(secondary), { mode: 0o600, flag: "wx" });
    const signup = await request("secondary-public-signup", "/api/auth/sign-up/email", undefined,
      { email: secondary.email, password: secondary.password, name: "Disposable isolation QA", legalAccepted: true });
    requireCheck("secondary-public-signup", signup.status === 202 && signup.data.verificationRequired === true, { httpStatus: signup.status, verificationRequired: signup.data.verificationRequired === true });
  }
  if (!secondary.cookie) {
    currentCheck = "secondary-console-verification";
    const preview = JSON.parse(await readFile(join(root, "private-email-preview.json"), "utf8"));
    assert.equal(preview.to, secondary.email);
    assert.equal(preview.template, "verification");
    assert(/^\d{6}$/.test(String(preview.props?.verificationCode)));
    const verified = await request("secondary-public-verification", "/api/auth/verify-email", undefined,
      { email: secondary.email, code: String(preview.props.verificationCode) });
    requireCheck("secondary-public-verification", verified.status === 200 && verified.data.user?.emailVerified === true && Boolean(verified.cookie), { httpStatus: verified.status, emailVerified: verified.data.user?.emailVerified === true });
    secondary.cookie = verified.cookie;
    await writeFile(accountPath, JSON.stringify(secondary), { mode: 0o600 });
  }
  await chmod(accountPath, 0o600);
  const own = await request("secondary-own-workspace", "/workspaces", secondary.cookie);
  const ownWorkspace = own.data.items?.[0]?.id;
  requireCheck("secondary-own-workspace", own.status === 200 && own.data.items?.length === 1 && /^ws_web_[a-f0-9]{16}$/.test(ownWorkspace ?? "") && ownWorkspace !== ownerWorkspace,
    { httpStatus: own.status, workspaceCount: own.data.items?.length, distinctFromFirst: ownWorkspace !== ownerWorkspace });
  report.secondaryWorkspaceId = ownWorkspace;
  const denied = [
    ["cross-workspace-config", `/workspace/${ownerWorkspace}/config`],
    ["cross-workspace-notes", `/workspace/${ownerWorkspace}/notes`],
    ["cross-workspace-exact-note", `/workspace/${ownerWorkspace}/notes/${encodeURIComponent(note.id)}`],
    ["cross-workspace-sessions", `/workspace/${ownerWorkspace}/sessions`],
    ["cross-workspace-memory", `/workspace/${ownerWorkspace}/memory/search`],
    ["cross-workspace-files", `/workspace/${ownerWorkspace}/agent-files`],
    ["cross-workspace-integrations", `/workspace/${ownerWorkspace}/mcp`],
    ["cross-workspace-usage", `/workspace/${ownerWorkspace}/model-usage/status`],
    ["cross-note-through-own-workspace", `/workspace/${ownWorkspace}/notes/${encodeURIComponent(note.id)}?workspaceId=${ownerWorkspace}`],
  ];
  if (sessionId) denied.push(["cross-workspace-exact-session", `/workspace/${ownerWorkspace}/sessions/${encodeURIComponent(sessionId)}/snapshot`]);
  for (const [id, path] of denied) {
    const response = await request(id, path, secondary.cookie);
    requireCheck(id, response.status === 404 && !JSON.stringify(response.data).includes("Disposable web desk QA"), { httpStatus: response.status, denied: response.status === 404 });
  }
  for (const [id, path, key] of [
    ["secondary-notes-empty", `/workspace/${ownWorkspace}/notes`, "notes"],
    ["secondary-memory-empty", `/workspace/${ownWorkspace}/memory/search`, "records"],
    ["secondary-global-memory-empty", "/api/memory/search", "records"],
  ]) {
    const response = await request(id, path, secondary.cookie);
    const items = response.data[key] ?? response.data.items;
    requireCheck(id, response.status === 200 && Array.isArray(items) && items.length === 0, { httpStatus: response.status, count: Array.isArray(items) ? items.length : null });
  }
  const preserved = await request("first-account-note-preserved", `/workspace/${ownerWorkspace}/notes/${encodeURIComponent(note.id)}`, owner.cookie);
  requireCheck("first-account-note-preserved", preserved.status === 200 && preserved.data.note?.title === note.title && preserved.data.note?.body === note.body, { httpStatus: preserved.status, unchanged: preserved.data.note?.body === note.body });
  report.status = "passed";
}

try { await run(); } catch { report.status = "failed"; report.failedCheck = currentCheck; process.exitCode = 1; }
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));

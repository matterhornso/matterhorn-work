import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { directLoopbackBackend, readQaAuthority, reviewApprovals, sanitizedApproval } from "./review-approval.mjs";

const hostToken = "synthetic-fixture-authority-never-print";
const prompt = "synthetic-fixture-private-prompt-never-print";
const sample = { id: "approval_qa", workspaceId: "workspace_qa", action: "session.prompt",
  summary: `Submit prompt to session ses_qa ${prompt}`, paths: ["/private/fixture"],
  actor: { type: "remote", tokenHash: hostToken }, details: { parts: [{ text: prompt }], secret: hostToken } };

function fixture(items) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method });
    assert.equal(init.headers["X-Matterhorn-Host-Token"], hostToken);
    assert.equal(init.redirect, "error");
    if (init.method === "POST") {
      assert.deepEqual(JSON.parse(init.body), { reply: "allow" });
      return new Response(JSON.stringify({ ok: true, allowed: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ items }), { status: 200 });
  } };
}

test("operator inspection only accepts direct IPv4 loopback origin", () => {
  assert.equal(directLoopbackBackend("http://127.0.0.1:43123"), "http://127.0.0.1:43123");
  for (const value of ["https://127.0.0.1:43123", "http://localhost:43123", "http://example.com:43123",
    "http://127.0.0.1:43123/path", "http://secret@127.0.0.1:43123", "http://127.0.0.1:43123?secret=yes"]) {
    assert.throws(() => directLoopbackBackend(value), { code: "invalid_backend" });
  }
});

test("metadata never includes paths, summaries, prompts or actor credentials", async () => {
  const transport = fixture([sample, { ...sample, id: "other", workspaceId: "another_workspace" }]);
  const result = await reviewApprovals({ backendUrl: "http://127.0.0.1:43123", hostToken, workspaceId: "workspace_qa", ...transport });
  assert.deepEqual(result, { items: [sanitizedApproval(sample)], approved: false });
  assert.deepEqual(result.items[0].detailsKeys, ["parts", "[unrecognized]"]);
  for (const secret of [hostToken, prompt, "/private/fixture", "Submit prompt"]) assert.ok(!JSON.stringify(result).includes(secret));
  assert.deepEqual(transport.calls.map(call => call.method), ["GET"]);
});

test("inspection never approves, even with exact approval ID and arbitrary prompt-looking details", async () => {
  const transport = fixture([sample]);
  const result = await reviewApprovals({ backendUrl: "http://127.0.0.1:43123", hostToken,
    workspaceId: "workspace_qa", approvalId: "approval_qa", ...transport });
  assert.equal(result.approved, false);
  assert.equal(result.requiresManualPromptReview, true);
  assert.deepEqual(transport.calls.map(call => call.method), ["GET"]);
});

test("explicit browser-reviewed approval posts only for the exact session summary and IDs", async () => {
  const transport = fixture([{ ...sample, summary: "Submit prompt to session ses_qa" }]);
  const result = await reviewApprovals({ backendUrl: "http://127.0.0.1:43123", hostToken,
    workspaceId: "workspace_qa", approvalId: "approval_qa", sessionId: "ses_qa", approveReviewed: true, ...transport });
  assert.equal(result.approved, true);
  assert.match(result.authorization, /not automated content classification/);
  assert.deepEqual(transport.calls, [
    { url: "http://127.0.0.1:43123/approvals", method: "GET" },
    { url: "http://127.0.0.1:43123/approvals/approval_qa", method: "POST" },
  ]);
});

test("missing explicit review bindings, wrong summary, and duplicate IDs never POST", async () => {
  for (const [items, sessionId, code] of [
    [[sample], undefined, "missing_review_binding"],
    [[sample], "ses_qa", "session_mismatch"],
    [[{ ...sample, summary: "Submit prompt to session ses_other" }], "ses_qa", "session_mismatch"],
    [[sample, sample], "ses_qa", "ambiguous_approval"],
  ]) {
    const transport = fixture(items);
    await assert.rejects(reviewApprovals({ backendUrl: "http://127.0.0.1:43123", hostToken,
      workspaceId: "workspace_qa", approvalId: "approval_qa", sessionId, approveReviewed: true, ...transport }), { code });
    assert.ok(transport.calls.every(call => call.method === "GET"));
  }
});

test("unrelated, missing and non-prompt approvals cannot be approved", async () => {
  for (const [items, code] of [
    [[{ ...sample, workspaceId: "other_workspace" }], "workspace_mismatch"],
    [[{ ...sample, action: "mcp.add" }], "action_not_allowed"],
    [[], "approval_not_found"],
  ]) {
    const transport = fixture(items);
    await assert.rejects(reviewApprovals({ backendUrl: "http://127.0.0.1:43123", hostToken,
      workspaceId: "workspace_qa", approvalId: "approval_qa", sessionId: "ses_qa", approveReviewed: true, ...transport }), { code });
    assert.deepEqual(transport.calls.map(call => call.method), ["GET"]);
  }
});

test("private QA metadata binds exact root, manual approval, and direct backend without exposing authority", async () => {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-qa-review-fixture-"));
  const runtimePath = join(root, "runtime.json");
  const authorityPath = join(root, "private-operator.json");
  const runtime = { root, ready: true, hostApproval: "manual", backendUrl: "http://127.0.0.1:43123" };
  const privateToken = "a".repeat(64);
  try {
    await writeFile(runtimePath, JSON.stringify(runtime), { mode: 0o600 });
    await writeFile(authorityPath, JSON.stringify({ hostToken: privateToken }), { mode: 0o600 });
    assert.deepEqual(await readQaAuthority(root), { backendUrl: runtime.backendUrl, hostToken: privateToken });
    for (const invalid of [{ ...runtime, root: `${root}-other` }, { ...runtime, hostApproval: "auto" }]) {
      await writeFile(runtimePath, JSON.stringify(invalid));
      await assert.rejects(readQaAuthority(root), { code: "invalid_runtime" });
    }
    await writeFile(runtimePath, JSON.stringify(runtime));
    await chmod(authorityPath, 0o644);
    await assert.rejects(readQaAuthority(root), { code: "unsafe_private_metadata" });
    await chmod(authorityPath, 0o600);
    const linkedRoot = join(root, "linked-root");
    await symlink(root, linkedRoot);
    await assert.rejects(readQaAuthority(linkedRoot), { code: "invalid_root" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("untrusted response bodies and transport failures never reach diagnostics", async () => {
  for (const fetchImpl of [async () => { throw new Error(hostToken); },
    async () => new Response(prompt, { status: 401 }),
    async () => new Response(prompt, { status: 200 })]) {
    await assert.rejects(reviewApprovals({ backendUrl: "http://127.0.0.1:43123", hostToken,
      workspaceId: "workspace_qa", fetchImpl }), error => !error.message.includes(hostToken) && !error.message.includes(prompt));
  }
});

// Explicit manual operator flow for one disposable QA request. This is not a
// content safety classifier. Review the exact browser prompt BEFORE approval.
// Normal-account chat never uses host auth.
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const knownDetailKeys = new Set(["sessionId", "requestHash", "promptHash", "parts", "privacyMode", "executionMode"]);
const safeIdentifier = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);

export class ReviewError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function fail(code, message) { throw new ReviewError(code, message); }

export function directLoopbackBackend(value) {
  let url;
  try { url = new URL(value); } catch { fail("invalid_backend", "QA metadata does not contain a valid direct loopback backend."); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    fail("invalid_backend", "Only a direct http://127.0.0.1:<port> backend is accepted.");
  }
  return url.origin;
}

async function privateJson(path) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await handle.stat();
    if (!before.isFile() || before.uid !== process.getuid?.() || (before.mode & 0o077) !== 0
      || before.nlink !== 1 || before.size > 32_768) throw new Error();
    const bytes = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const next = await handle.read(bytes, length, bytes.length - length, null);
      if (!next.bytesRead) break;
      length += next.bytesRead;
    }
    const after = await handle.stat();
    if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs) throw new Error();
    const result = JSON.parse(bytes.subarray(0, length).toString("utf8"));
    if (!record(result)) throw new Error();
    return result;
  } catch {
    fail("unsafe_private_metadata", "QA metadata must be unchanged owner-only regular files; no contents were printed.");
  } finally { await handle?.close(); }
}

export async function readQaAuthority(root) {
  if (!isAbsolute(root)) fail("invalid_root", "Provide the absolute newly created QA root.");
  const stat = await lstat(root).catch(() => null);
  if (!stat?.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) {
    fail("invalid_root", "QA root must be an owner-only directory, not a symlink.");
  }
  const runtime = await privateJson(join(root, "runtime.json"));
  if (runtime.ready !== true || runtime.hostApproval !== "manual" || resolve(runtime.root ?? "") !== resolve(root)) {
    fail("invalid_runtime", "QA runtime is not ready with manual host approval and a matching root.");
  }
  const backendUrl = directLoopbackBackend(runtime.backendUrl);
  const authority = await privateJson(join(root, "private-operator.json"));
  if (typeof authority.hostToken !== "string" || !/^[a-f0-9]{64}$/.test(authority.hostToken)) {
    fail("invalid_authority", "Explicit QA operator authority is unavailable or malformed.");
  }
  return { backendUrl, hostToken: authority.hostToken };
}

export function sanitizedApproval(item) {
  return {
    id: safeIdentifier(item?.id) ? item.id : "[invalid]",
    action: item?.action === "session.prompt" ? "session.prompt" : "[other]",
    workspaceId: safeIdentifier(item?.workspaceId) ? item.workspaceId : "[invalid]",
    actorType: item?.actor?.type === "remote" || item?.actor?.type === "host" ? item.actor.type : "[unknown]",
    detailsKeys: record(item?.details)
      ? [...new Set(Object.keys(item.details).map(key => knownDetailKeys.has(key) ? key : "[unrecognized]"))]
      : [],
  };
}

export async function reviewApprovals({ backendUrl, hostToken, workspaceId, approvalId, sessionId,
  approveReviewed = false, fetchImpl = fetch }) {
  const origin = directLoopbackBackend(backendUrl);
  if (!safeIdentifier(workspaceId) || (approvalId !== undefined && !safeIdentifier(approvalId))
    || (sessionId !== undefined && !safeIdentifier(sessionId))) {
    fail("invalid_identifier", "Workspace and approval IDs must be exact safe identifiers.");
  }
  if (approveReviewed && (!approvalId || !sessionId)) {
    fail("missing_review_binding", "Manual approval requires the exact approval, workspace and browser-reviewed session IDs.");
  }
  let response;
  try {
    response = await fetchImpl(`${origin}/approvals`, {
      method: "GET", headers: { "X-Matterhorn-Host-Token": hostToken },
      redirect: "error", signal: AbortSignal.timeout(5_000),
    });
  } catch { fail("approval_read_failed", "The direct QA approval endpoint could not be read; no credentials were printed."); }
  if (!response.ok) fail("approval_read_failed", "The QA approval endpoint rejected operator inspection.");
  let payload;
  try {
    const body = await response.text();
    if (body.length > 65_536) throw new Error();
    payload = JSON.parse(body);
  } catch { fail("invalid_approvals", "The QA approval response was unreadable or too large."); }
  if (!record(payload) || !Array.isArray(payload.items)) fail("invalid_approvals", "The QA approval response has no approval list.");
  const items = payload.items.filter(item => record(item) && item.workspaceId === workspaceId);
  const inspected = items.map(sanitizedApproval);
  if (approvalId === undefined) return { items: inspected, approved: false };
  const matches = payload.items.filter(item => record(item) && item.id === approvalId);
  const selected = matches[0];
  if (!selected) fail("approval_not_found", "That exact pending QA approval was not found; it may have expired.");
  if (matches.length !== 1) fail("ambiguous_approval", "The exact approval ID is not unique; nothing was approved.");
  if (selected.workspaceId !== workspaceId) fail("workspace_mismatch", "That approval belongs to a different workspace.");
  if (selected.action !== "session.prompt") fail("action_not_allowed", "Only a reviewed session.prompt may be considered by this helper.");
  if (!approveReviewed) return { items: [sanitizedApproval(selected)], approved: false, requiresManualPromptReview: true };
  if (selected.summary !== `Submit prompt to session ${sessionId}`) {
    fail("session_mismatch", "The approval summary does not exactly match the browser-reviewed QA session; nothing was approved.");
  }
  // The API does not expose prompt contents or an immutable digest. The explicit
  // approve-reviewed flag records an OPERATOR decision after browser review;
  // exact IDs and summary correlate that decision, not prove public-only data.
  let approved;
  try {
    approved = await fetchImpl(`${origin}/approvals/${encodeURIComponent(approvalId)}`, {
      method: "POST", headers: { "X-Matterhorn-Host-Token": hostToken, "Content-Type": "application/json" },
      body: JSON.stringify({ reply: "allow" }), redirect: "error", signal: AbortSignal.timeout(5_000),
    });
  } catch { fail("approval_outcome_unknown", "The manual approval response was lost. Do not blindly retry; inspect the normal-account chat and pending approvals."); }
  if (!approved.ok) fail("approval_rejected", "The exact manual approval was rejected or expired. Inspect the normal-account chat before retrying.");
  let confirmation;
  try { confirmation = await approved.json(); } catch { fail("approval_outcome_unknown", "The manual approval response was unreadable. Inspect the normal-account chat before retrying."); }
  if (!record(confirmation) || confirmation.ok !== true || confirmation.allowed !== true) {
    fail("approval_outcome_unknown", "The server did not confirm the manual approval. Inspect the normal-account chat before retrying.");
  }
  return { approved: true, approvalId, workspaceId, sessionId, authorization: "explicit operator browser review; not automated content classification" };
}

async function main() {
  const { values } = parseArgs({ options: {
    "qa-root": { type: "string" }, "workspace-id": { type: "string" }, "approval-id": { type: "string" },
    "session-id": { type: "string" }, "approve-reviewed": { type: "boolean", default: false },
  } });
  if (!values["qa-root"] || !values["workspace-id"]) fail("missing_arguments", "Required: --qa-root <absolute-root> --workspace-id <exact-id>; optional --approval-id <exact-id>.");
  const authority = await readQaAuthority(values["qa-root"]);
  const result = await reviewApprovals({ ...authority, workspaceId: values["workspace-id"], approvalId: values["approval-id"],
    sessionId: values["session-id"], approveReviewed: values["approve-reviewed"] });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(JSON.stringify(error instanceof ReviewError
      ? { ok: false, code: error.code, message: error.message }
      : { ok: false, code: "review_failed", message: "Operator review failed; no private metadata was printed." }));
    process.exitCode = 1;
  });
}

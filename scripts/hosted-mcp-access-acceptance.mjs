#!/usr/bin/env node
import { isIP } from "node:net";
import process from "node:process";
import { pathToFileURL } from "node:url";

const REPORT_VERSION = "matterhorn.hosted-mcp-access-acceptance.v1";
const SESSION_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ACCESS_TOKEN_PATTERN = /^mhmcp_[A-Za-z0-9_-]{43}$/;
const CREDENTIAL_ID_PATTERN = /^mcp_[0-9a-f]{32}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const MCP_PROTOCOL_VERSION = "2025-11-25";
const GUARDED_MCP_TOOL_NAMES = [
  "matterhorn_status",
  "matterhorn_list_workspaces",
  "matterhorn_create_session",
  "matterhorn_list_sessions",
  "matterhorn_get_session",
  "matterhorn_get_session_messages",
  "matterhorn_submit_session_prompt",
  "matterhorn_get_session_status",
  "matterhorn_watch_session_events",
  "matterhorn_get_session_snapshot",
  "matterhorn_delete_session",
];

class AcceptanceFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new AcceptanceFailure(code);
}

function safeFailureCode(error) {
  return error instanceof AcceptanceFailure ? error.code : "unexpected_failure";
}

function canonicalHostedOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("origin_invalid");
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== "/" && url.pathname !== "")
    || (url.port && url.port !== "443")
    || isIP(url.hostname) !== 0
    || url.hostname === "localhost"
    || url.hostname.endsWith(".localhost")
    || url.hostname.endsWith(".local")
  ) fail("origin_invalid");
  return url.origin;
}

function validateSession(value) {
  if (!SESSION_PATTERN.test(value)) fail("account_session_invalid");
  return value;
}

function validateExpectedCommit(value) {
  const normalized = value.trim().toLowerCase();
  if (!COMMIT_PATTERN.test(normalized)) fail("expected_commit_invalid");
  return normalized;
}

async function readBoundedJson(response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) fail("response_content_type_invalid");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    fail("response_too_large");
  }
  if (!response.body) fail("response_body_missing");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        fail("response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("response_encoding_invalid");
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail("response_shape_invalid");
    }
    return parsed;
  } catch (error) {
    if (error instanceof AcceptanceFailure) throw error;
    fail("response_json_invalid");
  }
}

async function requestJson({
  fetchImpl,
  origin,
  path,
  method = "GET",
  session,
  accessToken,
  body,
  accept = "application/json",
  extraHeaders = {},
}) {
  if (session && accessToken) fail("request_auth_ambiguous");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = {
    Accept: accept,
    "Cache-Control": "no-store",
    ...extraHeaders,
  };
  if (session) headers.Cookie = `mh_session=${session}`;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const response = await fetchImpl(new URL(path, `${origin}/`), {
      method,
      headers,
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.redirected) fail("redirect_rejected");
    return {
      status: response.status,
      headers: response.headers,
      payload: await readBoundedJson(response),
    };
  } catch (error) {
    if (error instanceof AcceptanceFailure) throw error;
    fail(error?.name === "AbortError" ? "request_timeout" : "request_failed");
  } finally {
    clearTimeout(timeout);
  }
}

async function requestMcp({
  fetchImpl,
  origin,
  accessToken,
  id,
  method,
  params,
  protocolVersion = MCP_PROTOCOL_VERSION,
}) {
  return requestJson({
    fetchImpl,
    origin,
    path: "/mcp/guarded",
    method: "POST",
    accessToken,
    accept: "application/json, text/event-stream",
    extraHeaders: { "MCP-Protocol-Version": protocolVersion },
    body: {
      jsonrpc: "2.0",
      id,
      method,
      ...(params === undefined ? {} : { params }),
    },
  });
}

function expectMcpResult(response, id) {
  expectStatus(response, 200);
  if (response.payload.jsonrpc !== "2.0" || response.payload.id !== id || response.payload.error) {
    fail("mcp_response_invalid");
  }
  return response.payload.result;
}

function parseMcpToolText(result) {
  const text = result?.content?.[0]?.text;
  if (typeof text !== "string" || text.length > MAX_RESPONSE_BYTES) fail("mcp_tool_result_invalid");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("mcp_tool_result_invalid");
    return value;
  } catch (error) {
    if (error instanceof AcceptanceFailure) throw error;
    fail("mcp_tool_result_invalid");
  }
}

function expectStatus(response, status) {
  if (response.status !== status) fail(`unexpected_status_${response.status}`);
}

function expectDenied(response, status, code) {
  expectStatus(response, status);
  if (response.payload.code !== code) fail("denial_code_invalid");
}

function stringId(value, pattern, code) {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value;
}

function containsSensitiveAccessMaterial(value, accessToken) {
  const stack = [value];
  while (stack.length > 0) {
    const entry = stack.pop();
    if (Array.isArray(entry)) {
      stack.push(...entry);
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    for (const [key, nested] of Object.entries(entry)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normalized === "accesstoken" || normalized === "token" || nested === accessToken) {
        return true;
      }
      stack.push(nested);
    }
  }
  return false;
}

function alternateToken(token) {
  const final = token.at(-1);
  return `${token.slice(0, -1)}${final === "A" ? "B" : "A"}`;
}

export function parseHostedMcpAcceptanceArgs(argv) {
  const config = { origin: "", expectedCommit: "", strict: false, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail("argument_value_missing");
      index += 1;
      return value;
    };
    if (argument === "--origin") config.origin = next();
    else if (argument === "--expected-commit") config.expectedCommit = next();
    else if (argument === "--strict") config.strict = true;
    else if (argument === "--json") config.json = true;
    else if (argument === "--help" || argument === "-h") config.help = true;
    else fail("argument_unknown");
  }
  if (!config.help) {
    config.origin = canonicalHostedOrigin(config.origin);
    config.expectedCommit = validateExpectedCommit(config.expectedCommit);
  }
  return config;
}

export async function runHostedMcpAccessAcceptance({
  origin,
  expectedCommit,
  accountASession,
  accountBSession,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
}) {
  const safeOrigin = canonicalHostedOrigin(origin);
  const safeExpectedCommit = validateExpectedCommit(expectedCommit);
  const sessionA = validateSession(accountASession);
  const sessionB = validateSession(accountBSession);
  if (sessionA === sessionB) fail("accounts_must_be_distinct");
  if (typeof fetchImpl !== "function") fail("fetch_unavailable");

  const checks = [];
  const state = {
    readinessPassed: false,
    observedCommit: null,
    credentialA: null,
    credentialB: null,
    workspaceA: null,
    workspaceB: null,
    sessionId: null,
    sessionDeleted: false,
    credentialARevoked: false,
    credentialBRevoked: false,
  };
  const record = async (id, summary, callback) => {
    try {
      await callback();
      checks.push({ id, status: "pass", summary });
    } catch (error) {
      checks.push({ id, status: "fail", summary, reason: safeFailureCode(error) });
    }
  };
  const need = (value) => {
    if (!value) fail("dependency_unavailable");
    return value;
  };

  await record("readiness", "Invite-only MCP access and its durable integrity boundary are ready on the exact release.", async () => {
    const response = await requestJson({ fetchImpl, origin: safeOrigin, path: "/health/ready" });
    expectStatus(response, 200);
    const observed = response.headers.get("x-matterhorn-build-commit")?.trim().toLowerCase() ?? "";
    state.observedCommit = COMMIT_PATTERN.test(observed) ? observed : null;
    if (state.observedCommit !== safeExpectedCommit) fail("build_commit_mismatch");
    if (
      response.payload.ready !== true
      || response.payload.checks?.hostedMcpAccessMode !== "invite"
      || response.payload.checks?.hostedMcpAccessIntegrityReady !== true
    ) fail("hosted_mcp_readiness_failed");
    state.readinessPassed = true;
  });

  const issueCredential = async (session, label) => {
    const response = await requestJson({
      fetchImpl,
      origin: safeOrigin,
      path: "/api/auth/account/mcp-access",
      method: "POST",
      session,
      body: { label, expiresInDays: 1 },
    });
    expectStatus(response, 201);
    const credential = response.payload.credential;
    if (!credential || typeof credential !== "object" || Array.isArray(credential)) {
      fail("credential_shape_invalid");
    }
    return {
      id: stringId(credential.id, CREDENTIAL_ID_PATTERN, "credential_id_invalid"),
      accessToken: stringId(credential.accessToken, ACCESS_TOKEN_PATTERN, "credential_token_invalid"),
    };
  };

  await record("issue_two_keys", "Two distinct invited accounts can issue separate short-lived keys.", async () => {
    need(state.readinessPassed);
    state.credentialA = await issueCredential(sessionA, "Hosted acceptance A");
    state.credentialB = await issueCredential(sessionB, "Hosted acceptance B");
    if (state.credentialA.accessToken === state.credentialB.accessToken) fail("credential_collision");
  });

  await record("hash_only_listing", "Account key listings contain metadata only and never return bearer material.", async () => {
    for (const [session, credential] of [
      [sessionA, need(state.credentialA)],
      [sessionB, need(state.credentialB)],
    ]) {
      const response = await requestJson({
        fetchImpl,
        origin: safeOrigin,
        path: "/api/auth/account/mcp-access",
        session,
      });
      expectStatus(response, 200);
      if (response.payload.mode !== "invite" || response.payload.eligible !== true) {
        fail("account_not_invited");
      }
      if (
        !Array.isArray(response.payload.credentials)
        || !response.payload.credentials.some((item) => item?.id === credential.id)
        || containsSensitiveAccessMaterial(response.payload, credential.accessToken)
      ) fail("credential_listing_invalid");
    }
  });

  await record("workspace_isolation", "Each key sees exactly its own workspace and the two tenant scopes differ.", async () => {
    const credentialA = need(state.credentialA);
    const credentialB = need(state.credentialB);
    const [responseA, responseB] = await Promise.all([
      requestJson({ fetchImpl, origin: safeOrigin, path: "/workspaces", accessToken: credentialA.accessToken }),
      requestJson({ fetchImpl, origin: safeOrigin, path: "/workspaces", accessToken: credentialB.accessToken }),
    ]);
    expectStatus(responseA, 200);
    expectStatus(responseB, 200);
    const itemsA = responseA.payload.items;
    const itemsB = responseB.payload.items;
    if (!Array.isArray(itemsA) || itemsA.length !== 1 || !Array.isArray(itemsB) || itemsB.length !== 1) {
      fail("workspace_listing_invalid");
    }
    state.workspaceA = typeof itemsA[0]?.id === "string" ? itemsA[0].id : null;
    state.workspaceB = typeof itemsB[0]?.id === "string" ? itemsB[0].id : null;
    if (!state.workspaceA || !state.workspaceB || state.workspaceA === state.workspaceB) {
      fail("workspace_scope_invalid");
    }
  });

  await record("mcp_protocol_and_tools", "The hosted endpoint completes the current MCP handshake and exposes exactly the 11 guarded chat tools.", async () => {
    const credentialA = need(state.credentialA);
    const initialized = await requestMcp({
      fetchImpl,
      origin: safeOrigin,
      accessToken: credentialA.accessToken,
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "matterhorn-hosted-acceptance", version: "1.0.0" },
      },
    });
    const initialization = expectMcpResult(initialized, 1);
    if (
      initialization?.protocolVersion !== MCP_PROTOCOL_VERSION
      || initialization?.serverInfo?.name !== "matterhorn-hosted-guarded-mcp"
      || !initialization?.capabilities?.tools
    ) fail("mcp_initialize_invalid");

    const listed = await requestMcp({
      fetchImpl,
      origin: safeOrigin,
      accessToken: credentialA.accessToken,
      id: 2,
      method: "tools/list",
      params: {},
    });
    const tools = expectMcpResult(listed, 2)?.tools;
    const names = Array.isArray(tools) ? tools.map((tool) => tool?.name) : [];
    if (JSON.stringify(names) !== JSON.stringify(GUARDED_MCP_TOOL_NAMES)) fail("mcp_tool_catalog_invalid");
    if (names.some((name) => /(?:sign|relay|broadcast|wallet|shell|config|approval)/i.test(String(name)))) {
      fail("mcp_forbidden_authority_advertised");
    }
  });

  await record("mcp_workspace_isolation", "The MCP tools resolve each bearer key to only its bound account workspace.", async () => {
    for (const [credential, expectedWorkspace] of [
      [need(state.credentialA), need(state.workspaceA)],
      [need(state.credentialB), need(state.workspaceB)],
    ]) {
      const response = await requestMcp({
        fetchImpl,
        origin: safeOrigin,
        accessToken: credential.accessToken,
        id: 3,
        method: "tools/call",
        params: { name: "matterhorn_list_workspaces", arguments: {} },
      });
      const result = parseMcpToolText(expectMcpResult(response, 3));
      if (!Array.isArray(result.items) || result.items.length !== 1 || result.items[0]?.id !== expectedWorkspace) {
        fail("mcp_workspace_scope_invalid");
      }
    }
  });

  await record("mcp_cross_account_denial", "A guarded MCP tool cannot substitute another account's workspace.", async () => {
    const credentialA = need(state.credentialA);
    const response = await requestMcp({
      fetchImpl,
      origin: safeOrigin,
      accessToken: credentialA.accessToken,
      id: 4,
      method: "tools/call",
      params: {
        name: "matterhorn_list_sessions",
        arguments: { workspaceId: need(state.workspaceB) },
      },
    });
    const result = expectMcpResult(response, 4);
    if (result?.isError !== true || typeof result?.content?.[0]?.text !== "string") {
      fail("mcp_cross_account_denial_invalid");
    }
    if (result.content[0].text.includes(need(state.workspaceB))) fail("mcp_tenant_identifier_leaked");
  });

  await record("session_create", "A guarded key can create one workspace-scoped chat.", async () => {
    const workspaceA = need(state.workspaceA);
    const credentialA = need(state.credentialA);
    const response = await requestJson({
      fetchImpl,
      origin: safeOrigin,
      path: `/workspace/${encodeURIComponent(workspaceA)}/sessions`,
      method: "POST",
      accessToken: credentialA.accessToken,
      body: { title: "Hosted MCP acceptance" },
    });
    expectStatus(response, 201);
    const sessionId = response.payload.item?.id;
    if (typeof sessionId !== "string" || sessionId.length < 1 || sessionId.length > 128 || sessionId.includes("/")) {
      fail("chat_session_invalid");
    }
    state.sessionId = sessionId;
  });

  await record("guarded_session_reads", "The key can read only the bounded chat, message, status, and snapshot surfaces.", async () => {
    const workspaceA = need(state.workspaceA);
    const sessionId = need(state.sessionId);
    const credentialA = need(state.credentialA);
    const base = `/workspace/${encodeURIComponent(workspaceA)}/sessions/${encodeURIComponent(sessionId)}`;
    for (const path of [
      `/workspace/${encodeURIComponent(workspaceA)}/sessions`,
      base,
      `${base}/messages`,
      `${base}/status`,
      `${base}/snapshot`,
    ]) {
      const response = await requestJson({ fetchImpl, origin: safeOrigin, path, accessToken: credentialA.accessToken });
      expectStatus(response, 200);
    }
  });

  await record("cross_account_denial", "Neither key can enumerate or open the other account's chats.", async () => {
    const workspaceA = need(state.workspaceA);
    const workspaceB = need(state.workspaceB);
    const sessionId = need(state.sessionId);
    const credentialA = need(state.credentialA);
    const credentialB = need(state.credentialB);
    const attempts = [
      requestJson({
        fetchImpl,
        origin: safeOrigin,
        path: `/workspace/${encodeURIComponent(workspaceB)}/sessions`,
        accessToken: credentialA.accessToken,
      }),
      requestJson({
        fetchImpl,
        origin: safeOrigin,
        path: `/workspace/${encodeURIComponent(workspaceA)}/sessions/${encodeURIComponent(sessionId)}`,
        accessToken: credentialB.accessToken,
      }),
    ];
    for (const response of await Promise.all(attempts)) {
      expectDenied(response, 404, "workspace_not_found");
    }
  });

  await record("forbidden_control_surfaces", "Host, raw OpenCode, account, file, compact, preflight, and mode controls stay unavailable.", async () => {
    const workspaceA = need(state.workspaceA);
    const sessionId = need(state.sessionId);
    const credentialA = need(state.credentialA);
    const sessionBase = `/workspace/${encodeURIComponent(workspaceA)}/sessions/${encodeURIComponent(sessionId)}`;
    const attempts = [
      ["GET", "/tokens", undefined],
      ["GET", "/api/auth/account/security", undefined],
      ["GET", "/opencode/global/health", undefined],
      ["GET", `/workspace/${encodeURIComponent(workspaceA)}/agent-files`, undefined],
      ["POST", `${sessionBase}/compact`, {}],
      ["POST", `${sessionBase}/messages/preflight`, {}],
      ["POST", `${sessionBase}/execution-mode`, { mode: "work" }],
    ];
    for (const [method, path, body] of attempts) {
      const response = await requestJson({
        fetchImpl,
        origin: safeOrigin,
        path,
        method,
        accessToken: credentialA.accessToken,
        ...(body === undefined ? {} : { body }),
      });
      expectDenied(response, 403, "hosted_mcp_operation_not_allowed");
    }
  });

  await record("tampered_key_denial", "A one-character bearer-token mutation is rejected as unauthenticated.", async () => {
    const credentialA = need(state.credentialA);
    const response = await requestJson({
      fetchImpl,
      origin: safeOrigin,
      path: "/workspaces",
      accessToken: alternateToken(credentialA.accessToken),
    });
    expectDenied(response, 401, "unauthorized");
  });

  await record("session_cleanup", "The acceptance chat can be deleted through the same bounded key.", async () => {
    const workspaceA = need(state.workspaceA);
    const sessionId = need(state.sessionId);
    const credentialA = need(state.credentialA);
    const response = await requestJson({
      fetchImpl,
      origin: safeOrigin,
      path: `/workspace/${encodeURIComponent(workspaceA)}/sessions/${encodeURIComponent(sessionId)}`,
      method: "DELETE",
      accessToken: credentialA.accessToken,
    });
    expectStatus(response, 200);
    state.sessionDeleted = true;
  });

  await record("immediate_revocation", "Revoking the first key immediately removes all hosted access.", async () => {
    const credentialA = need(state.credentialA);
    const revoked = await requestJson({
      fetchImpl,
      origin: safeOrigin,
      path: `/api/auth/account/mcp-access/${encodeURIComponent(credentialA.id)}`,
      method: "DELETE",
      session: sessionA,
    });
    expectStatus(revoked, 200);
    state.credentialARevoked = true;
    const denied = await requestJson({
      fetchImpl,
      origin: safeOrigin,
      path: "/workspaces",
      accessToken: credentialA.accessToken,
    });
    expectDenied(denied, 401, "unauthorized");
    const mcpDenied = await requestMcp({
      fetchImpl,
      origin: safeOrigin,
      accessToken: credentialA.accessToken,
      id: 5,
      method: "tools/list",
      params: {},
    });
    expectDenied(mcpDenied, 401, "unauthorized");
  });

  await record("independent_revocation", "Revoking one account's key does not affect the other account's valid key.", async () => {
    const credentialB = need(state.credentialB);
    const response = await requestJson({
      fetchImpl,
      origin: safeOrigin,
      path: "/workspaces",
      accessToken: credentialB.accessToken,
    });
    expectStatus(response, 200);
  });

  await record("cleanup", "All temporary keys and chats are removed after acceptance.", async () => {
    const failures = [];
    if (state.sessionId && state.workspaceA && !state.sessionDeleted) {
      const response = await requestJson({
        fetchImpl,
        origin: safeOrigin,
        path: `/workspace/${encodeURIComponent(state.workspaceA)}/sessions/${encodeURIComponent(state.sessionId)}`,
        method: "DELETE",
        session: sessionA,
      });
      if (response.status !== 200 && response.status !== 404) failures.push("session");
    }
    for (const [session, credential, revokedKey] of [
      [sessionA, state.credentialA, "credentialARevoked"],
      [sessionB, state.credentialB, "credentialBRevoked"],
    ]) {
      if (!credential || state[revokedKey]) continue;
      const response = await requestJson({
        fetchImpl,
        origin: safeOrigin,
        path: `/api/auth/account/mcp-access/${encodeURIComponent(credential.id)}`,
        method: "DELETE",
        session,
      });
      if (response.status !== 200 && response.status !== 404) failures.push(revokedKey);
      else state[revokedKey] = true;
    }
    if (failures.length > 0) fail("cleanup_failed");
  });

  const failures = checks.filter((check) => check.status === "fail");
  return {
    version: REPORT_VERSION,
    ok: failures.length === 0,
    checkedAt: new Date(now()).toISOString(),
    origin: safeOrigin,
    expectedCommit: safeExpectedCommit,
    observedCommit: state.observedCommit,
    checks,
    failures,
  };
}

function help() {
  return [
    "Matterhorn hosted MCP access acceptance",
    "",
    "Exercises two invited accounts, exact release identity, the remote MCP handshake and tool",
    "catalog, guarded routes, tenant isolation, tamper denial, immediate revocation, and cleanup.",
    "It never prints session or access tokens.",
    "",
    "Set these secrets in the invoking process environment:",
    "  MATTERHORN_HOSTED_MCP_ACCEPTANCE_ACCOUNT_A_SESSION",
    "  MATTERHORN_HOSTED_MCP_ACCEPTANCE_ACCOUNT_B_SESSION",
    "",
    "Usage:",
    "  pnpm accept:hosted-mcp-access -- --origin https://candidate.example --expected-commit <40-char-sha> --strict --json",
  ].join("\n");
}

function renderHuman(report) {
  const passed = report.checks.length - report.failures.length;
  const lines = [`${report.ok ? "PASS" : "FAIL"}: ${passed}/${report.checks.length} hosted MCP access checks passed.`];
  for (const failure of report.failures) lines.push(`- ${failure.id}: ${failure.reason}`);
  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const config = parseHostedMcpAcceptanceArgs(process.argv.slice(2));
    if (config.help) {
      process.stdout.write(`${help()}\n`);
      return;
    }
    const accountASession = process.env.MATTERHORN_HOSTED_MCP_ACCEPTANCE_ACCOUNT_A_SESSION?.trim() ?? "";
    const accountBSession = process.env.MATTERHORN_HOSTED_MCP_ACCEPTANCE_ACCOUNT_B_SESSION?.trim() ?? "";
    const report = await runHostedMcpAccessAcceptance({
      origin: config.origin,
      expectedCommit: config.expectedCommit,
      accountASession,
      accountBSession,
    });
    process.stdout.write(config.json ? `${JSON.stringify(report, null, 2)}\n` : renderHuman(report));
    if (config.strict && !report.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${safeFailureCode(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

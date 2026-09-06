#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  parseHostedMcpAcceptanceArgs,
  runHostedMcpAccessAcceptance,
} from "./hosted-mcp-access-acceptance.mjs";

const COMMIT = "a".repeat(40);
const SESSION_A = "A".repeat(43);
const SESSION_B = "B".repeat(43);
const TOKEN_A = `mhmcp_${"C".repeat(43)}`;
const TOKEN_B = `mhmcp_${"D".repeat(43)}`;
const ID_A = `mcp_${"a".repeat(32)}`;
const ID_B = `mcp_${"b".repeat(32)}`;

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function fakeHostedService(faults = {}) {
  const credentials = new Map();
  const sessionOwners = new Map([[SESSION_A, "a"], [SESSION_B, "b"]]);
  const account = {
    a: { workspace: "ws_account_a", id: ID_A, token: TOKEN_A },
    b: { workspace: "ws_account_b", id: ID_B, token: TOKEN_B },
  };
  const state = { sessionDeleted: false, revoked: new Set(), calls: [] };

  function ownerFromCookie(headers) {
    const cookie = headers.get("cookie") ?? "";
    const session = cookie.match(/(?:^|;\s*)mh_session=([^;]+)/)?.[1] ?? "";
    return sessionOwners.get(session) ?? null;
  }

  function ownerFromBearer(headers) {
    const token = (headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
    const item = credentials.get(token);
    return item && !state.revoked.has(item.id) ? item.owner : null;
  }

  function allowed(method, pathname) {
    if (method === "GET" && (pathname === "/health/ready" || pathname === "/workspaces")) return true;
    if (/^\/workspace\/[^/]+\/sessions$/.test(pathname)) return method === "GET" || method === "POST";
    const session = pathname.match(/^\/workspace\/[^/]+\/sessions\/[^/]+(?:\/(messages|status|snapshot|events))?$/);
    if (!session) return false;
    if (!session[1]) return method === "GET" || method === "DELETE";
    if (session[1] === "messages") return method === "GET" || method === "POST";
    return method === "GET";
  }

  const fetchImpl = async (input, init = {}) => {
    const url = input instanceof URL ? input : new URL(input);
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    state.calls.push({ method, pathname: url.pathname, redirect: init.redirect });

    if (url.pathname === "/health/ready") {
      return json({
        ready: true,
        checks: {
          hostedMcpAccessMode: faults.readinessOff ? "off" : "invite",
          hostedMcpAccessIntegrityReady: true,
        },
      }, 200, { "X-Matterhorn-Build-Commit": faults.wrongCommit ? "b".repeat(40) : COMMIT });
    }

    const cookieOwner = ownerFromCookie(headers);
    if (url.pathname === "/api/auth/account/mcp-access") {
      if (!cookieOwner) return json({ code: "unauthorized" }, 401);
      const value = account[cookieOwner];
      if (method === "POST") {
        credentials.set(value.token, { owner: cookieOwner, id: value.id });
        return json({
          credential: {
            id: value.id,
            label: `Hosted acceptance ${cookieOwner.toUpperCase()}`,
            activeOrgId: `org_${cookieOwner.repeat(32)}`,
            createdAt: 1,
            expiresAt: 2,
            lastUsedAt: null,
            accessToken: value.token,
          },
        }, 201);
      }
      const listed = [{
        id: value.id,
        label: `Hosted acceptance ${cookieOwner.toUpperCase()}`,
        activeOrgId: `org_${cookieOwner.repeat(32)}`,
        createdAt: 1,
        expiresAt: 2,
        lastUsedAt: null,
        ...(faults.listingTokenLeak ? { accessToken: value.token } : {}),
      }];
      return json({ mode: "invite", eligible: true, maxExpiresInDays: 30, credentials: listed });
    }
    const credentialMatch = url.pathname.match(/^\/api\/auth\/account\/mcp-access\/(mcp_[0-9a-f]{32})$/);
    if (credentialMatch && method === "DELETE") {
      if (!cookieOwner) return json({ code: "unauthorized" }, 401);
      const value = account[cookieOwner];
      if (credentialMatch[1] !== value.id || state.revoked.has(value.id)) {
        return json({ code: "hosted_mcp_access_not_found" }, 404);
      }
      state.revoked.add(value.id);
      return json({ ok: true, revoked: true });
    }

    const bearerOwner = ownerFromBearer(headers);
    if (!bearerOwner) return json({ code: "unauthorized" }, 401);
    if (!allowed(method, url.pathname) && !faults.allowForbidden) {
      return json({ code: "hosted_mcp_operation_not_allowed" }, 403);
    }
    const value = account[bearerOwner];
    if (url.pathname === "/workspaces") {
      return json({ items: [{ id: value.workspace }], workspaces: [{ id: value.workspace }], activeId: value.workspace });
    }
    const workspaceMatch = url.pathname.match(/^\/workspace\/([^/]+)/);
    if (workspaceMatch && workspaceMatch[1] !== value.workspace && !faults.crossAccountLeak) {
      return json({ code: "workspace_not_found" }, 404);
    }
    if (!allowed(method, url.pathname) && faults.allowForbidden) return json({ ok: true });
    if (/^\/workspace\/[^/]+\/sessions$/.test(url.pathname) && method === "POST") {
      return json({ item: { id: "ses_hosted_acceptance" } }, 201);
    }
    if (/^\/workspace\/[^/]+\/sessions\/[^/]+$/.test(url.pathname) && method === "DELETE") {
      state.sessionDeleted = true;
      return json({ ok: true });
    }
    if (url.pathname.endsWith("/messages")) return json({ items: [] });
    if (url.pathname.endsWith("/status")) return json({ item: { status: "idle" } });
    if (url.pathname.endsWith("/snapshot")) return json({ item: { messages: [], status: "idle" } });
    if (/^\/workspace\/[^/]+\/sessions(?:\/[^/]+)?$/.test(url.pathname)) {
      return json(url.pathname.endsWith("sessions") ? { items: [] } : { item: { id: "ses_hosted_acceptance" } });
    }
    return json({ code: "not_found" }, 404);
  };

  return { fetchImpl, state };
}

async function run(faults = {}) {
  const fake = fakeHostedService(faults);
  const report = await runHostedMcpAccessAcceptance({
    origin: "https://candidate.example",
    expectedCommit: COMMIT,
    accountASession: SESSION_A,
    accountBSession: SESSION_B,
    fetchImpl: fake.fetchImpl,
    now: () => Date.parse("2026-09-06T00:00:00.000Z"),
  });
  return { report, state: fake.state };
}

assert.deepEqual(parseHostedMcpAcceptanceArgs([
  "--origin", "https://candidate.example",
  "--expected-commit", COMMIT,
  "--strict",
  "--json",
]), {
  origin: "https://candidate.example",
  expectedCommit: COMMIT,
  strict: true,
  json: true,
  help: false,
});
assert.throws(
  () => parseHostedMcpAcceptanceArgs(["--origin", "https://candidate.example", "--access-token", TOKEN_A]),
  /argument_unknown/,
);
assert.throws(
  () => parseHostedMcpAcceptanceArgs(["--origin", "http://candidate.example", "--expected-commit", COMMIT]),
  /origin_invalid/,
);

const passing = await run();
assert.equal(passing.report.ok, true, JSON.stringify(passing.report.failures));
assert.equal(passing.report.checks.length, 13);
assert.equal(passing.report.observedCommit, COMMIT);
assert.equal(passing.state.sessionDeleted, true);
assert.deepEqual([...passing.state.revoked].sort(), [ID_A, ID_B]);
assert.ok(passing.state.calls.every((call) => call.redirect === "error"));
const serialized = JSON.stringify(passing.report);
for (const secret of [SESSION_A, SESSION_B, TOKEN_A, TOKEN_B, "ws_account_a", "ws_account_b", "ses_hosted_acceptance"]) {
  assert.equal(serialized.includes(secret), false);
}

const crossTenant = await run({ crossAccountLeak: true });
assert.equal(crossTenant.report.ok, false);
assert.ok(crossTenant.report.failures.some((item) => item.id === "cross_account_denial"));
assert.ok(crossTenant.report.checks.some((item) => item.id === "cleanup" && item.status === "pass"));

const broadAuthority = await run({ allowForbidden: true });
assert.equal(broadAuthority.report.ok, false);
assert.ok(broadAuthority.report.failures.some((item) => item.id === "forbidden_control_surfaces"));

const listingLeak = await run({ listingTokenLeak: true });
assert.equal(listingLeak.report.ok, false);
assert.ok(listingLeak.report.failures.some((item) => item.id === "hash_only_listing"));
assert.equal(JSON.stringify(listingLeak.report).includes(TOKEN_A), false);

const wrongRelease = await run({ wrongCommit: true });
assert.equal(wrongRelease.report.ok, false);
assert.ok(wrongRelease.report.failures.some((item) => item.id === "readiness"));
assert.equal(wrongRelease.state.revoked.size, 0);

const dormant = await run({ readinessOff: true });
assert.equal(dormant.report.ok, false);
assert.ok(dormant.report.failures.some((item) => item.id === "readiness"));
assert.equal(dormant.state.revoked.size, 0);

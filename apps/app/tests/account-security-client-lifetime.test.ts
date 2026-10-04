import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createDenClient } from "../src/app/lib/den";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { accountClientState, AccountStateChangedError, runAccountScopedRequest } from "../src/app/lib/account-client-state";

type Client = ReturnType<typeof createDenClient>;
const accountExport = {
  version: "matterhorn.account-export.v1", generatedAt: "2026-10-04T00:00:00.000Z",
  filename: "matterhorn-account-2026-10-04.json",
  account: { id: "fixture-a", email: "a@example.invalid", name: null, emailVerified: true, createdAt: "2026-10-01T00:00:00.000Z" },
  legalAcceptance: null, organizations: [], security: { activeSessionCount: 1 },
  includes: ["account_profile"], excludes: ["Workspace data"],
};
const actions = [
  { name: "security read", payload: { sessionCount: 1, organizations: [], sharedOrganizationsBlockingDeletion: [] }, run: (client: Client) => client.getAccountSecurity() },
  { name: "account export", payload: accountExport, run: (client: Client) => client.exportAccount() },
  { name: "session revocation", payload: { ok: true, revokedSessions: 1 }, run: (client: Client) => client.revokeOtherSessions() },
  { name: "password change", payload: { ok: true, signedOutEverywhere: true }, run: (client: Client) => client.changePassword("synthetic-old", "synthetic-new") },
  { name: "account deletion", payload: { ok: true, status: "deleted", deletionJobId: "fixture-job", deletedOrganizationCount: 1, workspaceDataDeletionComplete: true, workspaceDataDeletionFailures: 0 }, run: (client: Client) => client.deleteAccount("synthetic-only", "fixture@example.invalid") },
];
afterEach(() => accountClientState.clear());

describe("account security request lifetime", () => {
  for (const action of actions) {
    test(`${action.name} still completes for an unchanged account`, async () => {
      const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(action.payload));
      try {
        const result = await action.run(createDenClient({ baseUrl: "https://account-security.invalid" }));
        expect(result).toEqual(action.name === "password change" ? undefined : action.payload);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally { fetchMock.mockRestore(); }
    });
    test(`${action.name} rejects an unverified successful response`, async () => {
      for (const payload of [null, {}, { ok: false }, [], "invalid"]) {
        const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(payload));
        try {
          await expect(action.run(createDenClient({ baseUrl: "https://account-security.invalid" })))
            .rejects.toMatchObject({ code: "invalid_account_security_response" });
        } finally { fetchMock.mockRestore(); }
      }
    });
    test(`${action.name} cannot complete after the account boundary changes`, async () => {
      let release = () => {};
      const pending = new Promise<void>((resolve) => { release = resolve; });
      const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async () => {
        await pending;
        return Response.json({ filename: "fixture-a.json", account: { id: "fixture-a" }, ok: true });
      });
      try {
        const result = action.run(createDenClient({ baseUrl: "https://account-security.invalid" }));
        accountClientState.clear();
        release();
        await expect(result).rejects.toBeInstanceOf(AccountStateChangedError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally { release(); fetchMock.mockRestore(); }
    });
  }

  test("a rejected old-account request cannot surface private server error details", async () => {
    let release = () => {};
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async () => {
      await pending;
      return Response.json({ error: "private_account_detail", message: "fixture-old-account-private-message" }, { status: 403 });
    });
    try {
      const result = createDenClient({ baseUrl: "https://account-security.invalid" }).exportAccount();
      accountClientState.clear(); release();
      await expect(result).rejects.toBeInstanceOf(AccountStateChangedError);
    } finally { release(); fetchMock.mockRestore(); }
  });

  test("unmounting before an export completes suppresses React Query success callbacks and data", async () => {
    let mounted = true;
    let release = () => {};
    let started = () => {};
    let downloads = 0;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const queries = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
    const observer = new MutationObserver(queries, {
      mutationFn: () => runAccountScopedRequest(async () => {
        started(); await pending;
        return { filename: "fixture-a.json", account: { id: "fixture-a" } };
      }, () => mounted),
      onSuccess: () => { downloads++; },
    });
    const unsubscribe = observer.subscribe(() => {});
    const result = observer.mutate();
    await entered;
    mounted = false;
    unsubscribe();
    release();
    try {
      await expect(result).rejects.toBeInstanceOf(AccountStateChangedError);
      expect(downloads).toBe(0);
      for (const mutation of queries.getMutationCache().getAll()) expect(mutation.state.data).toBeUndefined();
    } finally { queries.clear(); }
  });

  test("a disposed account view cannot start another request", async () => {
    let calls = 0;
    await expect(runAccountScopedRequest(async () => { calls++; }, () => false))
      .rejects.toBeInstanceOf(AccountStateChangedError);
    expect(calls).toBe(0);
  });

  test("confirmed pending deletion is not rejected as a malformed response", async () => {
    const payload = { ok: false, status: "deletion_pending", deletionJobId: "fixture-job", deletedOrganizationCount: 1, workspaceDataDeletionComplete: false, workspaceDataDeletionFailures: 1 };
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(payload, { status: 202 }));
    try {
      const result = await createDenClient({ baseUrl: "https://account-security.invalid" }).deleteAccount("fixture", "a@example.invalid");
      expect(result).toEqual(payload);
      expect(result.workspaceDataDeletionComplete).toBe(false);
    } finally { fetchMock.mockRestore(); }
  });

  test("security actions reject inconsistent counts, acknowledgments, export fields and deletion states", async () => {
    const client = createDenClient({ baseUrl: "https://account-security.invalid" });
    const cases = [
      { run: () => client.getAccountSecurity(), payload: { sessionCount: 1, organizations: [], sharedOrganizationsBlockingDeletion: null } },
      { run: () => client.getAccountSecurity(), payload: { sessionCount: 1.5, organizations: [], sharedOrganizationsBlockingDeletion: [] } },
      { run: () => client.revokeOtherSessions(), payload: { ok: true, revokedSessions: -1 } },
      { run: () => client.revokeOtherSessions(), payload: { ok: false, revokedSessions: 1 } },
      { run: () => client.changePassword("old", "new"), payload: { ok: true, signedOutEverywhere: false } },
      { run: () => client.exportAccount(), payload: { ...accountExport, filename: "../account.json" } },
      { run: () => client.exportAccount(), payload: { ...accountExport, version: "unknown" } },
      { run: () => client.exportAccount(), payload: { ...accountExport, legalAcceptance: { acceptedAt: "invalid" } } },
      { run: () => client.exportAccount(), payload: { ...accountExport, account: { ...accountExport.account, emailVerified: "true" } } },
      { run: () => client.deleteAccount("fixture", "a@example.invalid"), payload: { ok: true, status: "deleted", deletionJobId: "fixture-job", deletedOrganizationCount: 1, workspaceDataDeletionComplete: true, workspaceDataDeletionFailures: 1 } },
      { run: () => client.deleteAccount("fixture", "a@example.invalid"), payload: { ok: false, status: "deletion_pending", deletionJobId: "fixture-job", deletedOrganizationCount: 1, workspaceDataDeletionComplete: true, workspaceDataDeletionFailures: 0 } },
    ];
    for (const fixture of cases) {
      const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(fixture.payload));
      try {
        await expect(fixture.run()).rejects.toMatchObject({ code: "invalid_account_security_response" });
      } finally { fetchMock.mockRestore(); }
    }
  });

  test("a malformed password acknowledgement cannot trigger the session-ending callback", async () => {
    let sessionEnds = 0;
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));
    const queries = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
    const observer = new MutationObserver(queries, {
      mutationFn: () => createDenClient({ baseUrl: "https://account-security.invalid" }).changePassword("old", "new"),
      onSuccess: () => { sessionEnds++; },
    });
    try {
      await expect(observer.mutate()).rejects.toMatchObject({ code: "invalid_account_security_response" });
      expect(sessionEnds).toBe(0);
    } finally { queries.clear(); fetchMock.mockRestore(); }
  });
});

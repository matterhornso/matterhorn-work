import * as React from "react";
import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { createDenClient } from "../src/app/lib/den";
import { AccountSecuritySection } from "../src/react-app/domains/settings/cloud/account-security-section";
import { accountSecurityQueryKey } from "../src/react-app/domains/settings/cloud/account-security-scope";

const client = createDenClient({ baseUrl: "http://localhost:1" });
const user = { id: "account-b", email: "b@example.invalid", name: "Fixture B" };
function cache() { return new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity } } }); }
function render(queryClient: QueryClient) {
  return renderToStaticMarkup(<QueryClientProvider client={queryClient}>
    <AccountSecuritySection client={client} user={user} onSessionEnded={() => {}} />
  </QueryClientProvider>);
}

test("account security never reuses another account's cached session count", () => {
  const queries = cache();
  queries.setQueryData(["account-security"], { sessionCount: 9 });
  queries.setQueryData(accountSecurityQueryKey("account-a", client), { sessionCount: 9 });
  const html = render(queries);
  expect(html).not.toContain("8 other sessions");
  expect(html).toContain("Checking active sessions");
  queries.clear();
});

test("a failed security lookup does not falsely claim only this session is active", async () => {
  const queries = cache();
  for (const key of [["account-security"], accountSecurityQueryKey(user.id, client)]) {
    await queries.fetchQuery({ queryKey: key, queryFn: async () => { throw new Error("Fixture offline"); } }).catch(() => {});
  }
  const html = render(queries);
  expect(html).not.toContain("Only this session is active");
  expect(html).toContain("Active sessions could not be verified");
  expect(html).toContain("Retry security check");
  queries.clear();
});

test("a confirmed scoped session count is displayed accurately", () => {
  const queries = cache();
  queries.setQueryData(accountSecurityQueryKey(user.id, client), { sessionCount: 3 });
  expect(render(queries)).toContain("2 other sessions");
  queries.setQueryData(accountSecurityQueryKey(user.id, client), { sessionCount: 1 });
  expect(render(queries)).toContain("Only this session is active");
  queries.clear();
});

test("security scope is stable per user and connection, with no credential material", () => {
  const otherClient = createDenClient({ baseUrl: "http://localhost:1", token: "synthetic-test-credential" });
  const key = accountSecurityQueryKey(user.id, client);
  expect(accountSecurityQueryKey(user.id, client)).toEqual(key);
  expect(accountSecurityQueryKey("account-a", client)).not.toEqual(key);
  expect(accountSecurityQueryKey(user.id, otherClient)).not.toEqual(key);
  expect(JSON.stringify(accountSecurityQueryKey(user.id, otherClient))).not.toContain("synthetic-test-credential");
});

test("a failed refresh does not present a stale session count as verified", async () => {
  const queries = cache();
  const queryKey = accountSecurityQueryKey(user.id, client);
  queries.setQueryData(queryKey, { sessionCount: 1 });
  await queries.fetchQuery({ queryKey, queryFn: async () => { throw new Error("Fixture offline"); } }).catch(() => {});
  const html = render(queries);
  expect(html).not.toContain("Only this session is active");
  expect(html).toContain("Active sessions could not be verified");
  queries.clear();
});

test("malformed successful responses do not invent a single active session", () => {
  for (const data of [{}, { sessionCount: 0 }, { sessionCount: -1 }, { sessionCount: 1.5 }]) {
    const queries = cache();
    queries.setQueryData(accountSecurityQueryKey(user.id, client), data);
    const html = render(queries);
    expect(html).not.toContain("Only this session is active");
    expect(html).toContain("Retry security check");
    queries.clear();
  }
});

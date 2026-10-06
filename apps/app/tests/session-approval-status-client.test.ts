import { afterEach, expect, spyOn, test } from "bun:test";
import { accountClientState, AccountStateChangedError } from "../src/app/lib/account-client-state";
import { createMatterhornServerClient } from "../src/app/lib/matterhorn-server";

afterEach(() => accountClientState.clear());

const status = { item: {
  session: { id: "ses_1" }, status: { type: "idle" }, busy: false,
  observedAt: 1, awaitingOperatorApproval: true,
} };

test("reads own session approval status through normal account transport, not host approvals", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(status));
  try {
    const result = await createMatterhornServerClient({ baseUrl: "http://127.0.0.1:4096" })
      .getSessionExecutionStatus("ws/test", "ses/test");
    expect(result.item.awaitingOperatorApproval).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:4096/workspace/ws%2Ftest/sessions/ses%2Ftest/status");
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.credentials).toBe("same-origin");
    const headers = new Headers(init?.headers);
    expect(headers.has("x-matterhorn-host-token")).toBe(false);
    expect(headers.has("authorization")).toBe(false);
  } finally { fetchMock.mockRestore(); }
});

test("old-account approval status cannot reach a new account after invalidation", async () => {
  const response = Promise.withResolvers<Response>();
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(() => response.promise);
  try {
    const pending = createMatterhornServerClient({ baseUrl: "http://127.0.0.1:4096" })
      .getSessionExecutionStatus("ws_1", "ses_1");
    accountClientState.clear();
    response.resolve(Response.json(status));
    await expect(pending).rejects.toBeInstanceOf(AccountStateChangedError);
  } finally { response.resolve(Response.json(status)); fetchMock.mockRestore(); }
});

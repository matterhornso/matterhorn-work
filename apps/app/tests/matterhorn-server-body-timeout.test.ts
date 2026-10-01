import { afterEach, expect, spyOn, test } from "bun:test";
import { createMatterhornServerClient, fetchResponseWithTimeout } from "../src/app/lib/matterhorn-server";
import { accountClientState, AccountStateChangedError } from "../src/app/lib/account-client-state";

const spies: Array<ReturnType<typeof spyOn>> = [];

test("account invalidation rejects immediately even without a deadline or cooperative transport", async () => {
  const request = fetchResponseWithTimeout(() => new Promise<Response>(() => {}),
    "http://fixture.invalid", {}, 0, response => response.text());
  accountClientState.clear();
  await expect(request).rejects.toThrow(AccountStateChangedError);
});

test("late old-account response cannot reach consumers even if the transport ignores abort", async () => {
  const response = Promise.withResolvers<Response>();
  let signal: AbortSignal | null | undefined;
  const request = fetchResponseWithTimeout(async (_url, init) => {
    signal = init?.signal;
    return response.promise;
  }, "http://fixture.invalid", {}, 1000, (value) => value.text());
  accountClientState.clear();
  expect(signal?.aborted).toBe(true);
  response.resolve(new Response("account A private answer"));
  await expect(request).rejects.toThrow(AccountStateChangedError);
  expect(await fetchResponseWithTimeout(async () => new Response("account B answer"),
    "http://fixture.invalid", {}, 1000, (value) => value.text())).toBe("account B answer");
});
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });

test("JSON client deadline includes a body that stalls after headers arrive", async () => {
  let finish: (() => void) | undefined;
  let aborted = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"ok":'));
      finish = () => { controller.enqueue(new TextEncoder().encode("true}")); controller.close(); };
    },
  });
  spies.push(spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; });
    return new Response(body, { headers: { "content-type": "application/json" } });
  }));
  const client = createMatterhornServerClient({ baseUrl: "http://127.0.0.1:4096" });
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      client.health().then(() => "unexpected_success", (error: unknown) => error instanceof Error ? error.message : "unknown"),
      new Promise<string>((resolve) => { watchdog = setTimeout(() => resolve("body_still_pending"), 3500); }),
    ]);
    expect(outcome).toBe("Request timed out.");
    expect(aborted).toBe(true);
  } finally {
    clearTimeout(watchdog);
    finish?.();
  }
}, 5000);

test("deadline covers a stalled binary body, including an error response", async () => {
  for (const status of [200, 502]) {
    let failBody: (() => void) | undefined;
    let aborted = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { failBody = () => controller.error(new Error("fixture cleanup")); },
    });
    try {
      await expect(fetchResponseWithTimeout(async (_url, init) => {
        init?.signal?.addEventListener("abort", () => { aborted = true; });
        return new Response(body, { status });
      }, "http://fixture.invalid", {}, 20, (response) => response.arrayBuffer())).rejects.toThrow("Request timed out.");
      expect(aborted).toBe(true);
    } finally { failBody?.(); }
  }
});

test("header timeout never starts body consumption", async () => {
  let read = false;
  await expect(fetchResponseWithTimeout(
    () => new Promise<Response>(() => {}), "http://fixture.invalid", {}, 20,
    async () => { read = true; return "unexpected"; },
  )).rejects.toThrow("Request timed out.");
  expect(read).toBe(false);
});

test("an external cancellation signal does not disable the request deadline", async () => {
  const external = new AbortController();
  let aborted = false;
  await expect(fetchResponseWithTimeout(async (_url, init) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; });
    return new Promise<Response>(() => {});
  }, "http://fixture.invalid", { signal: external.signal }, 20, response => response.text())).rejects.toThrow("Request timed out.");
  expect(aborted).toBe(true);
  expect(external.signal.aborted).toBe(false);
});

test("a successful body finishes before the deadline and releases the timer", async () => {
  let aborted = false;
  const result = await fetchResponseWithTimeout(async (_url, init) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; });
    return new Response("complete");
  }, "http://fixture.invalid", {}, 20, (response) => response.text());
  expect(result).toBe("complete");
  await new Promise((resolve) => setTimeout(resolve, 40));
  expect(aborted).toBe(false);
});

test("body failures are preserved and do not leak a late abort", async () => {
  const failure = new Error("fixture body failure");
  let aborted = false;
  await expect(fetchResponseWithTimeout(async (_url, init) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; });
    return new Response("unused");
  }, "http://fixture.invalid", {}, 20, async () => { throw failure; })).rejects.toBe(failure);
  await new Promise((resolve) => setTimeout(resolve, 40));
  expect(aborted).toBe(false);
});

test("explicitly disabled deadlines still consume the response", async () => {
  expect(await fetchResponseWithTimeout(async () => new Response("body"),
    "http://fixture.invalid", {}, 0, (response) => response.text())).toBe("body");
});

test("prompt dispatch allows bounded approval latency without extending read deadlines", async () => {
  const deadlines: number[] = [];
  const original = globalThis.setTimeout;
  spies.push(spyOn(globalThis, "setTimeout").mockImplementation((handler, timeout, ...args) => {
    deadlines.push(Number(timeout));
    return original(handler, timeout, ...args);
  }));
  spies.push(spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({
    ok: true, accepted: true, sessionId: "session-dispatch-deadline",
  })));
  const client = createMatterhornServerClient({ baseUrl: "http://127.0.0.1:4096" });
  await client.sendAgentMessage("workspace", "session-dispatch-deadline", {
    parts: [{ type: "text", text: "Public fixture prompt" }],
    model: { providerId: "fixture", modelId: "chat" },
  });
  expect(deadlines).toEqual([120_000]);
  deadlines.length = 0;
  await client.health();
  expect(deadlines).toEqual([3_000]);
});

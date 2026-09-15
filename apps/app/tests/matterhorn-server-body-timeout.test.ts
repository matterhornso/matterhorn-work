import { afterEach, expect, spyOn, test } from "bun:test";
import { createMatterhornServerClient, fetchResponseWithTimeout } from "../src/app/lib/matterhorn-server";

const spies: Array<ReturnType<typeof spyOn>> = [];
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

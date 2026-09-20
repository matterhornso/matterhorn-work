import { expect, test } from "bun:test";
import { createClient } from "../src/app/lib/opencode";
import { abortSession } from "../src/app/lib/opencode-session";

test("explicit Stop rejects SDK errors and false acknowledgements", async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }), new Response("false", { headers: { "content-type": "application/json" } })]) {
      globalThis.fetch = Object.assign(async () => response.clone(), original);
      await expect(abortSession(createClient("http://127.0.0.1:1"), "ses_stop")).rejects.toThrow();
    }
    globalThis.fetch = Object.assign(async () => new Response("true", { headers: { "content-type": "application/json" } }), original);
    await expect(abortSession(createClient("http://127.0.0.1:1"), "ses_stop")).resolves.toBeUndefined();
  } finally { globalThis.fetch = original; }
});

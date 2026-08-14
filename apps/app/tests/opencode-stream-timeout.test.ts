import { describe, expect, test } from "bun:test";

import { resolveOpencodeRequestTimeoutMs } from "../src/app/lib/opencode";

describe("OpenCode web transport timeouts", () => {
  test("leaves event streams outside the ordinary request timeout", () => {
    expect(resolveOpencodeRequestTimeoutMs("https://example.test/workspace/ws_test/opencode/event")).toBe(0);
    expect(resolveOpencodeRequestTimeoutMs("https://example.test/workspace/ws_test/opencode/messages", {
      headers: { Accept: "text/event-stream" },
    })).toBe(0);
  });

  test("keeps a finite timeout on ordinary web requests", () => {
    expect(resolveOpencodeRequestTimeoutMs(
      "https://example.test/workspace/ws_test/opencode/global/health",
    )).toBeGreaterThan(0);
  });
});

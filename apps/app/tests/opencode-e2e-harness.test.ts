import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const utilSource = readFileSync("apps/app/scripts/_util.mjs", "utf8");
const aggregateScripts = [
  "apps/app/scripts/e2e.mjs",
  "apps/app/scripts/sessions.mjs",
  "apps/app/scripts/session-switch.mjs",
  "apps/app/scripts/fs-engine.mjs",
].map((path) => readFileSync(path, "utf8"));

describe("OpenCode E2E harness", () => {
  test("isolates core engine tests from repository plugins and MCP configuration", () => {
    expect(utilSource).toContain("isolatedOpencodeTestConfig");
    expect(utilSource).toContain("plugin: []");
    expect(utilSource).toContain("OPENCODE_CONFIG_CONTENT: serializedConfig");
    for (const script of aggregateScripts) {
      expect(script).toContain("configContent: isolatedOpencodeTestConfig");
    }
  });

  test("bounds health requests and preserves cross-platform startup diagnostics", () => {
    expect(utilSource).toContain('stdio: ["ignore", "pipe", "pipe"]');
    expect(utilSource).toContain("AbortSignal.timeout(requestTimeoutMs)");
    expect(utilSource).toContain("OpenCode exited before /global/health became ready");
    expect(utilSource).toContain("OpenCode output:");
    expect(utilSource).toContain("getOutput()");
  });
});

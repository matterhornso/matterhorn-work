import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../scripts/permissions.mjs", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts?: Record<string, string> };

describe("live engine permission smoke", () => {
  test("requires a real permission request by default", () => {
    expect(source).toContain(
      'const requirePermission = args.get("require") !== "false";',
    );
    expect(source).toContain('event.type === "permission.asked"');
    expect(source).toContain("No permission request observed");
    expect(source).not.toContain("permissionAsked: false");
  });

  test("uses a deterministic model tool call and resolves it once", () => {
    expect(source).toContain("bashToolCompletion(toolName)");
    expect(source).toContain('permission: "bash"');
    expect(source).toContain('reply: "once"');
    expect(source).toContain(
      '"The one-time permission reply should resolve the pending request"',
    );
  });

  test("keeps credentials and filesystem effects inside the test fixture", () => {
    expect(source).toContain('apiKey: "test-key"');
    expect(source).toContain(
      'mkdtemp(path.join(os.tmpdir(), "matterhorn-permission-test-")',
    );
    expect(source).toContain(
      "await rm(tmpdir, { recursive: true, force: true })",
    );
  });

  test("is part of the aggregate live-engine E2E command", () => {
    expect(packageJson.scripts?.["test:e2e"]).toContain(
      "node scripts/permissions.mjs",
    );
    expect(packageJson.scripts?.["test:e2e"]).toContain(
      "node scripts/sessions.mjs",
    );
  });
});

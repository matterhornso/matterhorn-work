import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

// The directories are disposable generated fixtures, never operator checkout data.
for (const location of [".env", "apps/app/.env.production.local", "apps/app/.env.test"]) {
  test(`QA refuses ${location} before launching tools or exposing its content`, async () => {
    const root = await mkdtemp("/private/tmp/matterhorn-retro-runner-test-");
    const scriptDir = join(root, "qa-reports/retro-ui/fixture");
    await mkdir(scriptDir, { recursive: true });
    await mkdir(join(root, "apps/app"), { recursive: true });
    const runner = join(scriptDir, "run-check.mjs");
    await copyFile(new URL("./run-check.mjs", import.meta.url), runner);
    const sentinel = "DISPOSABLE_QA_SENTINEL=not-an-operator-secret";
    const envFile = join(root, location);
    await writeFile(envFile, sentinel, { mode: 0o600 });
    const result = spawnSync(process.execPath, [runner, "build-web", "1"], {
      encoding: "utf8",
      env: { RETRO_QA_PNPM: "/nonexistent/qa-pnpm.cjs", RETRO_QA_BUN: "/nonexistent/qa-bun" },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /QA isolation requires a checkout without local env files/);
    assert.equal(result.stdout, "");
    assert.ok(!result.stderr.includes(sentinel));
    assert.equal(await readFile(envFile, "utf8"), sentinel);
  });
}

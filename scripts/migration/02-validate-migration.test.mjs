import assert from "node:assert/strict";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertVerifiedSignature, createValidationDirectory, validateTag } from "./02-validate-migration.mjs";

test("release tag validation rejects path traversal and shell/options while retaining version tags", () => {
  for (const valid of ["v0.12.0", "v1.2.3-beta.4", "v1.2.3+build.7"]) assert.equal(validateTag(valid), valid);
  for (const invalid of ["../elsewhere", "v1.2.3/../../elsewhere", "../../", "--help", "v1.2.3;touch x", "", undefined, "v1.2.3\n"]) {
    assert.throws(() => validateTag(invalid));
  }
});

test("scratch directories are private fresh children and never delete a legacy directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-migration-test-"));
  try {
    const existing = join(root, "legacy-marker");
    await writeFile(existing, "preserve", { flag: "wx", mode: 0o600 });
    const first = await createValidationDirectory(root);
    const second = await createValidationDirectory(root);
    assert.notEqual(first, second);
    assert.ok(first.startsWith(join(root, "openwork-migrate-validate-")));
    const fd = await open(first, "r");
    try { if (process.platform !== "win32") assert.equal((await fd.stat()).mode & 0o777, 0o700); }
    finally { await fd.close(); }
    assert.equal(await readFile(existing, "utf8"), "preserve");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failed signatures cannot pass automated validation or reach the manual-success path", async () => {
  assert.doesNotThrow(() => assertVerifiedSignature({ ok: true }));
  for (const result of [{ ok: false }, {}]) assert.throws(() => assertVerifiedSignature(result), /signature verification failed/);
  const source = await readFile(new URL("./02-validate-migration.mjs", import.meta.url), "utf8");
  assert.ok(source.indexOf("assertVerifiedSignature(sig)") < source.indexOf("if (args.skipManual)"));
  assert.match(source, /finally \{ await rm\(workDir, \{ recursive: true, force: true \}\); \}/);
  assert.doesNotMatch(source, /join\(tmpdir\(\), `openwork-migrate-validate-\$\{/);
});

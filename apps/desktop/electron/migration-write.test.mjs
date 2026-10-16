import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { lstat, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeMigrationFile, writeMigrationFileSync } from "./migration-write.mjs";

for (const [name, writeMigration] of [
  ["sync", writeMigrationFileSync],
  ["async", writeMigrationFile],
]) {
  test(`${name} migration creates missing private state without replacing a concurrent winner`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-migration-write-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const destination = join(root, "state.json");

    assert.equal(await writeMigration(destination, "legacy state"), true);
    assert.equal(await readFile(destination, "utf8"), "legacy state");
    if (process.platform !== "win32") assert.equal((await stat(destination)).mode & 0o777, 0o600);

    const racedDestination = join(root, "raced-state.json");
    assert.equal(existsSync(racedDestination), false);
    await writeFile(racedDestination, "newer state");
    assert.equal(await writeMigration(racedDestination, "legacy state"), false);
    assert.equal(await readFile(racedDestination, "utf8"), "newer state");
  });

  for (const dangling of [false, true]) {
    test(`${name} migration skips ${dangling ? "dangling" : "existing"} destination symlinks`, async (t) => {
      const root = await mkdtemp(join(tmpdir(), "matterhorn-migration-link-"));
      t.after(() => rm(root, { recursive: true, force: true }));
      const target = join(root, "untouched.json");
      const destination = join(root, "state.json");
      if (!dangling) await writeFile(target, "existing target");
      await symlink(target, destination);

      assert.equal(await writeMigration(destination, "legacy state"), false);
      assert.equal((await lstat(destination)).isSymbolicLink(), true);
      if (dangling) assert.equal(existsSync(target), false);
      else assert.equal(await readFile(target, "utf8"), "existing target");
    });
  }

  test(`${name} migration does not hide unexpected filesystem errors`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-migration-error-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await assert.rejects(async () => writeMigration(join(root, "missing", "state.json"), "legacy"), { code: "ENOENT" });
  });
}

test("concurrent async migrations create exactly one destination", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-migration-concurrent-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = join(root, "state.json");
  const contents = ["first legacy state", "second legacy state"];
  const results = await Promise.all(contents.map((content) => writeMigrationFile(destination, content)));

  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await readFile(destination, "utf8"), contents[results.indexOf(true)]);
});

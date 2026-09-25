import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const script = resolve("packaging/docker/public-beta-backup-loop.sh");

test("backup worker honors every enabled spelling accepted by launch readiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-backup-loop-test-"));
  try {
    const bin = join(root, "bin");
    await mkdir(bin);
    // No real uploader, credentials or AWS requests. Stop after the first loop.
    await writeFile(join(bin, "node"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    await writeFile(join(bin, "sleep"), '#!/bin/sh\nkill -TERM "$PPID"\n', { mode: 0o700 });
    for (const value of ["1", "true", "TRUE", "yes", "YES", "on", " On "]) {
      const result = spawnSync("/bin/sh", [script], {
        encoding: "utf8", timeout: 2_000,
        env: {
          PATH: `${bin}:/usr/bin:/bin`, TMPDIR: root,
          MATTERHORN_HOST_BACKUP_REQUIRED: value,
          OPENCODE_DB: join(root, "fixture.db"), MATTERHORN_WORK_DATA_DIR: root,
        },
      });
      assert.equal(result.error, undefined, result.error?.message);
      assert.match(result.stdout, /host recovery upload succeeded/, `enabled value ${JSON.stringify(value)} must run the worker`);
    }
    for (const value of ["0", "false", "off", "no", "", "invalid", "t rue"]) {
      const result = spawnSync("/bin/sh", [script], {
        encoding: "utf8", timeout: 2_000,
        env: { PATH: `${bin}:/usr/bin:/bin`, TMPDIR: root, MATTERHORN_HOST_BACKUP_REQUIRED: value },
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

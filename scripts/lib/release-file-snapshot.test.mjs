import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readReleaseFileSnapshot } from "./release-file-snapshot.mjs";

function fixture(t) {
  const dir = fs.mkdtempSync(join(tmpdir(), "release-file-snapshot-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "evidence.json");
  fs.writeFileSync(path, "ok");
  return { dir, path };
}

test("regular evidence returns one stable inode snapshot without chmod or rewrite", t => {
  const { path } = fixture(t);
  fs.chmodSync(path, 0o640);
  const snapshot = readReleaseFileSnapshot(path, { maxBytes: 2 });
  assert.equal(snapshot.buffer.toString(), "ok");
  assert.equal(snapshot.stat.size, 2);
  assert.equal(fs.statSync(path).mode & 0o777, 0o640);
});

test("symlink, missing file, directory and FIFO fail without reading external data or blocking", t => {
  const { dir, path } = fixture(t);
  const symbolic = join(dir, "link");
  fs.symlinkSync(path, symbolic);
  assert.throws(() => readReleaseFileSnapshot(symbolic), { code: "ELOOP" });
  assert.throws(() => readReleaseFileSnapshot(join(dir, "missing")), { code: "ENOENT" });
  assert.throws(() => readReleaseFileSnapshot(dir), { code: "RELEASE_FILE_NOT_REGULAR" });
  if (process.platform !== "win32") {
    const fifo = join(dir, "fifo");
    execFileSync("mkfifo", [fifo]);
    assert.throws(() => readReleaseFileSnapshot(fifo), { code: "RELEASE_FILE_NOT_REGULAR" });
  }
});

test("replacement after open cannot redirect the descriptor read", t => {
  const { dir, path } = fixture(t);
  const target = join(dir, "outside.json");
  fs.writeFileSync(target, "must not be read");
  const originalRead = fs.readSync;
  let swapped = false;
  t.mock.method(fs, "readSync", (...args) => {
    if (!swapped) {
      swapped = true;
      fs.renameSync(path, join(dir, "original.json"));
      fs.symlinkSync(target, path);
    }
    return originalRead(...args);
  });
  try {
    assert.equal(readReleaseFileSnapshot(path).buffer.toString(), "ok");
  } catch (error) {
    // Renaming can change ctime on the opened inode; rejecting that mutation is
    // also correct. Reading the replacement's bytes is never acceptable.
    assert.equal(error.code, "RELEASE_FILE_CHANGED");
  }
});

test("oversized and concurrently growing evidence never bypass the read bound", t => {
  const { path } = fixture(t);
  assert.throws(() => readReleaseFileSnapshot(path, { maxBytes: 1 }), { code: "RELEASE_FILE_TOO_LARGE" });
  const originalRead = fs.readSync;
  let grew = false;
  t.mock.method(fs, "readSync", (...args) => {
    const result = originalRead(...args);
    if (!grew) { grew = true; fs.appendFileSync(path, "unexpected extra bytes"); }
    return result;
  });
  assert.throws(() => readReleaseFileSnapshot(path, { maxBytes: 4 }), { code: "RELEASE_FILE_TOO_LARGE" });
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { constants, renameSync, symlinkSync } from "node:fs";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { decryptArchive, writeEncryptedArchive } from "./workspace-user-data-recovery.mjs";

const secret = "synthetic-recovery-passphrase-only";
async function fixture(t) {
  const dir = await fs.mkdtemp(join(tmpdir(), "recovery-file-race-"));
  t.after(async () => { t.mock.restoreAll(); syncBuiltinESMExports(); await fs.rm(dir, { recursive: true, force: true }); });
  const archive = join(dir, "archive.mhdb");
  return { dir, archive };
}

test("non-force archive publication cannot overwrite a concurrently created target", async t => {
  const { dir, archive } = await fixture(t);
  const originalLink = fs.link;
  t.mock.method(fs, "link", async (source, target) => {
    assert.equal((await fs.stat(dirname(source))).mode & 0o777, 0o700);
    await fs.writeFile(target, "concurrent owner data");
    return originalLink(source, target);
  });
  syncBuiltinESMExports();
  await assert.rejects(writeEncryptedArchive(archive, { fixture: true }, [], secret, false), /already exists/);
  assert.equal(await fs.readFile(archive, "utf8"), "concurrent owner data");
  assert.deepEqual(await fs.readdir(dir), ["archive.mhdb"]);
});

test("concurrent symlink targets are preserved and force replaces only the link", async t => {
  const { dir, archive } = await fixture(t);
  const other = join(dir, "owner.txt");
  await fs.writeFile(other, "owner content", { mode: 0o640 });
  const originalLink = fs.link;
  t.mock.method(fs, "link", async (source, target) => { await fs.symlink(other, target); return originalLink(source, target); });
  syncBuiltinESMExports();
  await assert.rejects(writeEncryptedArchive(archive, { fixture: true }, [], secret, false), /already exists/);
  assert.equal(await fs.readlink(archive), other);
  assert.equal(await fs.readFile(other, "utf8"), "owner content");
  await writeEncryptedArchive(archive, { fixture: true }, [], secret, true);
  assert.equal((await fs.lstat(archive)).isFile(), true);
  assert.equal((await fs.stat(archive)).mode & 0o777, 0o600);
  const owner = await fs.open(other, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    assert.equal((await owner.stat()).mode & 0o777, 0o640);
    assert.equal(await owner.readFile("utf8"), "owner content");
  } finally { await owner.close(); }
});

test("decryption reads the opened archive inode, not a pathname replacement", async t => {
  const { dir, archive } = await fixture(t);
  await writeEncryptedArchive(archive, { fixture: true }, [], secret, false);
  const other = join(dir, "unrelated");
  await fs.writeFile(other, "not an encrypted archive");
  const originalOpen = fs.open;
  t.mock.method(fs, "open", async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] === archive) {
      const stream = handle.createReadStream.bind(handle);
      handle.createReadStream = options => {
        // Synchronous replacement is needed before the stream starts reading.
        renameSync(archive, `${archive}.old`);
        symlinkSync(other, archive);
        return stream(options);
      };
    }
    return handle;
  });
  syncBuiltinESMExports();
  const output = join(dir, "plaintext");
  try {
    await decryptArchive(archive, secret, output);
    assert.equal((await fs.readFile(output)).subarray(4).toString(), '{"fixture":true}');
  } catch (error) {
    // Filesystems that change ctime when renaming reject the changed inode.
    assert.match(error.message, /authentication failed/);
    await assert.rejects(fs.stat(output), { code: "ENOENT" });
  }
  assert.equal(await fs.readFile(other, "utf8"), "not an encrypted archive");
});

test("decryption rejects symbolic, nonregular and colliding plaintext paths without deleting owner data", async t => {
  const { dir, archive } = await fixture(t);
  await writeEncryptedArchive(archive, { fixture: true }, [], secret, false);
  const output = join(dir, "plaintext");
  await fs.writeFile(output, "keep this", { mode: 0o640 });
  await assert.rejects(decryptArchive(archive, secret, output), /authentication failed/);
  assert.equal(await fs.readFile(output, "utf8"), "keep this");
  assert.equal((await fs.stat(output)).mode & 0o777, 0o640);
  const symbolic = join(dir, "archive-link");
  await fs.symlink(archive, symbolic);
  await assert.rejects(decryptArchive(symbolic, secret, join(dir, "unused")), { code: "ELOOP" });
  await assert.rejects(decryptArchive(dir, secret, join(dir, "unused")), /authentication failed/);
  if (process.platform !== "win32") {
    const fifo = join(dir, "fifo");
    execFileSync("mkfifo", [fifo]);
    await assert.rejects(decryptArchive(fifo, secret, join(dir, "unused")), /authentication failed/);
  }
});

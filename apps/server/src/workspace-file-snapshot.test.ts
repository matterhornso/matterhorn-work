import { afterEach, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { readWorkspaceFileSnapshot } from "./server.js";

const roots: string[] = [];
afterEach(async () => {
  while (roots.length) await fs.rm(roots.pop()!, { recursive: true, force: true });
});
async function fixture(size: number) {
  const root = await fs.mkdtemp(join(tmpdir(), "matterhorn-file-snapshot-")); roots.push(root);
  const path = join(root, "fixture.bin");
  await fs.writeFile(path, Buffer.alloc(size, 97));
  return path;
}

for (const size of [0, 1023, 1024, 1025]) {
  test(`workspace file snapshot byte boundary ${size}`, async () => {
    const path = await fixture(size);
    if (size > 1024) await expect(readWorkspaceFileSnapshot(path, 1024)).rejects.toMatchObject({ code: "file_too_large", status: 413 });
    else {
      const snapshot = await readWorkspaceFileSnapshot(path, 1024);
      expect(snapshot.content).toEqual(Buffer.alloc(size, 97));
      expect(snapshot.info.size).toBe(size);
    }
  });
}

for (const change of ["unchanged", "grow-under-limit", "grow-over-limit", "shrink"]) {
  test(`workspace file snapshot uses bounded reads when file changes: ${change}`, async () => {
    const path = await fixture(16);
    const handle = await fs.open(path, "r");
    const open = spyOn(fs, "open").mockResolvedValueOnce(handle);
    // Return the already-captured metadata once, modelling a filesystem change
    // after the initial stat but before the first read. Later stats are real.
    const before = await handle.stat();
    if (change === "grow-under-limit") await fs.appendFile(path, Buffer.alloc(16, 98));
    if (change === "grow-over-limit") await fs.appendFile(path, Buffer.alloc(8192, 98));
    if (change === "shrink") await fs.truncate(path, 8);
    const metadata = spyOn(handle, "stat").mockResolvedValueOnce(before);
    const unbounded = spyOn(handle, "readFile");
    try {
      if (change === "unchanged") expect((await readWorkspaceFileSnapshot(path, 1024)).content).toEqual(Buffer.alloc(16, 97));
      else await expect(readWorkspaceFileSnapshot(path, 1024)).rejects.toMatchObject({
        status: change === "grow-over-limit" ? 413 : 409,
        code: change === "grow-over-limit" ? "file_too_large" : "file_changed",
      });
      expect(unbounded).not.toHaveBeenCalled();
      await expect(handle.stat()).rejects.toThrow(); // Success and failure both close the handle.
    } finally {
      open.mockRestore(); metadata.mockRestore(); unbounded.mockRestore();
      await handle.close();
    }
  });
}

if (process.platform !== "win32") {
  test("workspace file snapshot rejects FIFOs without waiting for a writer", async () => {
    const path = await fixture(0);
    const fifo = `${path}.fifo`;
    expect(spawnSync("mkfifo", [fifo]).status).toBe(0);
    await expect(readWorkspaceFileSnapshot(fifo, 1024)).rejects.toMatchObject({ status: 404, code: "file_not_found" });
  });
}

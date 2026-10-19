import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MediaStore } from "../dist/media-store.js";

// The canonical package suite and security CI explicitly run these cases with
// Node: Bun does not support rebinding builtin named exports for this fixture.
for (const kind of ["file", "symlink", "hardlink"]) {
  test(`exclusive media write refuses a pre-existing ${kind} at the chosen leaf`, async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "matterhorn-media-race-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = new MediaStore(path.join(directory, "media"));
    const target = path.join(directory, "sentinel");
    await fs.writeFile(target, "unchanged", { flag: "wx", mode: 0o600 });
    const originalWriteFile = fs.writeFile;
    let intercepted = false;
    fs.writeFile = async (file, data, options) => {
      if (!String(file).includes(`${path.sep}inbound${path.sep}`)) {
        return originalWriteFile(file, data, options);
      }
      intercepted = true;
      assert.deepEqual(options, { flag: "wx", mode: 0o600 });
      if (kind === "symlink") await fs.symlink(target, file);
      else if (kind === "hardlink") await fs.link(target, file);
      else await originalWriteFile(file, "existing", { flag: "wx", mode: 0o600 });
      return originalWriteFile(file, data, options);
    };
    try {
      syncBuiltinESMExports();
      await assert.rejects(store.saveInboundBuffer({
        channel: "telegram", identityId: "default", peerId: "fixture", kind: "file",
        filename: "report.pdf", buffer: Buffer.from("replacement"),
      }), { code: "EEXIST" });
      assert.equal(intercepted, true);
      assert.equal(await fs.readFile(target, "utf8"), "unchanged");
    } finally {
      fs.writeFile = originalWriteFile;
      syncBuiltinESMExports();
    }
  });
}

import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// userData and its ancestors belong to the desktop user. Publish each rotating
// token atomically from a private sibling, never through an existing leaf link.
export async function writeUiControlDiscovery(destination, payload) {
  const staging = await mkdtemp(path.join(path.dirname(destination), ".ui-control-"));
  try {
    const pending = path.join(staging, "discovery.json");
    await writeFile(pending, payload, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(pending, destination);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

import { writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";

// Migration destinations may appear after the caller's existence check. Never
// replace that newer state or follow an existing destination symlink.
export function writeMigrationFileSync(destination, content) {
  try {
    writeFileSync(destination, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }
}

export async function writeMigrationFile(destination, content) {
  try {
    await writeFile(destination, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }
}

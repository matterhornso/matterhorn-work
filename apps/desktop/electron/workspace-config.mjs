import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureWorkspaceOpenworkConfig(workspacePath, config) {
  const configPath = path.join(workspacePath, ".opencode", "openwork.json");
  await mkdir(path.dirname(configPath), { recursive: true });
  try {
    // Exclusive creation preserves prior workspace settings, including when
    // another open request initializes the same folder concurrently.
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
}

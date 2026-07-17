import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function atomicWriteTextFile(
  path: string,
  content: string,
  options: { mode?: number } = {},
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = join(
    dirname(path),
    `.${process.pid}.${Date.now()}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(tempPath, content, {
      encoding: "utf8",
      flag: "wx",
      mode: options.mode,
    });
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

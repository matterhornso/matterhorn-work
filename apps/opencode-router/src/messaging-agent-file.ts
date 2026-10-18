import { constants } from "node:fs";
import { open } from "node:fs/promises";

export const MESSAGING_AGENT_FILE_MAX_BYTES = 64 * 1024;

// The configured workspace and ancestor directories are operator-trusted.
// O_NOFOLLOW protects the final component, not mutable ancestor directories.
// Platforms without these no-follow/nonblocking flags cannot load custom
// messaging instructions; the bridge retains its default instructions instead.
export async function readMessagingAgentFile(
  filePath: string,
  { maxBytes = MESSAGING_AGENT_FILE_MAX_BYTES, openFile = open }: {
    maxBytes?: number;
    openFile?: typeof open;
  } = {},
): Promise<{ text: string; cacheKey: string }> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > MESSAGING_AGENT_FILE_MAX_BYTES) {
    throw new Error("Invalid messaging agent file size limit");
  }
  if (!constants.O_NOFOLLOW || !constants.O_NONBLOCK) {
    throw new Error("Safe messaging agent file reads are unavailable on this platform");
  }
  const handle = await openFile(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error("Messaging agent instructions must be a regular file");
    if (before.nlink !== 1) throw new Error("Messaging agent instructions must not have multiple hard links");
    if (before.size > maxBytes) throw new Error("Messaging agent file exceeds its size limit");

    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(16 * 1024, maxBytes - size + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > maxBytes) throw new Error("Messaging agent file exceeds its size limit");
      chunks.push(chunk.subarray(0, bytesRead));
    }

    const after = await handle.stat();
    if (size !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw new Error("Messaging agent file changed while being read");
    }
    return {
      text: Buffer.concat(chunks, size).toString("utf8"),
      cacheKey: `${after.dev}:${after.ino}:${after.size}:${after.mtimeMs}:${after.ctimeMs}`,
    };
  } finally {
    await handle.close();
  }
}

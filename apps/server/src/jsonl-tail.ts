import { open } from "node:fs/promises";

const DEFAULT_CHUNK_BYTES = 64 * 1024;

export interface RecentJsonlResult<T> {
  items: T[];
  bytesRead: number;
}

/**
 * Read recent JSONL records newest-first without scanning the whole append-only
 * log. Invalid or blank lines are skipped while the reader continues backward.
 */
export async function readRecentJsonl<T>(
  path: string,
  limit: number,
  chunkBytes = DEFAULT_CHUNK_BYTES,
): Promise<RecentJsonlResult<T>> {
  const boundedLimit = Math.max(1, Math.floor(limit));
  const boundedChunkBytes = Math.max(1024, Math.floor(chunkBytes));
  const handle = await open(path, "r");

  try {
    const { size } = await handle.stat();
    const items: T[] = [];
    let position = size;
    let carry = Buffer.alloc(0);
    let bytesRead = 0;

    const consume = (line: Buffer) => {
      const text = line.toString("utf8").trim();
      if (!text) return;
      try {
        items.push(JSON.parse(text) as T);
      } catch {
        // Ignore malformed entries and keep looking for valid records.
      }
    };

    while (position > 0 && items.length < boundedLimit) {
      const readLength = Math.min(boundedChunkBytes, position);
      position -= readLength;
      const chunk = Buffer.allocUnsafe(readLength);
      const read = await handle.read(chunk, 0, readLength, position);
      bytesRead += read.bytesRead;

      const prefix = chunk.subarray(0, read.bytesRead);
      const combined = carry.length > 0 ? Buffer.concat([prefix, carry]) : prefix;
      let lineEnd = combined.length;

      for (let index = combined.length - 1; index >= 0; index -= 1) {
        if (combined[index] !== 0x0a) continue;
        consume(combined.subarray(index + 1, lineEnd));
        lineEnd = index;
        if (items.length >= boundedLimit) break;
      }

      carry = combined.subarray(0, lineEnd);
    }

    if (position === 0 && items.length < boundedLimit && carry.length > 0) {
      consume(carry);
    }

    return { items: items.slice(0, boundedLimit), bytesRead };
  } finally {
    await handle.close();
  }
}

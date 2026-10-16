import fs from "node:fs";

function failure(code, message, size) {
  const error = new Error(message);
  error.code = code;
  error.size = size;
  return error;
}

// Caller owns/trusts the parent directory. Do not validate one pathname inode
// then reopen another, follow leaf symlinks, or block on a named pipe.
export function readReleaseFileSnapshot(path, { maxBytes = Infinity } = {}) {
  if (maxBytes !== Infinity && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) throw new Error("Invalid release file size limit.");
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile()) throw failure("RELEASE_FILE_NOT_REGULAR", "Release evidence must be a regular file.");
    if (before.size > maxBytes) throw failure("RELEASE_FILE_TOO_LARGE", "Release file exceeds its size limit.", before.size);
    const chunks = [];
    let size = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes - size + 1));
      const count = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      size += count;
      if (size > maxBytes) throw failure("RELEASE_FILE_TOO_LARGE", "Release file exceeds its size limit.", size);
      chunks.push(chunk.subarray(0, count));
    }
    const after = fs.fstatSync(fd);
    if (size !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw failure("RELEASE_FILE_CHANGED", "Release file changed during validation; regenerate the evidence.");
    }
    return { buffer: Buffer.concat(chunks, size), stat: after };
  } finally { fs.closeSync(fd); }
}

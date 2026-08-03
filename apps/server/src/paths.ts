import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { ApiError } from "./errors.js";

export function assertAbsolute(path: string): void {
  if (!isAbsolute(path)) {
    throw new ApiError(400, "invalid_path", "Path must be absolute");
  }
}

export async function resolveWithinRoot(root: string, ...segments: string[]): Promise<string> {
  const resolvedRoot = await realpath(root);
  const candidate = resolve(resolvedRoot, ...segments);
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + sep)) {
    throw new ApiError(400, "path_escape", "Path escapes workspace root");
  }

  let existingAncestor = candidate;
  while (true) {
    try {
      const resolvedAncestor = await realpath(existingAncestor);
      if (resolvedAncestor !== resolvedRoot && !resolvedAncestor.startsWith(resolvedRoot + sep)) {
        throw new ApiError(400, "path_escape", "Path escapes workspace root through a symbolic link");
      }
      break;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const parent = dirname(existingAncestor);
      if (parent === existingAncestor) throw error;
      existingAncestor = parent;
    }
  }
  return candidate;
}

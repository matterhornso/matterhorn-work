import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

function contained(root: string, path: string): boolean {
  const child = relative(root, path);
  return child === "" || (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`));
}

/** Resolve existing links, including parent links, before authorizing a path.
 * Missing leaves are allowed for creation, but dangling links fail closed.
 */
function canonicalPath(path: string): string {
  try {
    lstatSync(path);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return resolve(canonicalPath(parent), relative(parent, path));
  }
  return realpathSync(path);
}

export function resolveConfinedWorkspacePath(workspace: string, path: string): string {
  const lexicalRoot = resolve(workspace);
  const root = realpathSync(lexicalRoot);
  const input = resolve(lexicalRoot, path);
  // macOS /var and /tmp aliases (or an explicitly configured workspace link)
  // may differ from the canonical root without expanding its authority.
  const requested = contained(lexicalRoot, input) ? resolve(root, relative(lexicalRoot, input)) : input;
  if (!contained(root, requested)) throw new Error("Path is outside the authorized workspace");
  const canonical = canonicalPath(requested);
  if (!contained(root, canonical)) throw new Error("Path resolves outside the authorized workspace");
  return canonical;
}
